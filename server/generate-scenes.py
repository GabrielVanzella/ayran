"""Gera as cenas de fundo da Central (uma por clima) com o gerador de imagens do proprio Ayran.

Uso:  <python do hub-venv> server/generate-scenes.py [cena ...]
Cada cena vira hub/frontend/public/scenes/<cena>.jpg. Sem argumentos, gera todas.
Requer a Central rodando em localhost (login automatico) e o ComfyUI no ar.
Em GPU maior (PC novo), trocar SIZE/STEPS e/ou o checkpoint por um modelo SDXL pra cenas nitidas em 1920x1080.
"""

import io
import json
import sys
import time
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:3000/ayran"
OUT = Path(__file__).resolve().parent.parent / "hub" / "frontend" / "public" / "scenes"
CHECKPOINT = "DreamShaper_8_pruned.safetensors"
SIZE, STEPS = "paisagem", 30

SCENES = {
    "praia": "tropical beach at midday, turquoise water, white sand, palm trees, clear blue sky, bright sunlight, "
             "wide angle landscape photography, highly detailed, no people",
    "dia": "bright sunny day over green rolling hills and a clear lake, blue sky with a few white clouds, vivid colors, "
           "wide angle landscape photography, highly detailed, no people",
    "sol": "mountain valley at golden hour, dramatic orange and purple sunset sky, river winding through the valley, "
           "layered mountains, autumn forest, wide angle landscape photography, highly detailed, no people",
    "nublado": "overcast sky over green rolling hills and a calm lake, soft diffused light, muted tones, "
               "moody wide angle landscape photography, highly detailed, no people",
    "chuva": "heavy rain on a quiet city street, wet asphalt reflections, soft streetlights, mist, "
             "cinematic moody photography, shallow depth of field, no people",
    "tempestade": "dramatic thunderstorm over the ocean, lightning bolt, dark storm clouds, rough sea, "
                  "cinematic wide angle landscape photography, highly detailed",
    "neblina": "foggy mountain pine forest at dawn, thick mist between the trees, soft light, mysterious, "
               "wide angle landscape photography, highly detailed, no people",
    "noite": "starry night sky with the milky way over mountains and a calm lake, long exposure astrophotography, "
             "deep blue tones, highly detailed, no people",
    "frio": "snow-capped mountains under a clear cold blue sky, crisp winter morning, alpine lake, "
            "wide angle landscape photography, highly detailed, no people",
}


def call(path, body=None, token=None, method=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
        method=method or ("POST" if body is not None else "GET"),
    )
    return urllib.request.urlopen(req, timeout=600)


def main():
    from PIL import Image  # so no momento de salvar

    names = sys.argv[1:] or list(SCENES)
    OUT.mkdir(parents=True, exist_ok=True)
    token = json.load(call("/api/auto-login", {}, method="POST"))["token"]
    for name in names:
        job = json.load(call("/api/media/image", {
            "prompt": SCENES[name], "size": SIZE, "style": "livre", "steps": STEPS, "enhance": False,
            "checkpoint": CHECKPOINT,
        }, token))["id"]
        while True:
            row = next(j for j in json.load(call("/api/media", None, token)) if j["id"] == job)
            if row["status"] in ("pronto", "erro"):
                break
            time.sleep(3)
        if row["status"] != "pronto":
            print(f"{name}: ERRO {row['error']}", flush=True)
            continue
        png = call(f"/api/media/{job}/file/0", None, token).read()
        Image.open(io.BytesIO(png)).convert("RGB").save(OUT / f"{name}.jpg", quality=88, optimize=True)
        call(f"/api/media/{job}", None, token, method="DELETE")  # nao polui a galeria do usuario
        print(f"{name}: ok", flush=True)


if __name__ == "__main__":
    main()
