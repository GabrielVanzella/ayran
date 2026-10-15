"""Projetos e Git: conecta repositorios (GitHub ou pasta local) e mostra atividade, commits, PRs e quem fez o que.

So leitura: o Ayran nunca escreve nos repositorios. Conectar/remover projeto e configurar o token e do administrador.
O token do GitHub (opcional: repositorios privados e limite maior de chamadas) fica no servidor, fora do git, e nunca volta pela API.
"""

import asyncio
import json
import os
import re
import subprocess
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

GH = "https://api.github.com"
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")
OWNER_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
CACHE_TTL = 300
_cache: dict[str, tuple[float, dict]] = {}

SCHEMA = """
create table if not exists projects (
    id text primary key, name text not null, kind text not null, ref text not null,
    description text default '', language text default '', created_at integer, unique(kind, ref)
);
"""


def init_projects_db(conn):
    conn.executescript(SCHEMA)


class ProjectIn(BaseModel):
    kind: str  # github | local
    ref: str = Field(min_length=1, max_length=300)  # owner/repo ou caminho da pasta
    name: str | None = Field(default=None, max_length=80)


class TokenIn(BaseModel):
    token: str = Field(default="", max_length=200)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _age_days(iso: str | None) -> int | None:
    if not iso:
        return None
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return max(0, (datetime.now(timezone.utc) - d).days)
    except ValueError:
        return None


def _status(days: int | None) -> str:
    if days is None:
        return "sem-atividade"
    return "ativo" if days <= 7 else "morno" if days <= 30 else "parado"


# ------------------------------------------------------------------ local (git na maquina do servidor)
def _git(path: str, *args: str) -> str:
    r = subprocess.run(["git", "-C", path, *args], capture_output=True, text=True, timeout=20, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "git falhou")
    return r.stdout


def _valid_local(path: str) -> Path:
    p = Path(path).expanduser()
    if not p.is_absolute() or not p.is_dir() or not (p / ".git").exists():
        raise HTTPException(422, "A pasta precisa existir no servidor e ser um repositório Git (com a pasta .git).")
    return p


def local_overview(path: str, days: int = 30) -> dict:
    since = f"{days}.days.ago"
    sep = "\x1f"
    log = _git(path, "log", f"--since={since}", "-n", "200", f"--pretty=format:%h{sep}%an{sep}%aI{sep}%s")
    commits = []
    for line in log.splitlines():
        parts = line.split(sep)
        if len(parts) == 4:
            commits.append({"sha": parts[0], "author": parts[1], "date": parts[2], "message": parts[3], "url": None})
    last = _git(path, "log", "-1", f"--pretty=format:%aI")
    try:
        branch = _git(path, "rev-parse", "--abbrev-ref", "HEAD").strip()
    except RuntimeError:
        branch = ""
    try:
        dirty = len([x for x in _git(path, "status", "--porcelain").splitlines() if x.strip()])
    except RuntimeError:
        dirty = 0
    remote = ""
    try:
        remote = _git(path, "remote", "get-url", "origin").strip()
    except RuntimeError:
        pass
    return {"branch": branch, "last_commit": last or None, "commits": commits, "uncommitted": dirty, "prs": [], "open_issues": None, "remote": remote, "url": None}


# ------------------------------------------------------------------ GitHub
def _token(secret_file: Path) -> str:
    try:
        return json.loads(secret_file.read_text(encoding="utf-8-sig")).get("github_token", "")
    except (OSError, ValueError):
        return ""


async def gh_get(client: httpx.AsyncClient, path: str, token: str, params: dict | None = None):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "AyranCentral", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        r = await client.get(GH + path, headers=headers, params=params, timeout=20)
    except httpx.HTTPError:
        raise HTTPException(502, "Não consegui falar com o GitHub agora. Verifique a conexão do servidor.")
    if r.status_code == 404:
        raise HTTPException(404, "Repositório não encontrado. Se for privado, configure um token do GitHub.")
    if r.status_code == 401:
        raise HTTPException(422, "O token do GitHub é inválido ou expirou.")
    if r.status_code == 403:
        raise HTTPException(429, "Limite de chamadas do GitHub atingido. Configure um token (aumenta o limite) ou tente mais tarde.")
    if r.status_code >= 400:
        raise HTTPException(502, f"O GitHub respondeu com erro {r.status_code}.")
    return r.json()


