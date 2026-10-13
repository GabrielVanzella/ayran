"""Geracao de imagem (e, quando houver GPU, video) via ComfyUI.

Fila de uma geracao por vez: antes de gerar, libera a GPU do Ollama; depois, libera a do ComfyUI.
O pedido em portugues e traduzido/melhorado pelo Ayran (modelo leve) pro ingles que o SD entende.
"""

import asyncio
import io
import json
import os
import random
import re
import sqlite3
import time
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

import safety
import comfy
from comfy import GPU_LOCK

COMFY_URL = "http://127.0.0.1:8188"
OLLAMA_URL = "http://127.0.0.1:11434"
PROMPT_MODEL = "qwen3.5:4b"
CHECKPOINT = "chilloutmix_NiPrunedFp16Fix.safetensors"
VIDEO_MIN_VRAM_GB = 16
WORKFLOWS = Path(__file__).parent / "workflows"

# LoRA opcional: arquivo .safetensors dentro de comfyui-models/loras. Vazio = nao usa.
LORA = os.environ.get("AYRAN_IMAGE_LORA", "")
LORA_STRENGTH_MODEL = float(os.environ.get("AYRAN_IMAGE_LORA_MODEL", "0.8"))
LORA_STRENGTH_CLIP = float(os.environ.get("AYRAN_IMAGE_LORA_CLIP", "0.8"))

# Unico limite de conteudo: qualquer coisa envolvendo menores de idade.
# Nudez adulta consensual e conteudo adulto em geral sao permitidos; envolvendo menores, nao
# (servidor multiusuario — protege o Gabriel e a VZ de material de abuso infantil).
_BLOCK_MINORS = re.compile(
    r"\b(crian[çc]as?|menor(es)?( de idade)?|infantil|child|children|kid|kids|minor|"
    r"underage|loli\w*|shota\w*|adolescente|teen\w*)\b",
    re.IGNORECASE,
)

# COM IMAGEM DE REFERENCIA (img2img) o gerador nao aceita nudez nem conteudo sexual: a partir da foto de uma
# pessoa real isso vira montagem sem consentimento (crime). Vale pro texto, pra imagem enviada e pra gerada.
_BLOCK_REF_EXPLICIT = re.compile(
    r"\b(porn\w*|pornografi\w*|hentai|nsfw|sexo|sexual|sexy|sex|nu[ao]s?|nud[ea]s?|nudez|nude|naked|"
    r"pelad[oa]s?|sem roupas?|desnud\w*|lingerie|topless|seios?|mamilos?|nipples?|genita\w*|p[êe]nis|penis|"
    r"vagina|er[óo]tic\w*|erotic\w*|orgasm\w*|transa\w*)\b",
    re.IGNORECASE,
)
REF_NEGATIVE = ", nsfw, nude, naked, nipples, explicit, sexual"
REF_CHECKPOINT = "DreamShaper_8_pruned.safetensors"  # neutro; o padrao do servidor e outro modelo
REF_BLOCKED_MESSAGE = "Com imagem de referência o gerador não aceita nudez nem conteúdo sexual."
REF_MAX_BYTES = 10 * 1024 * 1024
REF_MAX_SIDE = 768
REF_MIN_SIDE = 256

SIZES = {"quadrado": (512, 512), "retrato": (512, 768), "paisagem": (768, 512)}

