"""Fundo da Central com a vista da cidade do usuario, no clima de agora.

Cada (cidade, cena) e gerada uma vez pelo gerador de imagens do Ayran, aumentada de resolucao e guardada.
A cidade vem da localizacao salva do proprio usuario (nao de parametros): ninguem manda gerar o que quiser.
Enquanto a imagem nao fica pronta, a Central usa a cena generica.

A imagem e INSPIRADA na cidade (relevo, vegetacao, perfil urbano); nao e foto de lugar real.
"""

import asyncio
import hashlib
import io
import json
import re
import secrets
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from PIL import Image

import comfy

SCENES = ("praia", "dia", "sol", "nublado", "chuva", "tempestade", "neblina", "noite", "frio")
PHRASES = {
    "praia": "hot sunny summer day, intense sunlight, vivid deep blue sky, heat haze",
    "dia": "bright sunny day, blue sky with a few white clouds, vivid colors",
    "sol": "golden hour sunset, dramatic orange and purple sky, warm light",
    "nublado": "overcast sky, soft diffused light, muted tones, grey clouds",
    "chuva": "heavy rain, wet streets and rooftops, dark rainy sky, mist, moody atmosphere",
    "tempestade": "dramatic thunderstorm, lightning bolt, dark storm clouds",
    "neblina": "thick fog, misty morning, soft diffused light",
    "noite": "night, city lights glowing, starry sky",
    "frio": "cold crisp morning, clear pale blue sky, light haze",
}
NEGATIVE = "lowres, blurry, text, watermark, signature, people, person, deformed, ugly, oversaturated, jpeg artifacts"
TARGET_W = 2400
MAX_CITIES = 20  # limite de cidades em cache (disco e tempo de GPU)
RETRY_AFTER_S = 10 * 60
PROMPT_VERSION = "2"  # mudou a receita do prompt? aumente: as imagens antigas deixam de valer

DESCRIBE_SYSTEM = (
    "You help write image-generation prompts. Given a Brazilian city, list 3 to 5 visual features of its "
    "NATURAL SURROUNDINGS that appear in wide photos: nearby mountains, hills or serras, rivers, lakes or sea, "
    "and typical vegetation. Output ONLY comma-separated English phrases, at most 25 words in total. "
    "No sentences, no city name, no buildings, no people, no text."
)
KEY_RE = re.compile(r"^[0-9a-f]{16}$")


