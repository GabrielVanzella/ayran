"""Aumenta a resolucao das cenas de fundo (768x512 -> ~2400x1600) com Real-ESRGAN x4 via ComfyUI.

Uso:  <python do hub-venv> server/upscale-scenes.py [cena ...]
Le hub/frontend/public/scenes/<cena>.jpg e regrava no mesmo lugar (guarda o original em scenes/original/).
Requer o ComfyUI no ar (127.0.0.1:8188) e o modelo em comfyui-models/upscale_models/RealESRGAN_x4plus.pth.
"""

import io
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
SCENES = Path(__file__).resolve().parent.parent / "hub" / "frontend" / "public" / "scenes"
MODEL = "RealESRGAN_x4plus.pth"
TARGET_W = 2400  # largura final (o x4 gera 3072; reduz pra segurar o peso do arquivo)


def post_json(path, body):
    req = urllib.request.Request(COMFY + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def upload(name, data):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: image/jpeg\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(COMFY + "/upload/image", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    return json.load(urllib.request.urlopen(req, timeout=60))["name"]


def upscale(name):
    workflow = {
        "1": {"class_type": "LoadImage", "inputs": {"image": name}},
        "2": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": MODEL}},
        "3": {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]}},
        "4": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ayran-upscale", "images": ["3", 0]}},
    }
    pid = post_json("/prompt", {"prompt": workflow, "client_id": "ayran-upscale"})["prompt_id"]
    deadline = time.time() + 20 * 60
    while time.time() < deadline:
        time.sleep(2)
        hist = json.load(urllib.request.urlopen(f"{COMFY}/history/{pid}", timeout=30)).get(pid)
        if not hist:
            continue
        if hist.get("status", {}).get("status_str") == "error":
            raise RuntimeError(json.dumps(hist["status"])[:400])
        imgs = [i for o in hist.get("outputs", {}).values() for i in o.get("images", [])]
        if imgs:
            q = urllib.parse.urlencode({"filename": imgs[0]["filename"], "subfolder": imgs[0].get("subfolder", ""),
                                        "type": imgs[0].get("type", "output")})
            return urllib.request.urlopen(f"{COMFY}/view?{q}", timeout=120).read()
    raise TimeoutError("upscale passou de 20 minutos")


def main():
    from PIL import Image

    names = sys.argv[1:] or [p.stem for p in sorted(SCENES.glob("*.jpg"))]
    (SCENES / "original").mkdir(exist_ok=True)
    for n in names:
        src = SCENES / f"{n}.jpg"
        backup = SCENES / "original" / f"{n}.jpg"
        if not backup.exists():
            backup.write_bytes(src.read_bytes())
        data = backup.read_bytes()  # sempre parte do original, entao dar de novo nao "reaumenta"
        t = time.time()
        png = upscale(upload(f"scene-{n}.jpg", data))
        im = Image.open(io.BytesIO(png)).convert("RGB")
        im = im.resize((TARGET_W, round(im.height * TARGET_W / im.width)), Image.LANCZOS)
        im.save(src, quality=86, optimize=True, progressive=True)
        print(f"{n}: ok {im.size} {src.stat().st_size // 1024} KB em {time.time() - t:.0f}s", flush=True)


if __name__ == "__main__":
    main()
