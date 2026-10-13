"""Central do Ayran — backend.

- Serve o frontend (hub/frontend/dist)
- /owui/*      proxy pro Open WebUI (login, chat, historico) — a central nao tem contas proprias
- /api/news    noticias por tema (RSS, cache de 15 min)
- /api/ideas   quadro de ideias por usuario
- /api/settings preferencias por usuario (playlist do Spotify, temas)
"""

import asyncio
import json
import os
import re
import sqlite3
import time
import uuid
from calendar import timegm
from contextlib import asynccontextmanager
from pathlib import Path

import feedparser
import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.background import BackgroundTask

from feeds import TOPICS
from cityscenes import build_router as build_city_router
from media import build_router as build_media_router, init_media_db
from system import build_router as build_system_router
from team import build_router as build_team_router
from weather import build_router as build_weather_router

OWUI_URL = os.environ.get("OWUI_URL", "http://127.0.0.1:8080")
AYRAN_HOME = Path(os.environ.get("AYRAN_HOME", Path.home() / "ayran-server"))
DB_PATH = AYRAN_HOME / "hub" / "hub.db"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

NEWS_TTL = 15 * 60
AUTH_TTL = 60
HOP_HEADERS = {"connection", "keep-alive", "transfer-encoding", "upgrade", "host", "te", "trailer"}


# ---------------- banco ----------------

def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript(
            """
            create table if not exists ideas (
                id text primary key, user_id text not null, title text not null, body text default '',
                tag text default '', status text default 'nova', created_at integer, updated_at integer
            );
            create index if not exists ideas_user on ideas(user_id);
            create table if not exists settings (user_id text primary key, data text not null);
            """
        )
        init_media_db(conn)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.http = httpx.AsyncClient(timeout=httpx.Timeout(10, read=None), follow_redirects=False)
    media_worker = asyncio.create_task(media_router.worker())
    city_worker = asyncio.create_task(city_router.worker())
    yield
    media_worker.cancel()
    city_worker.cancel()
    await app.state.http.aclose()


app = FastAPI(title="Central do Ayran", lifespan=lifespan, docs_url=None, redoc_url=None)

# Publicada em vztecnologia.com.br/ayran: o Worker do Cloudflare repassa o caminho inteiro.
# O prefixo e removido aqui, entao o resto do app continua com rotas na raiz (/api, /owui, ...).
BASE_PATH = os.environ.get("AYRAN_BASE_PATH", "/ayran")


@app.middleware("http")
async def strip_base_path(request: Request, call_next):
    path = request.scope["path"]
    if path == "/" or path == BASE_PATH:
        return RedirectResponse(f"{BASE_PATH}/")
    if path.startswith(BASE_PATH + "/"):
        request.scope["path"] = path[len(BASE_PATH):]
    return await call_next(request)


# ---------------- autenticacao (via Open WebUI) ----------------

_auth_cache: dict[str, tuple[float, dict]] = {}


async def current_user(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Sem token")
    token = auth[7:]
    hit = _auth_cache.get(token)
    if hit and time.time() - hit[0] < AUTH_TTL:
        return hit[1]
    r = await request.app.state.http.get(f"{OWUI_URL}/api/v1/auths/", headers={"Authorization": auth})
    if r.status_code != 200:
        raise HTTPException(401, "Sessao invalida")
    user = r.json()
    if user.get("role") == "pending":
        raise HTTPException(403, "Conta aguardando aprovacao do admin")
    _auth_cache[token] = (time.time(), user)
    return user


# ---------------- proxy Open WebUI ----------------

# Só o que a central usa passa pelo proxy: a central fica exposta na internet,
# entao cadastro, admin e configuracoes do Open WebUI nao podem ser alcancados por aqui.
OWUI_ALLOWED = [
    ("POST", re.compile(r"api/v1/auths/signin")),
    ("GET", re.compile(r"api/v1/auths/?")),
    ("GET", re.compile(r"health")),
    ("POST", re.compile(r"api/chat/completions")),
    ("GET", re.compile(r"api/v1/chats/list")),
    ("POST", re.compile(r"api/v1/chats/new")),
    ("GET|POST|DELETE", re.compile(r"api/v1/chats/[0-9a-f-]{36}")),
]


LOGIN_WINDOW = 15 * 60
LOGIN_MAX_FAILS = 8
_login_fails: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    # atras do Cloudflare Tunnel o IP real vem nesse header
    return request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "?")