# Modelos prontos: tamanho final + dica de composicao (o texto da dica entra no prompt, ja em ingles).
# O gerador nao escreve texto bem: por isso os modelos de post deixam espaco livre pra colocar o texto depois.
TEMPLATES = {
    "instagram_post": {"label": "Post do Instagram", "group": "Redes sociais", "w": 1080, "h": 1080,
                       "hint": "Quadrado 1:1", "suffix": "square composition, centered subject, clean uncluttered background, empty space for text"},
    "instagram_retrato": {"label": "Post retrato (4:5)", "group": "Redes sociais", "w": 1080, "h": 1350,
                          "hint": "Instagram e Facebook, ocupa mais a tela", "suffix": "vertical composition, subject in the center, empty space at the top for text"},
    "story": {"label": "Story / Reels", "group": "Redes sociais", "w": 1080, "h": 1920,
              "hint": "Tela cheia 9:16", "suffix": "tall vertical composition, subject in the middle, empty space at the top and bottom for text"},
    "youtube": {"label": "Miniatura do YouTube", "group": "Redes sociais", "w": 1280, "h": 720,
                "hint": "16:9", "suffix": "dramatic lighting, bold vivid colors, subject on the right side, empty space on the left for a title"},
    "linkedin": {"label": "Post LinkedIn / Facebook", "group": "Redes sociais", "w": 1200, "h": 630,
                 "hint": "Horizontal 1,91:1", "suffix": "wide horizontal composition, professional clean look, empty space on one side for text"},
    "x_post": {"label": "Post do X (Twitter)", "group": "Redes sociais", "w": 1600, "h": 900,
               "hint": "16:9", "suffix": "wide composition, clear focal point, uncluttered"},
    "pinterest": {"label": "Pin do Pinterest", "group": "Redes sociais", "w": 1000, "h": 1500,
                  "hint": "Vertical 2:3", "suffix": "tall vertical composition, aesthetic, empty space at the bottom for text"},
    "logo": {"label": "Logo / avatar", "group": "Marca e site", "w": 1024, "h": 1024,
             "hint": "Quadrado, fundo liso", "suffix": "minimalist emblem, flat vector style, simple shapes, centered, plain solid background"},
    "banner": {"label": "Banner de site", "group": "Marca e site", "w": 1920, "h": 640,
               "hint": "Panorâmico 3:1", "suffix": "wide panoramic banner composition, subject on one side, empty space on the other"},
    "wallpaper": {"label": "Papel de parede", "group": "Marca e site", "w": 1920, "h": 1080,
                  "hint": "Tela cheia 16:9", "suffix": "wide cinematic wallpaper, highly detailed, rich atmosphere"},
}
CUSTOM_MIN, CUSTOM_MAX, CUSTOM_MAX_PIXELS, CUSTOM_MAX_RATIO = 256, 2048, 4_200_000, 4.0
GEN_MAX_SIDE, GEN_MAX_PIXELS, GEN_MIN_SIDE = 768, 480_000, 256  # o que a placa de 4 GB gera de uma vez


def fit_generation(w: int, h: int) -> tuple[int, int]:
    """Resolucao em que o SD 1.5 gera (multiplos de 8) mantendo a proporcao do tamanho final."""
    ratio = w / h
    gw, gh = (GEN_MAX_SIDE, GEN_MAX_SIDE / ratio) if ratio >= 1 else (GEN_MAX_SIDE * ratio, GEN_MAX_SIDE)
    if gw * gh > GEN_MAX_PIXELS:
        k = (GEN_MAX_PIXELS / (gw * gh)) ** 0.5
        gw, gh = gw * k, gh * k
    return max(GEN_MIN_SIDE, round(gw / 8) * 8), max(GEN_MIN_SIDE, round(gh / 8) * 8)


def resolve_target(params: dict) -> tuple[int, int, str] | None:
    """Tamanho final pedido (modelo pronto ou personalizado) e a dica de composicao; None = tamanho rapido antigo."""
    t = TEMPLATES.get(params.get("template") or "")
    if t:
        return t["w"], t["h"], t["suffix"]
    if params.get("width") and params.get("height"):
        return int(params["width"]), int(params["height"]), ""
    return None


async def finish_size(client: httpx.AsyncClient, data: bytes, w: int, h: int, gen: tuple[int, int]) -> bytes:
    """Aumenta a resolucao (Real-ESRGAN) se o alvo e maior que o gerado e ajusta pro tamanho exato (corte central)."""
    if w > gen[0] or h > gen[1]:
        data = await comfy.upscale(client, data)
    img = Image.open(io.BytesIO(data)).convert("RGB")
    target_ratio, ratio = w / h, img.width / img.height
    if ratio > target_ratio:  # larga demais: corta dos lados
        nw = round(img.height * target_ratio)
        left = (img.width - nw) // 2
        box = (left, 0, left + nw, img.height)
    else:  # alta demais: corta em cima e embaixo
        nh = round(img.width / target_ratio)
        top = (img.height - nh) // 2
        box = (0, top, img.width, top + nh)
    out = io.BytesIO()
    img.crop(box).resize((w, h), Image.LANCZOS).save(out, "PNG", optimize=True)
    return out.getvalue()