async def github_overview(client: httpx.AsyncClient, repo: str, token: str, days: int = 30) -> dict:
    since = _iso(datetime.now(timezone.utc) - timedelta(days=days))
    info, commits_raw, pulls_raw = await asyncio.gather(
        gh_get(client, f"/repos/{repo}", token),
        gh_get(client, f"/repos/{repo}/commits", token, {"since": since, "per_page": 100}),
        gh_get(client, f"/repos/{repo}/pulls", token, {"state": "open", "per_page": 10}),
    )
    commits = [
        {
            "sha": c["sha"][:7],
            "author": (c.get("commit", {}).get("author") or {}).get("name") or (c.get("author") or {}).get("login") or "?",
            "date": (c.get("commit", {}).get("author") or {}).get("date"),
            "message": (c.get("commit", {}).get("message") or "").split("\n")[0],
            "url": c.get("html_url"),
        }
        for c in commits_raw
    ]
    if not commits:  # sem commits na janela: pega o ultimo, so para mostrar "ha quanto tempo"
        last_raw = await gh_get(client, f"/repos/{repo}/commits", token, {"per_page": 1})
        last = ((last_raw[0].get("commit", {}).get("author") or {}).get("date")) if last_raw else None
    else:
        last = commits[0]["date"]
    prs = [
        {"number": p["number"], "title": p["title"], "author": (p.get("user") or {}).get("login", "?"), "age_days": _age_days(p.get("created_at")), "url": p.get("html_url")}
        for p in pulls_raw
    ]
    return {
        "branch": info.get("default_branch"),
        "last_commit": last or info.get("pushed_at"),
        "commits": commits,
        "uncommitted": None,
        "prs": prs,
        "open_issues": max(0, (info.get("open_issues_count") or 0) - len(prs)),
        "remote": info.get("clone_url"),
        "url": info.get("html_url"),
        "description": info.get("description") or "",
        "language": info.get("language") or "",
        "private": bool(info.get("private")),
    }


def summarize(base: dict, ov: dict, days: int = 30) -> dict:
    commits = ov["commits"]
    week_cut = datetime.now(timezone.utc) - timedelta(days=7)

    def when(c):
        try:
            return datetime.fromisoformat(c["date"].replace("Z", "+00:00"))
        except (ValueError, AttributeError, TypeError):
            return None

    week = [c for c in commits if (w := when(c)) and w >= week_cut]
    authors: dict[str, int] = {}
    for c in week:
        authors[c["author"]] = authors.get(c["author"], 0) + 1
    age = _age_days(ov.get("last_commit"))
    return {
        **base,
        **{k: ov.get(k) for k in ("branch", "last_commit", "uncommitted", "open_issues", "remote", "url")},
        "description": ov.get("description") or base.get("description", ""),
        "language": ov.get("language") or base.get("language", ""),
        "private": ov.get("private", False),
        "commits_7d": len(week),
        "commits_30d": len(commits),
        "days_since_commit": age,
        "status": _status(age),
        "prs": ov["prs"],
        "recent": commits[:15],
        "all": commits,
        "authors_7d": sorted(({"name": n, "commits": c} for n, c in authors.items()), key=lambda a: -a["commits"]),
    }


