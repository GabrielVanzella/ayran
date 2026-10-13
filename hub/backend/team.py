"""Gestao da equipe — so administrador.

Quem cria os acessos e o dono: ninguem se cadastra sozinho. A central chama a API de usuarios do
Open WebUI com o token do proprio admin (o Open WebUI valida de novo que ele e admin).
"""

import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

OWUI_URL = "http://127.0.0.1:8080"
ROLES = ("user", "admin")  # user = funcionario
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class NewUser(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=64)
    role: str = "user"


class UserPatch(BaseModel):
    role: str | None = None
    password: str | None = Field(default=None, min_length=8, max_length=64)


# Mensagens do Open WebUI vem em ingles: traduz as que o dono pode ver.
TRANSLATE = (
    ("already registered", "Já existe um acesso com esse e-mail"),
    ("invalid email", "E-mail inválido"),
    ("password", "Senha não aceita (use de 8 a 64 caracteres)"),
    ("action prohibited", "Essa conta não pode ser alterada"),
    ("not found", "Usuário não encontrado"),
)


def pt(detail: str) -> str:
    low = detail.lower()
    return next((msg for key, msg in TRANSLATE if key in low), detail)


def build_router(current_user, forget_user) -> APIRouter:
    """forget_user(id): esquece as sessoes em cache do usuario, pra troca de senha/remocao valer na hora."""
    router = APIRouter(prefix="/api/team")

    async def admin_only(user=Depends(current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Só o administrador gerencia a equipe")
        return user

    async def owui(request: Request, method: str, path: str, **kw):
        client: httpx.AsyncClient = request.app.state.http
        r = await client.request(
            method, f"{OWUI_URL}{path}", headers={"Authorization": request.headers["authorization"]}, timeout=15, **kw
        )
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail", "Erro no Open WebUI")
            except Exception:
                detail = "Erro no Open WebUI"
            raise HTTPException(r.status_code if r.status_code < 500 else 502, pt(str(detail)))
        return r.json()

    @router.get("/users")
    async def list_users(request: Request, admin=Depends(admin_only)):
        data = await owui(request, "GET", "/api/v1/users/all")
        users = [
            {"id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"],
             "online": bool(u.get("is_active")), "me": u["id"] == admin["id"]}
            for u in data["users"]
        ]
        order = {"admin": 0, "user": 1, "pending": 2}
        return sorted(users, key=lambda u: (order.get(u["role"], 3), u["name"].lower()))

    @router.post("/users")
    async def create_user(body: NewUser, request: Request, admin=Depends(admin_only)):
        email = body.email.strip().lower()
        if not EMAIL_RE.match(email):
            raise HTTPException(400, "E-mail inválido")
        if body.role not in ROLES:
            raise HTTPException(400, "Papel inválido")
        created = await owui(request, "POST", "/api/v1/auths/add",
                             json={"name": body.name.strip(), "email": email, "password": body.password, "role": body.role})
        return {"id": created["id"], "name": created["name"], "email": created["email"], "role": created["role"]}

    @router.patch("/users/{user_id}")
    async def update_user(user_id: str, body: UserPatch, request: Request, admin=Depends(admin_only)):
        if body.role is not None:
            if body.role not in ROLES:
                raise HTTPException(400, "Papel inválido")
            if user_id == admin["id"]:
                raise HTTPException(400, "Você não pode mudar o seu próprio papel")
        payload = {k: v for k, v in body.model_dump().items() if v is not None}
        if not payload:
            raise HTTPException(400, "Nada para atualizar")
        await owui(request, "POST", f"/api/v1/users/{user_id}/update", json=payload)
        forget_user(user_id)
        return {"ok": True}

    @router.delete("/users/{user_id}")
    async def delete_user(user_id: str, request: Request, admin=Depends(admin_only)):
        if user_id == admin["id"]:
            raise HTTPException(400, "Você não pode remover o seu próprio acesso")
        await owui(request, "DELETE", f"/api/v1/users/{user_id}")
        forget_user(user_id)
        return {"ok": True}

    return router