STYLES = {
    "livre": "",
    "foto": "photorealistic, 35mm photo, natural light, highly detailed, sharp focus",
    "ilustracao": "digital illustration, vibrant colors, clean lines, artstation",
    "anime": "anime style, cel shading, detailed background, studio quality",
    "3d": "3d render, octane render, soft studio lighting, high detail",
    "conceito": "concept art, cinematic lighting, epic composition, matte painting",
}
BASE_NEGATIVE = (
    "lowres, bad anatomy, bad hands, extra fingers, blurry, "
    "jpeg artifacts, watermark, text, signature, deformed"
)


TRANSLATE_SYSTEM = (
    "You convert an image request (usually in Portuguese) into a Stable Diffusion prompt in English. "
    "Output ONLY the prompt: comma-separated descriptive tags, subject first, then setting, lighting, style. "
    "Max 60 words. No explanations, no quotes."
)


class ImageRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=1000)
    size: str = "quadrado"
    template: str | None = None  # modelo pronto (TEMPLATES): define tamanho final e composicao
    width: int | None = Field(default=None, ge=CUSTOM_MIN, le=CUSTOM_MAX)  # tamanho personalizado
    height: int | None = Field(default=None, ge=CUSTOM_MIN, le=CUSTOM_MAX)
    style: str = "livre"
    steps: int = Field(default=25, ge=10, le=40)
    seed: int | None = None
    enhance: bool = True
    checkpoint: str | None = None
    lora_model: float | None = Field(default=None, ge=-2, le=2)
    lora_clip: float | None = Field(default=None, ge=-2, le=2)


def init_media_db(conn: sqlite3.Connection):
    conn.executescript(
        """
        create table if not exists media_jobs (
            id text primary key, user_id text not null, kind text not null, prompt text not null,
            final_prompt text default '', params text default '{}', status text not null,
            error text default '', outputs text default '[]', created_at integer, finished_at integer
        );
        create index if not exists media_user on media_jobs(user_id, created_at);
        """
    )
    # geracao interrompida por reinicio do servidor nao volta sozinha
    conn.execute("update media_jobs set status = 'erro', error = 'servidor reiniciado' "
                 "where status in ('na_fila', 'gerando')")