@app.api_route("/owui/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def owui_proxy(path: str, request: Request):
    if not any(request.method in methods.split("|") and rx.fullmatch(path) for methods, rx in OWUI_ALLOWED):
        raise HTTPException(404, "Nao encontrado")

    is_signin = path == "api/v1/auths/signin"
    if is_signin:
        ip = _client_ip(request)
        recent = [t for t in _login_fails.get(ip, []) if time.time() - t < LOGIN_WINDOW]
        _login_fails[ip] = recent
        if len(recent) >= LOGIN_MAX_FAILS:
            raise HTTPException(429, "Muitas tentativas de login. Tente de novo em alguns minutos.")

    client: httpx.AsyncClient = request.app.state.http
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_HEADERS}
    req = client.build_request(
        request.method,
        f"{OWUI_URL}/{path}",
        params=request.query_params,
        headers=headers,
        content=await request.body(),
    )
    r = await client.send(req, stream=True)
    if is_signin and r.status_code != 200:
        _login_fails[ip].append(time.time())
    out_headers = {k: v for k, v in r.headers.items() if k.lower() not in HOP_HEADERS}
    return StreamingResponse(r.aiter_raw(), status_code=r.status_code, headers=out_headers,
                             background=BackgroundTask(r.aclose))


# ---------------- imagem / video ----------------

media_router = build_media_router(db, current_user, AYRAN_HOME / "hub" / "media")
app.include_router(media_router)
city_router = build_city_router(current_user, lambda uid: _stored_settings(uid).get("location"), AYRAN_HOME / "hub")
app.include_router(city_router)
app.include_router(build_weather_router(current_user))
app.include_router(build_system_router(current_user))
def forget_user(user_id: str):
    for token, (_, u) in list(_auth_cache.items()):
        if u.get("id") == user_id:
            _auth_cache.pop(token, None)


app.include_router(build_team_router(current_user, forget_user))


# ---------------- login automatico (so no proprio servidor) ----------------

LOCAL_CREDS = AYRAN_HOME / "local-admin.json"
LOOPBACK = {"127.0.0.1", "::1"}


@app.post("/api/auto-login")
async def auto_login(request: Request):
    """Entra como admin sem senha quando a central e aberta no proprio servidor.
    Pelo tunel (Cloudflare) a conexao tambem chega de 127.0.0.1, mas sempre com cf-connecting-ip: bloqueado."""
    local = request.client and request.client.host in LOOPBACK
    via_tunnel = any(h in request.headers for h in ("cf-connecting-ip", "x-forwarded-for", "cf-ray"))
    if not local or via_tunnel or not LOCAL_CREDS.exists():
        raise HTTPException(403, "Login automatico so funciona no proprio servidor")
    creds = json.loads(LOCAL_CREDS.read_text(encoding="utf-8"))
    r = await request.app.state.http.post(f"{OWUI_URL}/api/v1/auths/signin", json=creds)
    if r.status_code != 200:
        raise HTTPException(502, "Credenciais locais invalidas (rode server/reset-admin-password.py)")
    return r.json()


# ---------------- noticias ----------------

_news_cache: dict[str, tuple[float, list]] = {}


async def _fetch_feed(client: httpx.AsyncClient, url: str, topic: str) -> list[dict]:
    try:
        r = await client.get(url, timeout=10, follow_redirects=True,
                             headers={"User-Agent": "Mozilla/5.0 (Ayran Central)"})
        parsed = feedparser.parse(r.content)
    except Exception:
        return []
    source_default = parsed.feed.get("title", "")
    items = []
    for e in parsed.entries[:25]:
        title = e.get("title", "").strip()
        source = e.get("source", {}).get("title") if isinstance(e.get("source"), dict) else None
        if not source and " - " in title and "news.google" in url:
            title, source = title.rsplit(" - ", 1)
        ts = e.get("published_parsed") or e.get("updated_parsed")
        items.append({
            "title": title,
            "link": e.get("link", ""),
            "source": source or source_default,
            "published": timegm(ts) if ts else 0,
            "topic": topic,
        })
    return items


async def _topic_news(client: httpx.AsyncClient, topic: str) -> list[dict]:
    hit = _news_cache.get(topic)
    if hit and time.time() - hit[0] < NEWS_TTL:
        return hit[1]
    results = await asyncio.gather(*[_fetch_feed(client, u, topic) for u in TOPICS[topic]["feeds"]])
    seen, items = set(), []
    for item in sorted((i for r in results for i in r), key=lambda i: i["published"], reverse=True):
        key = item["title"].lower()[:80]
        if key and key not in seen:
            seen.add(key)
            items.append(item)
    items = items[:40]
    if items:
        _news_cache[topic] = (time.time(), items)
    return items


