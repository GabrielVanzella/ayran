"""Escritorio do Ayran: e-mail, agenda e sinais de negocio.

O e-mail usa um provedor de EXEMPLO (samples.py) com o analisador de golpes real (scam.py). Quando o Microsoft 365 /
Gmail for conectado, so a fonte das mensagens muda: a analise, a caixa de entrada e a Home continuam iguais.
A agenda e real (guardada no servidor); na primeira vez vem com compromissos de exemplo, marcados como tal.
"""

import json
import time
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import samples
from scam import analyze

SCHEMA = """
create table if not exists mails (
    id text primary key, user_id text not null, from_addr text, from_name text, subject text, body text, raw text,
    received_at integer, read integer default 0, verdict text, score integer, analysis text, demo integer default 1
);
create index if not exists mails_user on mails(user_id, received_at);
create table if not exists events (
    id text primary key, user_id text not null, title text not null, start text not null, end text not null,
    place text default '', notes text default '', demo integer default 0, created_at integer
);
create index if not exists events_user on events(user_id, start);
create table if not exists office_seed (user_id text not null, kind text not null, primary key (user_id, kind));
"""


def init_office_db(conn):
    conn.executescript(SCHEMA)


class AnalyzeIn(BaseModel):
    text: str = Field(min_length=3, max_length=60_000)


class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    start: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
    place: str = Field(default="", max_length=120)
    notes: str = Field(default="", max_length=1000)


class EventPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    start: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
    end: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
    place: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


def _mail_row(m: dict, user_id: str, now: int) -> dict:
    from email.utils import parseaddr

    raw = samples.raw_email(m)
    a = analyze(raw)
    name, addr = parseaddr(m["from"])
    return {
        "id": uuid.uuid4().hex,
        "user_id": user_id,
        "from_addr": addr,
        "from_name": name or addr,
        "subject": m["subject"],
        "body": m["body"],
        "raw": raw,
        "received_at": now - m.get("minutes_ago", 0) * 60,
        "read": 0,
        "verdict": a["verdict"],
        "score": a["score"],
        "analysis": json.dumps(a, ensure_ascii=False),
        "demo": 1,
    }


def _mail_out(r) -> dict:
    d = dict(r)
    d["analysis"] = json.loads(d["analysis"]) if d.get("analysis") else None
    d["read"] = bool(d["read"])
    d["demo"] = bool(d["demo"])
    d.pop("raw", None)
    d.pop("user_id", None)
    return d


def _insert(conn, table: str, row: dict):
    cols = ", ".join(row)
    vals = ", ".join(f":{k}" for k in row)
    conn.execute(f"insert into {table} ({cols}) values ({vals})", row)


def _overlaps(a: dict, b: dict) -> bool:
    return a["start"] < b["end"] and b["start"] < a["end"]