def build_router(db, current_user, media_dir: Path) -> APIRouter:
    router = APIRouter(prefix="/api/media")
    queue: asyncio.Queue[str] = asyncio.Queue()
    media_dir.mkdir(parents=True, exist_ok=True)
    refs_dir = media_dir / "refs"
    refs_dir.mkdir(exist_ok=True)
    for stale in refs_dir.glob("*.jpg"):  # sobras de trabalhos que o reinicio do servidor interrompeu
        stale.unlink(missing_ok=True)

    def set_job(job_id: str, **fields):
        sets = ", ".join(f"{k} = :{k}" for k in fields)
        with db() as conn:
            conn.execute(f"update media_jobs set {sets} where id = :id", {**fields, "id": job_id})

    async def vram_gb(client: httpx.AsyncClient) -> float:
        try:
            stats = (await client.get(f"{COMFY_URL}/system_stats", timeout=5)).json()
            return max(d.get("vram_total", 0) for d in stats.get("devices", [{}])) / 1024**3
        except Exception:
            return 0.0

    async def enhance_prompt(client: httpx.AsyncClient, text: str) -> str:
        r = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": PROMPT_MODEL,
                "messages": [{"role": "system", "content": TRANSLATE_SYSTEM}, {"role": "user", "content": text}],
                "stream": False,
                "think": False,
                "options": {"temperature": 0.4, "num_predict": 120, "num_ctx": 8192},
            },
            timeout=120,
        )
        out = r.json()["message"]["content"].strip().strip('"')
        # Usa a resposta do modelo quando houver conteúdo; caso contrário, mantém o pedido original.
        return out or text

    async def free_ollama_gpu(client: httpx.AsyncClient):
        try:
            loaded = (await client.get(f"{OLLAMA_URL}/api/ps", timeout=5)).json().get("models", [])
            for m in loaded:
                await client.post(f"{OLLAMA_URL}/api/generate", json={"model": m["name"], "keep_alive": 0}, timeout=30)
        except Exception:
            pass

    async def run_image(client: httpx.AsyncClient, job: dict):
        params = json.loads(job["params"])
        ref = bool(params.get("ref"))
        ref_path = refs_dir / f"{job['id']}.jpg"
        if ref:
            set_job(job["id"], status="gerando", error="verificando a imagem de referência…")
            try:
                if await safety.is_blocked(ref_path):
                    raise ValueError(REF_BLOCKED_MESSAGE)
            except RuntimeError as e:  # nao deu pra verificar: na duvida, recusa
                raise ValueError(f"Não consegui verificar a imagem de referência, tente de novo. ({e})")
        final = job["prompt"]
        if params.get("enhance", True):
            set_job(job["id"], status="gerando", error="Ayran escrevendo o prompt…")
            final = await enhance_prompt(client, job["prompt"])
        if _BLOCK_MINORS.search(job["prompt"]) or _BLOCK_MINORS.search(final):
            raise ValueError("Não gero conteúdo envolvendo menores de idade.")
        if ref and (_BLOCK_REF_EXPLICIT.search(job["prompt"]) or _BLOCK_REF_EXPLICIT.search(final)):
            raise ValueError(REF_BLOCKED_MESSAGE)
        style = STYLES.get(params.get("style", "livre"), "")
        final = f"{final}, {style}" if style else final
        target = None if ref else resolve_target(params)
        if target and target[2]:
            final = f"{final}, {target[2]}"
        set_job(job["id"], final_prompt=final, error="liberando a GPU…")
        await free_ollama_gpu(client)

        if ref:
            width, height = params["width"], params["height"]
        elif target:
            width, height = fit_generation(target[0], target[1])
        else:
            width, height = SIZES.get(params.get("size"), SIZES["quadrado"])
        values = {
            "seed": params.get("seed") or random.randint(1, 2**31),
            "steps": params.get("steps", 25),
            "checkpoint": REF_CHECKPOINT if ref else (params.get("checkpoint") or CHECKPOINT),
            "width": width,
            "height": height,
            "prompt": final,
            "negative": BASE_NEGATIVE + (REF_NEGATIVE if ref else ""),
        }
        if ref:
            up = await client.post(f"{COMFY_URL}/upload/image", data={"overwrite": "true"},
                                   files={"image": (f"ayran-ref-{job['id']}.jpg", ref_path.read_bytes(), "image/jpeg")})
            up.raise_for_status()
            values["image"] = up.json()["name"]
            values["denoise"] = params.get("strength", 0.65)
            workflow_name = "image_sd15_img2img.json"  # com referencia nunca carrega a LoRA do servidor
        elif LORA:
            values["lora"] = LORA
            values["lora_model"] = params.get("lora_model", LORA_STRENGTH_MODEL)
            values["lora_clip"] = params.get("lora_clip", LORA_STRENGTH_CLIP)
            workflow_name = "image_sd15_lora.json"
        else:
            workflow_name = "image_sd15.json"
        workflow = json.loads((WORKFLOWS / workflow_name).read_text(encoding="utf-8"))
        for node in workflow.values():
            for k, v in node["inputs"].items():
                if isinstance(v, str) and v.startswith("{{") and v.endswith("}}"):
                    node["inputs"][k] = values[v[2:-2]]

        set_job(job["id"], error="gerando a imagem…", params=json.dumps({**params, "seed": values["seed"]}))
        r = await client.post(f"{COMFY_URL}/prompt", json={"prompt": workflow, "client_id": "ayran-central"})
        if r.status_code != 200:
            raise RuntimeError(f"ComfyUI recusou o pedido: {r.text[:300]}")
        prompt_id = r.json()["prompt_id"]

        deadline = time.time() + 15 * 60
        while time.time() < deadline:
            await asyncio.sleep(1.5)
            try:
                hist = (await client.get(f"{COMFY_URL}/history/{prompt_id}", timeout=60)).json().get(prompt_id)
            except httpx.TimeoutException:
                continue  # a placa de 4 GB as vezes trava o ComfyUI por minutos; espera em vez de falhar
            if not hist:
                continue
            status = hist.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError("Erro no ComfyUI durante a geração")
            images = [img for out in hist.get("outputs", {}).values() for img in out.get("images", [])]
            if images:
                files = []
                for i, img in enumerate(images):
                    data = (await client.get(f"{COMFY_URL}/view", params={
                        "filename": img["filename"], "subfolder": img.get("subfolder", ""), "type": img.get("type", "output"),
                    })).content
                    name = f"{job['id']}_{i}.png"
                    (media_dir / name).write_bytes(data)
                    files.append(name)
                if target:  # modelo pronto / personalizado: ajusta pro tamanho exato pedido
                    set_job(job["id"], error=f"ajustando para {target[0]}×{target[1]}…")
                    for f in files:
                        path = media_dir / f
                        path.write_bytes(await finish_size(client, path.read_bytes(), target[0], target[1], (width, height)))
                if ref:  # a imagem gerada tambem passa pela verificacao antes de aparecer
                    set_job(job["id"], error="verificando a imagem gerada…")
                    try:
                        blocked = any([await safety.is_blocked(media_dir / f) for f in files])
                    except RuntimeError:
                        blocked = True
                    if blocked:
                        for f in files:
                            (media_dir / f).unlink(missing_ok=True)
                        raise ValueError(REF_BLOCKED_MESSAGE)
                return files
        raise TimeoutError("A geração passou de 15 minutos")

    async def worker():
        async with httpx.AsyncClient(timeout=httpx.Timeout(30, read=300)) as client:
            while True:
                job_id = await queue.get()
                with db() as conn:
                    row = conn.execute("select * from media_jobs where id = ?", (job_id,)).fetchone()
                if not row:
                    continue
                job = dict(row)
                started = time.time()
                set_job(job_id, status="gerando", error="")
                try:
                    async with GPU_LOCK:  # uma geracao por vez na placa (galeria + cenas das cidades)
                        files = await run_image(client, job)
                    set_job(job_id, status="pronto", outputs=json.dumps(files), error="",
                            finished_at=int(time.time()))
                except Exception as e:
                    set_job(job_id, status="erro", error=str(e) or e.__class__.__name__, finished_at=int(time.time()))
                finally:
                    (refs_dir / f"{job_id}.jpg").unlink(missing_ok=True)  # a referencia nao fica guardada
                    try:
                        await client.post(f"{COMFY_URL}/free", json={"unload_models": True, "free_memory": True})
                    except Exception:
                        pass
                    print(f"[media] job {job_id} em {time.time() - started:.0f}s")

    router.worker = worker  # iniciado no lifespan do app

    @router.get("/capabilities")
    async def capabilities(request: Request, user=Depends(current_user)):
        client: httpx.AsyncClient = request.app.state.http
        vram = await vram_gb(client)
        return {
            "comfy_online": vram > 0,
            "vram_gb": round(vram, 1),
            "image": vram > 0,
            "video": vram >= VIDEO_MIN_VRAM_GB,
            "video_min_vram_gb": VIDEO_MIN_VRAM_GB,
            "sizes": list(SIZES),
            "templates": [{"id": k, "label": v["label"], "group": v["group"], "width": v["w"], "height": v["h"],
                           "hint": v["hint"]} for k, v in TEMPLATES.items()],
            "custom": {"min": CUSTOM_MIN, "max": CUSTOM_MAX, "max_ratio": CUSTOM_MAX_RATIO},
            "styles": list(STYLES),
            "lora": LORA,
            "lora_model": LORA_STRENGTH_MODEL,
            "lora_clip": LORA_STRENGTH_CLIP,
        }

    @router.post("/image")
    async def create_image(req: ImageRequest, user=Depends(current_user)):
        if _BLOCK_MINORS.search(req.prompt):
            raise HTTPException(400, "Não gero conteúdo envolvendo menores de idade.")
        if req.template and req.template not in TEMPLATES:
            raise HTTPException(400, "Modelo desconhecido.")
        if (req.width is None) != (req.height is None):
            raise HTTPException(400, "Informe a largura e a altura.")
        if req.width and req.height:
            if req.width * req.height > CUSTOM_MAX_PIXELS:
                raise HTTPException(400, "Esse tamanho é grande demais (máximo ~4 megapixels).")
            if max(req.width / req.height, req.height / req.width) > CUSTOM_MAX_RATIO:
                raise HTTPException(400, "Proporção extrema demais (máximo 4:1).")
        job_id = uuid.uuid4().hex
        with db() as conn:
            conn.execute(
                "insert into media_jobs (id, user_id, kind, prompt, params, status, created_at) "
                "values (?, ?, 'image', ?, ?, 'na_fila', ?)",
                (job_id, user["id"], req.prompt.strip(), json.dumps(req.model_dump(exclude={"prompt"})), int(time.time())),
            )
        await queue.put(job_id)
        return {"id": job_id, "position": queue.qsize()}

    @router.post("/image-ref")
    async def create_image_from_ref(
        prompt: str = Form(min_length=2, max_length=1000),
        strength: float = Form(0.65, ge=0.2, le=0.95),
        style: str = Form("livre"),
        steps: int = Form(25, ge=10, le=40),
        enhance: bool = Form(True),
        image: UploadFile = File(...),
        user=Depends(current_user),
    ):
        """Cria uma imagem nova a partir de uma imagem de referencia (img2img). Sem nudez/sexual e sem menores."""
        if _BLOCK_MINORS.search(prompt):
            raise HTTPException(400, "Não gero conteúdo envolvendo menores de idade.")
        if _BLOCK_REF_EXPLICIT.search(prompt):
            raise HTTPException(400, REF_BLOCKED_MESSAGE)
        data = await image.read(REF_MAX_BYTES + 1)
        if len(data) > REF_MAX_BYTES:
            raise HTTPException(413, "A imagem passa de 10 MB")
        try:
            Image.open(io.BytesIO(data)).verify()
            im = Image.open(io.BytesIO(data))
            fmt = im.format
            im = ImageOps.exif_transpose(im).convert("RGB")
        except Exception:
            raise HTTPException(400, "Não consegui ler essa imagem. Use JPG, PNG ou WebP.")
        if fmt not in ("JPEG", "PNG", "WEBP"):
            raise HTTPException(400, "Use uma imagem JPG, PNG ou WebP.")
        w, h = im.size
        if min(w, h) < 64:
            raise HTTPException(400, "A imagem é pequena demais.")
        scale = min(1.0, REF_MAX_SIDE / max(w, h))  # so reduz
        if min(w, h) * scale < REF_MIN_SIDE:
            scale = REF_MIN_SIDE / min(w, h)
        nw, nh = max(64, round(w * scale / 8) * 8), max(64, round(h * scale / 8) * 8)
        while nw * nh > 600_000 or max(nw, nh) > 1024:  # 4 GB de VRAM: limite de area
            nw, nh = max(64, round(nw * 0.9 / 8) * 8), max(64, round(nh * 0.9 / 8) * 8)
        im = im.resize((nw, nh), Image.LANCZOS)

        job_id = uuid.uuid4().hex
        im.save(refs_dir / f"{job_id}.jpg", quality=92)
        ratio = nw / nh
        params = {
            "ref": True, "strength": strength, "style": style if style in STYLES else "livre", "steps": steps,
            "enhance": enhance, "width": nw, "height": nh,
            "size": "paisagem" if ratio > 1.15 else "retrato" if ratio < 0.87 else "quadrado",
        }
        with db() as conn:
            conn.execute(
                "insert into media_jobs (id, user_id, kind, prompt, params, status, created_at) "
                "values (?, ?, 'image', ?, ?, 'na_fila', ?)",
                (job_id, user["id"], prompt.strip(), json.dumps(params), int(time.time())),
            )
        await queue.put(job_id)
        return {"id": job_id, "position": queue.qsize()}

    @router.post("/video")
    async def create_video(request: Request, user=Depends(current_user)):
        raise HTTPException(501, f"Vídeo precisa de placa de vídeo com {VIDEO_MIN_VRAM_GB} GB ou mais (chega com o PC novo).")

    @router.get("")
    async def list_jobs(user=Depends(current_user)):
        with db() as conn:
            rows = conn.execute(
                "select * from media_jobs where user_id = ? order by created_at desc limit 60", (user["id"],)
            ).fetchall()
        return [{**dict(r), "params": json.loads(r["params"]), "outputs": json.loads(r["outputs"])} for r in rows]

    @router.get("/{job_id}/file/{n}")
    async def get_file(job_id: str, n: int, user=Depends(current_user)):
        with db() as conn:
            row = conn.execute("select outputs from media_jobs where id = ? and user_id = ?",
                               (job_id, user["id"])).fetchone()
        files = json.loads(row["outputs"]) if row else []
        if n < 0 or n >= len(files):
            raise HTTPException(404, "Arquivo não encontrado")
        return FileResponse(media_dir / files[n], media_type="image/png")

    @router.delete("/{job_id}")
    async def delete_job(job_id: str, user=Depends(current_user)):
        with db() as conn:
            row = conn.execute("select outputs from media_jobs where id = ? and user_id = ?",
                               (job_id, user["id"])).fetchone()
            if not row:
                raise HTTPException(404, "Não encontrado")
            for name in json.loads(row["outputs"]):
                (media_dir / name).unlink(missing_ok=True)
            conn.execute("delete from media_jobs where id = ?", (job_id,))
        return {"ok": True}

    return router
