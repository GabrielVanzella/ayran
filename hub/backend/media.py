"""Geracao de imagem (e, quando houver GPU, video) via ComfyUI.

Fila de uma geracao por vez: antes de gerar, libera a GPU do Ollama; depois, libera a do ComfyUI.
O pedido em portugues e traduzido/melhorado pelo Ayran (modelo leve) pro ingles que o SD entende.
"""

import asyncio
import json
import os
import random
import re
import sqlite3
import time
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

COMFY_URL = "http://127.0.0.1:8188"
OLLAMA_URL = "http://127.0.0.1:11434"
PROMPT_MODEL = "qwen3.5:4b"
CHECKPOINT = "DreamShaper_8_pruned.safetensors"
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

SIZES = {"quadrado": (512, 512), "retrato": (512, 768), "paisagem": (768, 512)}
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
        final = job["prompt"]
        if params.get("enhance", True):
            set_job(job["id"], status="gerando", error="Ayran escrevendo o prompt…")
            final = await enhance_prompt(client, job["prompt"])
        if _BLOCK_MINORS.search(job["prompt"]) or _BLOCK_MINORS.search(final):
            raise ValueError("Não gero conteúdo envolvendo menores de idade.")
        style = STYLES.get(params.get("style", "livre"), "")
        final = f"{final}, {style}" if style else final
        set_job(job["id"], final_prompt=final, error="liberando a GPU…")
        await free_ollama_gpu(client)

        width, height = SIZES.get(params.get("size"), SIZES["quadrado"])
        values = {
            "seed": params.get("seed") or random.randint(1, 2**31),
            "steps": params.get("steps", 25),
            "checkpoint": params.get("checkpoint") or CHECKPOINT,
            "width": width,
            "height": height,
            "prompt": final,
            "negative": BASE_NEGATIVE,
        }
        if LORA:
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
            hist = (await client.get(f"{COMFY_URL}/history/{prompt_id}")).json().get(prompt_id)
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
                    files = await run_image(client, job)
                    set_job(job_id, status="pronto", outputs=json.dumps(files), error="",
                            finished_at=int(time.time()))
                except Exception as e:
                    set_job(job_id, status="erro", error=str(e) or e.__class__.__name__, finished_at=int(time.time()))
                finally:
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
            "styles": list(STYLES),
            "lora": LORA,
            "lora_model": LORA_STRENGTH_MODEL,
            "lora_clip": LORA_STRENGTH_CLIP,
        }

    @router.post("/image")
    async def create_image(req: ImageRequest, user=Depends(current_user)):
        if _BLOCK_MINORS.search(req.prompt):
            raise HTTPException(400, "Não gero conteúdo envolvendo menores de idade.")
        job_id = uuid.uuid4().hex
        with db() as conn:
            conn.execute(
                "insert into media_jobs (id, user_id, kind, prompt, params, status, created_at) "
                "values (?, ?, 'image', ?, ?, 'na_fila', ?)",
                (job_id, user["id"], req.prompt.strip(), json.dumps(req.model_dump(exclude={"prompt"})), int(time.time())),
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
