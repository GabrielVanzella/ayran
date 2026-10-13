"""Cliente minimo do ComfyUI (texto->imagem e aumento de resolucao) + trava da GPU.

A placa so aguenta uma geracao por vez: tudo que usa a GPU (galeria dos usuarios e cenas das cidades)
passa por GPU_LOCK.
"""

import asyncio
import json
import random
import time
from pathlib import Path

import httpx

COMFY_URL = "http://127.0.0.1:8188"
OLLAMA_URL = "http://127.0.0.1:11434"
WORKFLOWS = Path(__file__).parent / "workflows"
CHECKPOINT = "DreamShaper_8_pruned.safetensors"
UPSCALE_MODEL = "RealESRGAN_x4plus.pth"

GPU_LOCK = asyncio.Lock()


async def free_ollama_gpu(client: httpx.AsyncClient):
    """Tira os modelos de texto da placa antes de gerar imagem (4 GB nao comportam os dois)."""
    try:
        loaded = (await client.get(f"{OLLAMA_URL}/api/ps", timeout=5)).json().get("models", [])
        for m in loaded:
            await client.post(f"{OLLAMA_URL}/api/generate", json={"model": m["name"], "keep_alive": 0}, timeout=30)
    except Exception:
        pass


async def free_comfy(client: httpx.AsyncClient):
    try:
        await client.post(f"{COMFY_URL}/free", json={"unload_models": True, "free_memory": True}, timeout=15)
    except Exception:
        pass


async def _run(client: httpx.AsyncClient, workflow: dict, timeout_s: int = 15 * 60) -> bytes:
    r = await client.post(f"{COMFY_URL}/prompt", json={"prompt": workflow, "client_id": "ayran-scenes"})
    if r.status_code != 200:
        raise RuntimeError(f"ComfyUI recusou o pedido: {r.text[:300]}")
    prompt_id = r.json()["prompt_id"]
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        await asyncio.sleep(2)
        hist = (await client.get(f"{COMFY_URL}/history/{prompt_id}")).json().get(prompt_id)
        if not hist:
            continue
        if hist.get("status", {}).get("status_str") == "error":
            raise RuntimeError("Erro no ComfyUI durante a geração")
        images = [i for out in hist.get("outputs", {}).values() for i in out.get("images", [])]
        if images:
            img = images[0]
            resp = await client.get(f"{COMFY_URL}/view", params={
                "filename": img["filename"], "subfolder": img.get("subfolder", ""), "type": img.get("type", "output"),
            })
            return resp.content
    raise TimeoutError("A geração passou do tempo limite")


async def txt2img(client: httpx.AsyncClient, prompt: str, negative: str, width: int, height: int,
                  steps: int = 30, seed: int | None = None, checkpoint: str = CHECKPOINT) -> bytes:
    values = {
        "seed": seed or random.randint(1, 2**31), "steps": steps, "checkpoint": checkpoint,
        "width": width, "height": height, "prompt": prompt, "negative": negative,
    }
    workflow = json.loads((WORKFLOWS / "image_sd15.json").read_text(encoding="utf-8"))
    for node in workflow.values():
        for k, v in node["inputs"].items():
            if isinstance(v, str) and v.startswith("{{") and v.endswith("}}"):
                node["inputs"][k] = values[v[2:-2]]
    return await _run(client, workflow)


async def upscale(client: httpx.AsyncClient, image: bytes) -> bytes:
    """Real-ESRGAN x4 (768x512 -> 3072x2048)."""
    up = await client.post(f"{COMFY_URL}/upload/image",
                           files={"image": ("ayran-scene.png", image, "image/png")}, data={"overwrite": "true"})
    up.raise_for_status()
    workflow = {
        "1": {"class_type": "LoadImage", "inputs": {"image": up.json()["name"]}},
        "2": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": UPSCALE_MODEL}},
        "3": {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]}},
        "4": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ayran-upscale", "images": ["3", 0]}},
    }
    return await _run(client, workflow)
