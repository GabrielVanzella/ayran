"""Verificacao de seguranca de imagens (nudez/sexual) usada no modo com imagem de referencia."""

import asyncio
import json
import os
from pathlib import Path

AYRAN_HOME = Path(os.environ.get("AYRAN_HOME", Path.home() / "ayran-server"))
PYTHON = AYRAN_HOME / "comfy-venv" / "Scripts" / "python.exe"
CHECK = Path(__file__).parent / "safety_check.py"

NSFW_LIMIT = 0.5  # acima disso a imagem e recusada


async def nsfw_score(path: Path) -> float:
    """0.0 (seguro) a 1.0 (explicito). Levanta RuntimeError se a verificacao nao puder rodar: quem chama deve RECUSAR."""
    proc = await asyncio.create_subprocess_exec(
        str(PYTHON), "-I", str(CHECK), str(path),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=600)  # 1a vez baixa o modelo
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("A verificação de segurança demorou demais")
    if proc.returncode != 0:
        raise RuntimeError("A verificação de segurança falhou: " + err.decode(errors="ignore")[-200:])
    try:
        return float(json.loads(out.decode().strip().splitlines()[-1])["nsfw"])
    except Exception:
        raise RuntimeError("A verificação de segurança devolveu uma resposta inválida")


async def is_blocked(path: Path) -> bool:
    return await nsfw_score(path) >= NSFW_LIMIT