def build_router(db, current_user, secrets_dir: Path) -> APIRouter:
    router = APIRouter(prefix="/api/projects")
    secret_file = secrets_dir / "secrets.json"

    async def admin_only(user=Depends(current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Só o administrador conecta ou remove projetos")
        return user

    def row_to_base(r) -> dict:
        return {"id": r["id"], "name": r["name"], "kind": r["kind"], "ref": r["ref"], "description": r["description"], "language": r["language"]}

    async def overview_of(request: Request, base: dict, days: int = 30, fresh: bool = False) -> dict:
        key = f"{base['id']}:{days}"
        hit = _cache.get(key)
        if hit and not fresh and time.time() - hit[0] < CACHE_TTL:
            return hit[1]
        if base["kind"] == "github":
            ov = await github_overview(request.app.state.http, base["ref"], _token(secret_file), days)
        else:
            try:
                ov = await asyncio.to_thread(local_overview, base["ref"], days)
            except (RuntimeError, OSError, subprocess.SubprocessError) as e:
                raise HTTPException(502, f"Não consegui ler o repositório local: {e}")
        out = summarize(base, ov, days)
        _cache[key] = (time.time(), out)
        return out

    @router.get("")
    async def list_projects(user=Depends(current_user)):
        with db() as conn:
            rows = conn.execute("select * from projects order by created_at").fetchall()
        return [row_to_base(r) for r in rows]

    @router.get("/token")
    async def token_status(admin=Depends(admin_only)):
        return {"configured": bool(_token(secret_file))}

    @router.put("/token")
    async def set_token(body: TokenIn, request: Request, admin=Depends(admin_only)):
        secrets_dir.mkdir(parents=True, exist_ok=True)
        tok = body.token.strip()
        if tok:
            await gh_get(request.app.state.http, "/user", tok)  # confere antes de guardar (422 se invalido)
        data = {}
        try:
            data = json.loads(secret_file.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError):
            pass
        if tok:
            data["github_token"] = tok
        else:
            data.pop("github_token", None)
        secret_file.write_text(json.dumps(data), encoding="utf-8")
        _cache.clear()
        return {"configured": bool(tok)}

    @router.get("/discover")
    async def discover(request: Request, owner: str, admin=Depends(admin_only)):
        if not OWNER_RE.match(owner):
            raise HTTPException(422, "Nome de usuário ou organização inválido")
        token = _token(secret_file)
        client = request.app.state.http
        try:
            data = await gh_get(client, f"/users/{owner}/repos", token, {"per_page": 100, "sort": "pushed"})
        except HTTPException as e:
            if e.status_code != 404:
                raise
            raise HTTPException(404, "Usuário ou organização não encontrado no GitHub.")
        with db() as conn:
            have = {r["ref"].lower() for r in conn.execute("select ref from projects where kind = 'github'")}
        return [
            {"ref": r["full_name"], "name": r["name"], "description": r.get("description") or "", "language": r.get("language") or "",
             "pushed_at": r.get("pushed_at"), "private": r.get("private", False), "connected": r["full_name"].lower() in have}
            for r in data
        ]

    @router.post("")
    async def add_project(body: ProjectIn, request: Request, admin=Depends(admin_only)):
        if body.kind == "github":
            ref = body.ref.strip().removeprefix("https://github.com/").removesuffix(".git").strip("/")
            if not REPO_RE.match(ref):
                raise HTTPException(422, "Use o formato dono/repositório (ex.: GabrielVanzella/ayran)")
            info = await gh_get(request.app.state.http, f"/repos/{ref}", _token(secret_file))
            ref, name, desc, lang = info["full_name"], body.name or info["name"], info.get("description") or "", info.get("language") or ""
        elif body.kind == "local":
            path = _valid_local(body.ref.strip())
            ref, name, desc, lang = str(path), body.name or path.name, "", ""
        else:
            raise HTTPException(422, "Tipo de projeto inválido")
        with db() as conn:
            if conn.execute("select 1 from projects where kind = ? and lower(ref) = lower(?)", (body.kind, ref)).fetchone():
                raise HTTPException(409, "Esse projeto já está conectado")
            pid = uuid.uuid4().hex
            conn.execute("insert into projects (id, name, kind, ref, description, language, created_at) values (?, ?, ?, ?, ?, ?, ?)", (pid, name.strip(), body.kind, ref, desc, lang, int(time.time())))
        return {"id": pid, "name": name, "kind": body.kind, "ref": ref, "description": desc, "language": lang}

    @router.delete("/{project_id}")
    async def remove_project(project_id: str, admin=Depends(admin_only)):
        with db() as conn:
            n = conn.execute("delete from projects where id = ?", (project_id,)).rowcount
        if not n:
            raise HTTPException(404, "Projeto não encontrado")
        for k in [k for k in _cache if k.startswith(project_id)]:
            _cache.pop(k, None)
        return {"ok": True}

    @router.get("/activity")
    async def activity(request: Request, days: int = 1, user=Depends(current_user)):
        """Commits dos ultimos `days` dias em todos os projetos (alimenta o resumo do dia)."""
        return await collect_activity(request, db, days, overview_of)

    @router.get("/{project_id}")
    async def project_detail(project_id: str, request: Request, fresh: bool = False, user=Depends(current_user)):
        with db() as conn:
            r = conn.execute("select * from projects where id = ?", (project_id,)).fetchone()
        if not r:
            raise HTTPException(404, "Projeto não encontrado")
        out = dict(await overview_of(request, row_to_base(r), 30, fresh))
        out.pop("all", None)
        return out

    router.overview_of = overview_of  # usado pelo resumo do dia
    return router


async def collect_activity(request: Request, db, days: int, overview_of) -> dict:
    with db() as conn:
        rows = conn.execute("select * from projects order by created_at").fetchall()
    if not rows:
        return {"connected": 0, "projects": []}
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    results = await asyncio.gather(
        *(overview_of(request, {"id": r["id"], "name": r["name"], "kind": r["kind"], "ref": r["ref"], "description": r["description"], "language": r["language"]}) for r in rows),
        return_exceptions=True,
    )
    out = []
    for r, res in zip(rows, results):
        if isinstance(res, Exception):
            out.append({"id": r["id"], "name": r["name"], "error": getattr(res, "detail", "falha ao ler"), "commits": []})
            continue
        fresh = []
        for c in res["all"]:
            try:
                if datetime.fromisoformat(c["date"].replace("Z", "+00:00")) >= cutoff:
                    fresh.append(c)
            except (ValueError, AttributeError, TypeError):
                continue
        out.append({"id": r["id"], "name": r["name"], "commits": fresh, "prs": res["prs"], "status": res["status"]})
    return {"connected": len(rows), "projects": out}
