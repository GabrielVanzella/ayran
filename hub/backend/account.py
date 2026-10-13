"""Conta do proprio usuario: trocar a senha pela Central (usa a API do Open WebUI com o token da pessoa)."""

import json
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

OWUI_URL = "http://127.0.0.1:8080"
AYRAN_HOME = Path(os.environ.get("AYRAN_HOME", Path.home() / "ayran-server"))
LOCAL_CREDS = AYRAN_HOME / "local-admin.json"


class PasswordChange(BaseModel):
    current: str = Field(min_length=1, max_length=128)
    new: str = Field(min_length=8, max_length=64)  # bcrypt aceita ate 72 bytes


def build_router(current_user) -> APIRouter:
    router = APIRouter(prefix="/api/account")

    @router.post("/password")
    async def change_password(body: PasswordChange, request: Request, user=Depends(current_user)):
        if body.new == body.current:
            raise HTTPException(400, "A nova senha precisa ser diferente da atual")
        client: httpx.AsyncClient = request.app.state.http
        r = await client.post(
            f"{OWUI_URL}/api/v1/auths/update/password",
            headers={"Authorization": request.headers["authorization"]},
            json={"password": body.current, "new_password": body.new},
            timeout=15,
        )
        if r.status_code != 200 or r.json() is not True:
            detail = ""
            try:
                detail = str(r.json().get("detail", ""))
            except Exception:
                pass
            if "password" in detail.lower() and ("incorrect" in detail.lower() or "wrong" in detail.lower()):
                raise HTTPException(400, "Senha atual incorreta")
            raise HTTPException(400 if r.status_code < 500 else 502, "Não consegui trocar a senha. Confira a senha atual.")

        # A entrada automatica neste PC usa a senha guardada em arquivo: mantem as duas iguais
        try:
            if LOCAL_CREDS.exists():
                creds = json.loads(LOCAL_CREDS.read_text(encoding="utf-8"))
                if creds.get("email", "").lower() == user.get("email", "").lower():
                    creds["password"] = body.new
                    LOCAL_CREDS.write_text(json.dumps(creds, indent=2), encoding="utf-8")
        except Exception:
            pass  # a senha ja foi trocada; so a entrada automatica local precisaria de reparo
        return {"ok": True}

    return router
