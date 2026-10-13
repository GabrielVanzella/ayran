"""Metricas reais do servidor pra tela inicial: CPU, RAM, GPU, disco, modelo carregado e saude dos servicos."""

import asyncio
import shutil
import subprocess
from pathlib import Path

import httpx
import psutil
from fastapi import APIRouter, Depends, Request

SERVICES = [
    ("ollama", "Ollama", "http://127.0.0.1:11434/api/version", "Modelos de texto"),
    ("webui", "Open WebUI", "http://127.0.0.1:8080/health", "Contas e API"),
    ("comfy", "ComfyUI", "http://127.0.0.1:8188/system_stats", "Imagem e vídeo"),
    ("tunnel", None, None, "Acesso externo"),  # tratado a parte: nao tem porta local
]


def gpu_info() -> dict | None:
    exe = shutil.which("nvidia-smi")
    if not exe:
        return None
    try:
        out = subprocess.run(
            [exe, "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip().splitlines()[0]
        name, used, total, util, temp = [p.strip() for p in out.split(",")]
        return {"name": name, "used_mb": int(used), "total_mb": int(total), "util": int(util), "temp": int(temp)}
    except Exception:
        return None


def tunnel_up() -> bool:
    return any((p.info["name"] or "").lower().startswith("cloudflared") for p in psutil.process_iter(["name"]))


def build_router(current_user) -> APIRouter:
    router = APIRouter(prefix="/api")

    async def probe(client: httpx.AsyncClient, url: str) -> bool:
        try:
            return (await client.get(url, timeout=2)).status_code < 500
        except Exception:
            return False

    @router.get("/system")
    async def system(request: Request, user=Depends(current_user)):
        client: httpx.AsyncClient = request.app.state.http
        urls = [s for s in SERVICES if s[2]]
        results = await asyncio.gather(*[probe(client, s[2]) for s in urls])
        up = {s[0]: ok for s, ok in zip(urls, results)}
        up["tunnel"] = tunnel_up()

        loaded = None
        try:
            ps = (await client.get("http://127.0.0.1:11434/api/ps", timeout=2)).json().get("models", [])
            loaded = ps[0]["name"] if ps else None
        except Exception:
            pass

        mem = psutil.virtual_memory()
        disk = shutil.disk_usage(Path.home().anchor or "C:\\")
        return {
            "cpu": psutil.cpu_percent(interval=0.3),
            "ram": {"used_gb": round(mem.used / 1024**3, 1), "total_gb": round(mem.total / 1024**3, 1),
                    "percent": mem.percent},
            "disk": {"free_gb": round(disk.free / 1024**3), "total_gb": round(disk.total / 1024**3),
                     "percent": round(disk.used / disk.total * 100)},
            "gpu": gpu_info(),
            "model": loaded,
            "services": [
                {"id": s[0], "label": s[1] or "Túnel Cloudflare", "hint": s[3], "up": up[s[0]]} for s in SERVICES
            ],
        }

    return router