def build_router(db, current_user) -> APIRouter:
    router = APIRouter(prefix="/api")

    # ------------------------------------------------------------ e-mail
    def seed_mail(conn, user_id: str):
        if conn.execute("select 1 from office_seed where user_id = ? and kind = 'mail'", (user_id,)).fetchone():
            return
        now = int(time.time())
        for m in samples.MAILS:
            _insert(conn, "mails", _mail_row(m, user_id, now))
        conn.execute("insert into office_seed values (?, 'mail')", (user_id,))

    @router.get("/mail")
    async def list_mail(user=Depends(current_user)):
        with db() as conn:
            seed_mail(conn, user["id"])
            rows = conn.execute("select * from mails where user_id = ? order by received_at desc", (user["id"],)).fetchall()
        return [_mail_out(r) for r in rows]

    @router.post("/mail/simulate")
    async def simulate_mail(user=Depends(current_user)):
        """Faz um e-mail de exemplo 'chegar' agora (demonstracao)."""
        with db() as conn:
            seed_mail(conn, user["id"])
            n = conn.execute("select count(*) from mails where user_id = ? and demo = 1", (user["id"],)).fetchone()[0] - len(samples.MAILS)
            m = samples.INCOMING[max(0, n) % len(samples.INCOMING)]
            row = _mail_row({**m, "minutes_ago": 0}, user["id"], int(time.time()))
            _insert(conn, "mails", row)
        return _mail_out(row)

    @router.post("/mail/{mail_id}/read")
    async def read_mail(mail_id: str, user=Depends(current_user)):
        with db() as conn:
            n = conn.execute("update mails set read = 1 where id = ? and user_id = ?", (mail_id, user["id"])).rowcount
        if not n:
            raise HTTPException(404, "E-mail não encontrado")
        return {"ok": True}

    @router.delete("/mail/{mail_id}")
    async def delete_mail(mail_id: str, user=Depends(current_user)):
        with db() as conn:
            n = conn.execute("delete from mails where id = ? and user_id = ?", (mail_id, user["id"])).rowcount
        if not n:
            raise HTTPException(404, "E-mail não encontrado")
        return {"ok": True}

    @router.post("/scam/analyze")
    async def scam_analyze(body: AnalyzeIn, user=Depends(current_user)):
        return analyze(body.text)

    # ------------------------------------------------------------ agenda
    def seed_agenda(conn, user_id: str):
        if conn.execute("select 1 from office_seed where user_id = ? and kind = 'agenda'", (user_id,)).fetchone():
            return
        now = int(time.time())
        for e in samples.agenda_for(datetime.now()):
            _insert(conn, "events", {"id": uuid.uuid4().hex, "user_id": user_id, **e, "demo": 1, "created_at": now})
        conn.execute("insert into office_seed values (?, 'agenda')", (user_id,))

    def with_conflicts(rows: list[dict]) -> list[dict]:
        for e in rows:
            e["conflicts"] = [o["id"] for o in rows if o["id"] != e["id"] and _overlaps(e, o)]
            e["demo"] = bool(e["demo"])
        return rows

    @router.get("/agenda")
    async def list_agenda(start: str | None = None, days: int = 14, user=Depends(current_user)):
        first = start or date.today().isoformat()
        try:
            last = (date.fromisoformat(first) + timedelta(days=max(1, min(days, 90)))).isoformat()
        except ValueError:
            raise HTTPException(422, "Data inválida")
        with db() as conn:
            seed_agenda(conn, user["id"])
            rows = conn.execute(
                "select id, title, start, end, place, notes, demo from events where user_id = ? and end > ? and start < ? order by start",
                (user["id"], first + "T00:00", last + "T00:00"),
            ).fetchall()
        return with_conflicts([dict(r) for r in rows])

    @router.post("/agenda")
    async def create_event(e: EventIn, user=Depends(current_user)):
        if e.end <= e.start:
            raise HTTPException(422, "O fim precisa ser depois do início")
        row = {"id": uuid.uuid4().hex, "user_id": user["id"], **e.model_dump(), "demo": 0, "created_at": int(time.time())}
        with db() as conn:
            _insert(conn, "events", row)
        return {k: v for k, v in row.items() if k not in ("user_id", "created_at")} | {"conflicts": []}

    @router.patch("/agenda/{event_id}")
    async def update_event(event_id: str, patch: EventPatch, user=Depends(current_user)):
        fields = patch.model_dump(exclude_unset=True)
        if not fields:
            raise HTTPException(422, "Nada para alterar")
        with db() as conn:
            cur = conn.execute("select start, end from events where id = ? and user_id = ?", (event_id, user["id"])).fetchone()
            if not cur:
                raise HTTPException(404, "Compromisso não encontrado")
            if fields.get("end", cur["end"]) <= fields.get("start", cur["start"]):
                raise HTTPException(422, "O fim precisa ser depois do início")
            sets = ", ".join(f"{k} = :{k}" for k in fields)
            conn.execute(f"update events set {sets}, demo = 0 where id = :id and user_id = :user_id", {**fields, "id": event_id, "user_id": user["id"]})
            row = conn.execute("select id, title, start, end, place, notes, demo from events where id = ?", (event_id,)).fetchone()
        return with_conflicts([dict(row)])[0]

    @router.delete("/agenda/{event_id}")
    async def delete_event(event_id: str, user=Depends(current_user)):
        with db() as conn:
            n = conn.execute("delete from events where id = ? and user_id = ?", (event_id, user["id"])).rowcount
        if not n:
            raise HTTPException(404, "Compromisso não encontrado")
        return {"ok": True}

    # ------------------------------------------------------------ negocio
    @router.get("/insights")
    async def insights(user=Depends(current_user)):
        """Sinais para a diretoria. Os de 'real' vem dos dados da propria plataforma; os de 'exemplo' simulam sistemas ainda nao conectados."""
        today = date.today().isoformat()
        items: list[dict] = []
        with db() as conn:
            seed_mail(conn, user["id"])
            seed_agenda(conn, user["id"])
            late = conn.execute("select count(*) from tasks where user_id = ? and status != 'concluida' and due_date < ?", (user["id"], today)).fetchone()[0]
            due = conn.execute("select count(*) from tasks where user_id = ? and status != 'concluida' and due_date = ?", (user["id"], today)).fetchone()[0]
            risky = conn.execute("select count(*) from mails where user_id = ? and verdict = 'bad'", (user["id"],)).fetchone()[0]
            unread = conn.execute("select count(*) from mails where user_id = ? and read = 0 and verdict = 'ok'", (user["id"],)).fetchone()[0]
            evs = [dict(r) for r in conn.execute(
                "select id, title, start, end from events where user_id = ? and start >= ? and start < ? order by start",
                (user["id"], today + "T00:00", (date.today() + timedelta(days=1)).isoformat() + "T00:00"),
            )]
        conflicts = [(a, b) for i, a in enumerate(evs) for b in evs[i + 1:] if _overlaps(a, b)]
        if late:
            items.append({"id": "tasks-late", "tone": "bad", "source": "real", "title": f"{late} tarefa{'s' if late > 1 else ''} atrasada{'s' if late > 1 else ''}",
                          "body": "Vale reorganizar os prazos ou concluir o que já foi feito.", "action": {"kind": "go", "tab": "tasks", "label": "Ver tarefas"}})
        if due:
            items.append({"id": "tasks-today", "tone": "warn", "source": "real", "title": f"{due} tarefa{'s' if due > 1 else ''} para hoje",
                          "body": "Priorize antes das reuniões.", "action": {"kind": "go", "tab": "tasks", "label": "Ver tarefas"}})
        for a, b in conflicts:
            items.append({"id": f"conf-{a['id']}", "tone": "warn", "source": "real", "title": "Conflito na agenda de hoje",
                          "body": f"“{a['title']}” e “{b['title']}” se sobrepõem.", "action": {"kind": "go", "tab": "agenda", "label": "Ver agenda"}})
        if risky:
            items.append({"id": "mail-risk", "tone": "bad", "source": "real", "title": f"{risky} e-mail{'s' if risky > 1 else ''} com cara de golpe",
                          "body": "O Ayran separou e explicou o motivo. Não clique em links desses e-mails.", "action": {"kind": "go", "tab": "mail", "label": "Ver e-mails"}})
        if unread:
            items.append({"id": "mail-unread", "tone": "info", "source": "real", "title": f"{unread} e-mail{'s' if unread > 1 else ''} seguro{'s' if unread > 1 else ''} não lido{'s' if unread > 1 else ''}",
                          "body": "Inclui a aprovação da proposta do Cliente ABC.", "action": {"kind": "go", "tab": "mail", "label": "Abrir caixa"}})
        items += [
            {"id": "ex-proposals", "tone": "bad", "source": "exemplo", "title": "3 propostas paradas há mais de 14 dias",
             "body": "R$ 84 mil em aberto. O Ayran pode redigir o follow-up de cada uma.", "action": {"kind": "ask", "label": "Pedir follow-ups",
             "prompt": "Redija três mensagens curtas e cordiais de follow-up para clientes com propostas paradas há mais de 14 dias, no valor total de R$ 84 mil."}},
            {"id": "ex-contract", "tone": "warn", "source": "exemplo", "title": "Contrato do Cliente ABC vence em 30 dias",
             "body": "Ainda não há conversa de renovação registrada.", "action": {"kind": "task", "label": "Criar tarefa", "title": "Conversar sobre renovação do contrato do Cliente ABC"}},
            {"id": "ex-pattern", "tone": "info", "source": "exemplo", "title": "58% das vendas acontecem na última semana do mês",
             "body": "Há espaço para antecipar campanhas e suavizar o caixa.", "action": {"kind": "ask", "label": "Sugerir ações",
             "prompt": "Minhas vendas se concentram (58%) na última semana do mês. Sugira cinco ações práticas para distribuí-las melhor ao longo do mês."}},
            {"id": "ex-support", "tone": "warn", "source": "exemplo", "title": "Chamados sobre “login” cresceram 3x depois da atualização de terça",
             "body": "Pode haver uma regressão na tela de entrada.", "action": {"kind": "task", "label": "Criar tarefa", "title": "Investigar aumento de chamados de login após a atualização"}},
        ]
        return {
            "items": items,
            "kpis": [
                {"label": "Receita do mês", "value": "R$ 212 mil", "delta": "+12%", "source": "exemplo"},
                {"label": "Propostas em aberto", "value": "14", "delta": "R$ 340 mil", "source": "exemplo"},
                {"label": "Chamados abertos", "value": "27", "delta": "-4", "source": "exemplo"},
                {"label": "Entregas no prazo", "value": "91%", "delta": "+3 pts", "source": "exemplo"},
            ],
            "weekly_sales": [{"label": "Semana 1", "value": 38}, {"label": "Semana 2", "value": 44}, {"label": "Semana 3", "value": 41}, {"label": "Semana 4", "value": 72}],
        }

    # ------------------------------------------------------------ demonstracao
    @router.post("/demo/reset")
    async def demo_reset(user=Depends(current_user)):
        """Volta os dados de EXEMPLO ao estado inicial (para apresentacoes e prints). Nao mexe no que a pessoa criou de verdade,
        exceto: se ela nao tem nenhuma tarefa, entram tarefas de exemplo."""
        uid = user["id"]
        with db() as conn:
            conn.execute("delete from mails where user_id = ? and demo = 1", (uid,))
            conn.execute("delete from events where user_id = ? and demo = 1", (uid,))
            conn.execute("delete from office_seed where user_id = ?", (uid,))
            seed_mail(conn, uid)
            seed_agenda(conn, uid)
            if not conn.execute("select 1 from tasks where user_id = ? limit 1", (uid,)).fetchone():
                now = int(time.time())
                for title, details, offset, status in samples.TASKS:
                    conn.execute(
                        "insert into tasks (id, user_id, title, details, due_date, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
                        (uuid.uuid4().hex, uid, title, details, (date.today() + timedelta(days=offset)).isoformat(), status, now, now),
                    )
        return {"ok": True}

    # ------------------------------------------------------------ resumo do dia
    @router.get("/briefing")
    async def briefing(user=Depends(current_user)):
        """Mensagem diaria para o gestor: o que andou ontem e o que importa hoje.
        Tarefas, e-mails e agenda saem dos dados reais da plataforma; o andamento dos projetos e 'exemplo' (Git ainda nao conectado)."""
        now = datetime.now()
        today = date.today()
        yesterday = today - timedelta(days=1)
        y_start = int(datetime.combine(yesterday, datetime.min.time()).timestamp())
        y_end = y_start + 86400
        with db() as conn:
            seed_mail(conn, user["id"])
            seed_agenda(conn, user["id"])
            done_y = conn.execute("select count(*) from tasks where user_id = ? and status = 'concluida' and updated_at >= ? and updated_at < ?", (user["id"], y_start, y_end)).fetchone()[0]
            due_today = conn.execute("select count(*) from tasks where user_id = ? and status != 'concluida' and due_date = ?", (user["id"], today.isoformat())).fetchone()[0]
            late = conn.execute("select count(*) from tasks where user_id = ? and status != 'concluida' and due_date < ?", (user["id"], today.isoformat())).fetchone()[0]
            risky = conn.execute("select count(*) from mails where user_id = ? and verdict = 'bad'", (user["id"],)).fetchone()[0]
            to_answer = conn.execute("select count(*) from mails where user_id = ? and verdict = 'ok' and read = 0", (user["id"],)).fetchone()[0]
            evs = [dict(r) for r in conn.execute(
                "select id, title, start, end from events where user_id = ? and start >= ? and start < ? order by start",
                (user["id"], today.isoformat() + "T00:00", (today + timedelta(days=1)).isoformat() + "T00:00"),
            )]
        conflicts = sum(1 for i, a in enumerate(evs) for b in evs[i + 1:] if _overlaps(a, b))
        first = (user.get("name") or "").split(" ")[0] or "tudo bem"
        hello = "Bom dia" if now.hour < 12 else "Boa tarde" if now.hour < 18 else "Boa noite"

        dev = [
            {"text": "Portal do Cliente ABC: módulo de checkout concluído e em revisão (Douglas).", "progress": 72, "delta": "+8 pts"},
            {"text": "App de entregas: correção do cálculo de frete publicada em produção.", "progress": 100, "delta": "entregue"},
            {"text": "Ayran: e-mail, agenda e resumo diário integrados à Central.", "progress": 58, "delta": "+15 pts"},
        ]
        mine: list[dict] = []
        if done_y:
            mine.append({"text": f"Você concluiu {done_y} tarefa{'s' if done_y > 1 else ''} ontem."})
        if due_today:
            mine.append({"text": f"{due_today} tarefa{'s' if due_today > 1 else ''} com prazo para hoje."})
        if late:
            mine.append({"text": f"{late} tarefa{'s' if late > 1 else ''} atrasada{'s' if late > 1 else ''}.", "tone": "bad"})
        if evs:
            first_ev = evs[0]
            mine.append({"text": f"{len(evs)} compromisso{'s' if len(evs) > 1 else ''} hoje; o primeiro é às {first_ev['start'][11:16]} ({first_ev['title']})."})
        if conflicts:
            mine.append({"text": f"Atenção: {conflicts} conflito{'s' if conflicts > 1 else ''} de horário na agenda de hoje.", "tone": "warn"})
        if risky:
            mine.append({"text": f"{risky} e-mail{'s' if risky > 1 else ''} com cara de golpe foram separados para você.", "tone": "bad"})
        if to_answer:
            mine.append({"text": f"{to_answer} e-mail{'s' if to_answer > 1 else ''} seguro{'s' if to_answer > 1 else ''} aguardando resposta."})
        if not mine:
            mine.append({"text": "Nada pendente por enquanto. Bom dia tranquilo!"})
        attention = [
            {"text": "3 propostas paradas há mais de 14 dias (R$ 84 mil em aberto).", "tone": "bad"},
            {"text": "O contrato do Cliente ABC vence em 30 dias e ainda não há conversa de renovação.", "tone": "warn"},
        ]
        sections = [
            {"id": "dev", "title": "Ontem no desenvolvimento", "source": "exemplo", "items": dev},
            {"id": "me", "title": "Para você hoje", "source": "real", "items": mine},
            {"id": "att", "title": "Pontos de atenção", "source": "exemplo", "items": attention},
        ]
        speak = f"{hello}, {first}. Ontem, no desenvolvimento: " + " ".join(i["text"] for i in dev) + " Para você hoje: " + " ".join(i["text"] for i in mine) + " Pontos de atenção: " + " ".join(i["text"] for i in attention)
        return {"greeting": f"{hello}, {first}.", "sections": sections, "speak": speak, "generated_at": int(time.time())}

    # ------------------------------------------------------------ notificacoes
    @router.get("/notifications")
    async def notifications(user=Depends(current_user)):
        """Central de avisos: tudo o que pede atencao, de e-mail, tarefas, agenda e negocio. 'real' vem da plataforma; 'exemplo' simula sistemas nao conectados."""
        now = datetime.now()
        today = date.today().isoformat()
        out: list[dict] = []
        with db() as conn:
            seed_mail(conn, user["id"])
            seed_agenda(conn, user["id"])
            for m in conn.execute("select id, from_name, subject, received_at, verdict from mails where user_id = ? and read = 0 order by received_at desc limit 12", (user["id"],)):
                bad = m["verdict"] == "bad"
                warn = m["verdict"] == "warn"
                out.append({
                    "id": f"mail-{m['id']}", "kind": "mail", "tone": "bad" if bad else "warn" if warn else "info", "source": "real",
                    "title": ("E-mail com cara de golpe" if bad else "E-mail suspeito" if warn else "Novo e-mail") + f" de {m['from_name']}",
                    "body": m["subject"], "ts": m["received_at"], "target": {"tab": "mail", "id": m["id"]},
                })
            late = conn.execute("select count(*) from tasks where user_id = ? and status != 'concluida' and due_date < ?", (user["id"], today)).fetchone()[0]
            due = conn.execute("select count(*) from tasks where user_id = ? and status != 'concluida' and due_date = ?", (user["id"], today)).fetchone()[0]
            evs = [dict(r) for r in conn.execute(
                "select id, title, start, end from events where user_id = ? and end > ? and start < ? order by start",
                (user["id"], now.strftime("%Y-%m-%dT%H:%M"), (date.today() + timedelta(days=1)).isoformat() + "T00:00"),
            )]
        if late:
            out.append({"id": f"tasks-late-{today}-{late}", "kind": "tasks", "tone": "bad", "source": "real", "title": f"{late} tarefa{'s' if late > 1 else ''} atrasada{'s' if late > 1 else ''}",
                        "body": "Reorganize os prazos ou conclua o que já foi feito.", "ts": int(time.time()) - 60, "target": {"tab": "tasks"}})
        if due:
            out.append({"id": f"tasks-today-{today}-{due}", "kind": "tasks", "tone": "warn", "source": "real", "title": f"{due} tarefa{'s' if due > 1 else ''} para hoje",
                        "body": "Priorize antes das reuniões.", "ts": int(time.time()) - 120, "target": {"tab": "tasks"}})
        for e in evs[:6]:
            start = datetime.strptime(e["start"], "%Y-%m-%dT%H:%M")
            minutes = int((start - now).total_seconds() // 60)
            if 0 <= minutes <= 90:
                out.append({"id": f"event-{e['id']}", "kind": "agenda", "tone": "warn" if minutes <= 30 else "info", "source": "real",
                            "title": f"“{e['title']}” começa em {minutes} min" if minutes else f"“{e['title']}” começa agora",
                            "body": f"Hoje às {e['start'][11:16]}", "ts": int(time.time()) - 30, "target": {"tab": "agenda"}})
        conflicts = [(a, b) for i, a in enumerate(evs) for b in evs[i + 1:] if _overlaps(a, b)]
        for a, b in conflicts:
            out.append({"id": f"conflict-{a['id']}-{b['id']}", "kind": "agenda", "tone": "warn", "source": "real", "title": "Conflito na agenda",
                        "body": f"“{a['title']}” e “{b['title']}” se sobrepõem.", "ts": int(time.time()) - 90, "target": {"tab": "agenda"}})
        out += [
            {"id": "briefing-" + today, "kind": "briefing", "tone": "info", "source": "exemplo", "title": "Seu resumo do dia está pronto",
             "body": "O que andou ontem nos projetos e o que importa hoje.", "ts": int(time.time()) - 600, "target": {"tab": "home"}},
            {"id": "biz-proposals", "kind": "business", "tone": "bad", "source": "exemplo", "title": "3 propostas paradas há mais de 14 dias",
             "body": "R$ 84 mil em aberto. O Ayran pode redigir os follow-ups.", "ts": int(time.time()) - 3600, "target": {"tab": "business"}},
            {"id": "dev-pr", "kind": "dev", "tone": "info", "source": "exemplo", "title": "PR do módulo de agenda aguarda revisão",
             "body": "Aberto pelo Douglas há 1 hora.", "ts": int(time.time()) - 5400, "target": {"tab": "business"}},
        ]
        rank = {"bad": 0, "warn": 1, "info": 2}
        out.sort(key=lambda n: (rank[n["tone"]], -n["ts"]))
        return {"items": out}

    return router