def build_router(current_user, get_location, data_dir: Path) -> APIRouter:
    router = APIRouter()
    cache = data_dir / "city-scenes"
    cache.mkdir(parents=True, exist_ok=True)
    salt_file = data_dir / "city-salt.txt"
    if not salt_file.exists():
        salt_file.write_text(secrets.token_hex(16))
    salt = salt_file.read_text().strip()

    queue: asyncio.Queue[tuple] = asyncio.Queue()
    pending: set[tuple[str, str]] = set()
    failed: dict[tuple[str, str], float] = {}

    def city_key(lat: float, lon: float) -> str:
        # ~1 km de precisao; o sal impede adivinhar o endereco da pasta a partir de coordenadas
        return hashlib.sha256(f"{PROMPT_VERSION}:{salt}:{lat:.2f},{lon:.2f}".encode()).hexdigest()[:16]

    async def describe(client: httpx.AsyncClient, name: str, region: str) -> str:
        fallback = "green hills and lush vegetation"
        try:
            r = await client.post(
                f"{comfy.OLLAMA_URL}/api/chat",
                json={
                    "model": "qwen3.5:4b", "stream": False, "think": False,
                    "messages": [{"role": "system", "content": DESCRIBE_SYSTEM},
                                 {"role": "user", "content": f"City: {name}, {region}, Brazil"}],
                    "options": {"temperature": 0.3, "num_predict": 70, "num_ctx": 4096},
                },
                timeout=240,
            )
            text = " ".join(r.json()["message"]["content"].split()).strip('"').rstrip(".")
            if 3 <= len(text.split()) <= 40 and not re.match(r"(?i)(i can|sorry|as an ai)", text):
                return text
        except Exception:
            pass
        return fallback

    async def translate(client: httpx.AsyncClient, text: str) -> str:
        """Descricao do dono (portugues) -> frases curtas em ingles. Se falhar, usa o texto original."""
        try:
            r = await client.post(
                f"{comfy.OLLAMA_URL}/api/chat",
                json={
                    "model": "qwen3.5:4b", "stream": False, "think": False,
                    "messages": [
                        {"role": "system", "content": "Translate the user's description of a city's surroundings into short "
                         "comma-separated English phrases for an image generator. Keep proper names as they are. "
                         "Output ONLY the phrases, at most 40 words."},
                        {"role": "user", "content": text},
                    ],
                    "options": {"temperature": 0.1, "num_predict": 100, "num_ctx": 2048},
                },
                timeout=240,
            )
            out = " ".join(r.json()["message"]["content"].split()).strip('"').rstrip(".")
            if 2 <= len(out.split()) <= 60:
                return out
        except Exception:
            pass
        return text

    def build_prompt(meta: dict, scene: str) -> str:
        # A cidade entra sempre (perfil urbano); o texto livre so completa o entorno
        return (
            f"wide panoramic view over the city of {meta['name']}, Brazil, urban skyline with mid-rise buildings "
            f"and houses in the foreground, {meta['desc']}, {PHRASES[scene]}, "
            "landscape photography, highly detailed, no people"
        )

    async def generate(client: httpx.AsyncClient, key: str, lat: float, lon: float, scene: str, name: str, region: str):
        folder = cache / key
        folder.mkdir(parents=True, exist_ok=True)
        meta_file = folder / "meta.json"
        async with comfy.GPU_LOCK:
            meta = json.loads(meta_file.read_text(encoding="utf-8")) if meta_file.exists() else None
            if not meta:
                meta = {"name": name, "region": region, "desc": await describe(client, name, region)}
                meta_file.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
            if meta.get("custom") and not meta.get("desc"):
                meta["desc"] = await translate(client, meta["desc_user"])
                meta_file.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
            prompt = build_prompt(meta, scene)
            await comfy.free_ollama_gpu(client)
            small = await comfy.txt2img(client, prompt, NEGATIVE, 768, 512, steps=30)
            big = await comfy.upscale(client, small)
            await comfy.free_comfy(client)
        img = Image.open(io.BytesIO(big)).convert("RGB")
        img = img.resize((TARGET_W, round(img.height * TARGET_W / img.width)), Image.LANCZOS)
        tmp = folder / f".{scene}.tmp.jpg"
        img.save(tmp, quality=86, optimize=True, progressive=True)
        tmp.replace(folder / f"{scene}.jpg")  # so aparece pronta quando esta inteira

    async def worker():
        async with httpx.AsyncClient(timeout=httpx.Timeout(30, read=300)) as client:
            while True:
                key, lat, lon, scene, name, region = await queue.get()
                started = time.time()
                try:
                    await generate(client, key, lat, lon, scene, name, region)
                    print(f"[cidade] {name}/{scene} pronta em {time.time() - started:.0f}s")
                except Exception as e:
                    failed[(key, scene)] = time.time()
                    print(f"[cidade] {name}/{scene} falhou: {e!r}")
                finally:
                    pending.discard((key, scene))

    router.worker = worker

    @router.get("/api/city-scene")
    async def city_scene(scene: str, user=Depends(current_user)):
        if scene not in SCENES:
            raise HTTPException(400, "Cena desconhecida")
        loc = get_location(user["id"])
        if not loc:
            return {"status": "nolocation"}
        lat, lon = float(loc["lat"]), float(loc["lon"])
        key = city_key(lat, lon)
        path = cache / key / f"{scene}.jpg"
        if path.exists():
            return {"status": "ready", "url": f"/city-scenes/{key}/{scene}.jpg?v={int(path.stat().st_mtime)}",
                    "city": loc.get("name", "")}
        if (key, scene) in pending:
            return {"status": "generating", "city": loc.get("name", "")}
        if time.time() - failed.get((key, scene), 0) < RETRY_AFTER_S:
            return {"status": "error"}
        if not (cache / key).exists() and sum(1 for p in cache.iterdir() if p.is_dir()) >= MAX_CITIES:
            return {"status": "limit"}
        name = (loc.get("name") or "").strip()
        if not name or name == "Minha localização":
            return {"status": "needs-name"}  # a Central resolve o nome da cidade e tenta de novo
        pending.add((key, scene))
        await queue.put((key, lat, lon, scene, name, str(loc.get("region") or "")))
        return {"status": "generating", "city": name}

    @router.get("/city-scenes/{key}/{scene}.jpg")
    async def city_scene_file(key: str, scene: str):
        # sem login de proposito: e <img>/CSS. Nao tem dado sensivel e a pasta tem nome impossivel de adivinhar.
        if not KEY_RE.match(key) or scene not in SCENES:
            raise HTTPException(404, "Não encontrado")
        path = cache / key / f"{scene}.jpg"
        if not path.exists():
            raise HTTPException(404, "Não encontrado")
        return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


    class InfoBody(BaseModel):
        desc: str = Field(min_length=3, max_length=300)

    def _meta_path(loc: dict) -> Path:
        return cache / city_key(float(loc["lat"]), float(loc["lon"])) / "meta.json"

    @router.get("/api/city-scene/info")
    async def city_info(user=Depends(current_user)):
        loc = get_location(user["id"])
        if not loc:
            return {"status": "nolocation"}
        path = _meta_path(loc)
        meta = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        return {"name": loc.get("name", ""), "desc": (meta.get("desc_user") or meta["desc"]) if meta else "",
                "custom": bool(meta and meta.get("custom")), "editable": user.get("role") == "admin"}

    @router.put("/api/city-scene/info")
    async def set_city_info(body: InfoBody, user=Depends(current_user)):
        """O dono descreve a vista da cidade (a IA nao conhece a geografia de cada lugar); as imagens sao recriadas."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Só o administrador ajusta a vista da cidade")
        loc = get_location(user["id"])
        if not loc or not (loc.get("name") or "").strip() or loc["name"] == "Minha localização":
            raise HTTPException(400, "Escolha a cidade primeiro")
        path = _meta_path(loc)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"name": loc["name"], "region": loc.get("region", ""),
                                    "desc_user": body.desc.strip(), "custom": True}, ensure_ascii=False), encoding="utf-8")
        for img in path.parent.glob("*.jpg"):
            img.unlink(missing_ok=True)  # as imagens antigas nao valem mais; sao recriadas sob demanda
        for k in [k for k in failed if k[0] == path.parent.name]:
            failed.pop(k, None)
        return {"ok": True}
    return router
