"""Identidade da empresa: nome, site, logo e imagem principal da tela inicial.

GET e publico (a imagem entra como fundo/<img>, que nao enviam token); alterar so o administrador.
Cada empresa que instalar o Ayran configura o proprio logo e a propria imagem, sem mexer no codigo.
"""

import io
import json

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

DEFAULTS = {"name": "VZ Tecnologia", "site": "vztecnologia.com.br", "hero_default": "escritorio", "hero_focus": "center", "hero_zoom": 100}
FOCUS_CHOICES = ("left", "center", "right")
HERO_CHOICES = ("escritorio", "custom", "auto")
MAX_UPLOAD = 8 * 1024 * 1024


class BrandIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    site: str = Field(default="", max_length=80)
    hero_default: str = "escritorio"
    hero_focus: str = "center"  # onde ficam os detalhes importantes da foto (o texto da tela inicial fica a esquerda)
    hero_zoom: int = Field(default=100, ge=100, le=160)


def build_router(current_user, base_dir: Path) -> APIRouter:
    folder = base_dir / "brand"
    folder.mkdir(parents=True, exist_ok=True)
    conf = folder / "brand.json"
    router = APIRouter(prefix="/api/brand")

    def load() -> dict:
        try:
            return {**DEFAULTS, **json.loads(conf.read_text(encoding="utf-8-sig"))}
        except (OSError, ValueError):
            return dict(DEFAULTS)

    def version(path: Path) -> int:
        return int(path.stat().st_mtime) if path.exists() else 0

    def admin_only(user=Depends(current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Só o administrador altera a identidade da empresa")
        return user

    def payload() -> dict:
        b = load()
        hero, logo = folder / "hero.jpg", folder / "logo.png"
        return {**b, "has_hero": hero.exists(), "has_logo": logo.exists(), "hero_v": version(hero), "logo_v": version(logo)}

    @router.get("")
    async def get_brand():
        return payload()

    @router.put("")
    async def put_brand(body: BrandIn, admin=Depends(admin_only)):
        if body.hero_default not in HERO_CHOICES:
            raise HTTPException(422, "Imagem padrão inválida")
        if body.hero_default == "custom" and not (folder / "hero.jpg").exists():
            raise HTTPException(422, "Envie a imagem antes de torná-la padrão")
        if body.hero_focus not in FOCUS_CHOICES:
            raise HTTPException(422, "Enquadramento inválido")
        conf.write_text(
            json.dumps({"name": body.name.strip(), "site": body.site.strip(), "hero_default": body.hero_default, "hero_focus": body.hero_focus, "hero_zoom": body.hero_zoom}, ensure_ascii=False),
            encoding="utf-8",
        )
        return payload()

    def read_image(data: bytes) -> Image.Image:
        if len(data) > MAX_UPLOAD:
            raise HTTPException(413, "Imagem grande demais (máximo 8 MB)")
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise HTTPException(422, "Não consegui ler essa imagem. Use JPG, PNG ou WebP.")
        if img.format not in ("JPEG", "PNG", "WEBP"):
            raise HTTPException(422, "Use JPG, PNG ou WebP.")
        if img.width * img.height > 60_000_000:
            raise HTTPException(422, "Imagem com resolução alta demais.")
        return img

    @router.post("/hero")
    async def upload_hero(file: UploadFile = File(...), admin=Depends(admin_only)):
        img = read_image(await file.read()).convert("RGB")
        if img.width < 1000:
            raise HTTPException(422, "Use uma imagem com pelo menos 1000 px de largura.")
        if img.width > 2560:
            img = img.resize((2560, round(img.height * 2560 / img.width)), Image.LANCZOS)
        img.save(folder / "hero.jpg", quality=85, optimize=True, progressive=True)
        return payload()

    @router.post("/logo")
    async def upload_logo(file: UploadFile = File(...), admin=Depends(admin_only)):
        img = read_image(await file.read()).convert("RGBA")
        img.thumbnail((800, 400))
        img.save(folder / "logo.png", optimize=True)
        return payload()

    @router.delete("/{kind}")
    async def delete_image(kind: str, admin=Depends(admin_only)):
        names = {"hero": "hero.jpg", "logo": "logo.png"}
        if kind not in names:
            raise HTTPException(404, "Não encontrado")
        (folder / names[kind]).unlink(missing_ok=True)
        b = load()
        if kind == "hero" and b["hero_default"] == "custom":
            conf.write_text(json.dumps({**b, "hero_default": "escritorio"}, ensure_ascii=False), encoding="utf-8")
        return payload()

    def serve(name: str, media: str):
        path = folder / name
        if not path.exists():
            raise HTTPException(404, "Sem imagem")
        return FileResponse(path, media_type=media, headers={"Cache-Control": "public, max-age=3600"})

    @router.get("/hero.jpg")
    async def hero():
        return serve("hero.jpg", "image/jpeg")

    @router.get("/logo.png")
    async def logo():
        return serve("logo.png", "image/png")

    return router