@app.get("/api/news/topics")
async def news_topics(user=Depends(current_user)):
    return [{"id": k, "label": v["label"]} for k, v in TOPICS.items()]


@app.get("/api/news")
async def news(request: Request, topic: str = "all", user=Depends(current_user)):
    topics = list(TOPICS) if topic == "all" else [topic]
    if any(t not in TOPICS for t in topics):
        raise HTTPException(404, "Tema desconhecido")
    lists = await asyncio.gather(*[_topic_news(request.app.state.http, t) for t in topics])
    merged = sorted((i for lst in lists for i in lst), key=lambda i: i["published"], reverse=True)
    return merged[:60]


# ---------------- ideias ----------------

class IdeaIn(BaseModel):
    title: str
    body: str = ""
    tag: str = ""
    status: str = "nova"


class IdeaPatch(BaseModel):
    title: str | None = None
    body: str | None = None
    tag: str | None = None
    status: str | None = None


@app.get("/api/ideas")
async def list_ideas(user=Depends(current_user)):
    with db() as conn:
        rows = conn.execute(
            "select * from ideas where user_id = ? order by updated_at desc", (user["id"],)
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/ideas")
async def create_idea(idea: IdeaIn, user=Depends(current_user)):
    now = int(time.time())
    row = {"id": uuid.uuid4().hex, "user_id": user["id"], **idea.model_dump(),
           "created_at": now, "updated_at": now}
    with db() as conn:
        conn.execute(
            "insert into ideas values (:id, :user_id, :title, :body, :tag, :status, :created_at, :updated_at)",
            row,
        )
    return row


@app.patch("/api/ideas/{idea_id}")
async def update_idea(idea_id: str, patch: IdeaPatch, user=Depends(current_user)):
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    fields["updated_at"] = int(time.time())
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    with db() as conn:
        n = conn.execute(
            f"update ideas set {sets} where id = :id and user_id = :uid",
            {**fields, "id": idea_id, "uid": user["id"]},
        ).rowcount
        if not n:
            raise HTTPException(404, "Ideia nao encontrada")
        return dict(conn.execute("select * from ideas where id = ?", (idea_id,)).fetchone())


@app.delete("/api/ideas/{idea_id}")
async def delete_idea(idea_id: str, user=Depends(current_user)):
    with db() as conn:
        conn.execute("delete from ideas where id = ? and user_id = ?", (idea_id, user["id"]))
    return {"ok": True}


# ---------------- preferencias ----------------

DEFAULT_SETTINGS = {
    "spotify": "https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn",  # lofi beats
    "topics": list(TOPICS),
    "location": None,  # {"name": "São Paulo", "lat": -23.55, "lon": -46.63}; vazio = ainda nao escolhida
}


def _stored_settings(user_id: str) -> dict:
    with db() as conn:
        row = conn.execute("select data from settings where user_id = ?", (user_id,)).fetchone()
    return json.loads(row["data"]) if row else {}


@app.get("/api/settings")
async def get_settings(user=Depends(current_user)):
    return {**DEFAULT_SETTINGS, **_stored_settings(user["id"])}


@app.put("/api/settings")
async def put_settings(data: dict, user=Depends(current_user)):
    updates = {k: v for k, v in data.items() if k in DEFAULT_SETTINGS}
    loc = updates.get("location")
    if loc is not None and not (
        isinstance(loc, dict) and isinstance(loc.get("lat"), (int, float)) and isinstance(loc.get("lon"), (int, float))
    ):
        raise HTTPException(400, "Localização inválida")
    merged = {**_stored_settings(user["id"]), **updates}  # nao apaga o que nao foi enviado
    with db() as conn:
        conn.execute(
            "insert into settings values (?, ?) on conflict(user_id) do update set data = excluded.data",
            (user["id"], json.dumps(merged)),
        )
    return {**DEFAULT_SETTINGS, **merged}


# ---------------- frontend ----------------

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}")
async def spa(path: str):
    file = DIST / path
    if path and file.is_file() and DIST in file.resolve().parents:
        return FileResponse(file)
    index = DIST / "index.html"
    if not index.exists():
        raise HTTPException(503, "Frontend ainda nao foi compilado (npm run build em hub/frontend)")
    return FileResponse(index)
