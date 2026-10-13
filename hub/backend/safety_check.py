"""Verifica se uma imagem tem conteudo sexual/nudez. Roda no Python do ComfyUI (tem torch + transformers).

Uso:  <python do comfy-venv> safety_check.py <imagem>   ->  ultima linha do stdout: {"nsfw": 0.0-1.0}
Modelo: Falconsai/nsfw_image_detection (ViT, ~350 MB, baixa na primeira vez). Roda na CPU pra nao disputar a VRAM.
"""

import json
import sys

from PIL import Image
from transformers import pipeline

classifier = pipeline("image-classification", model="Falconsai/nsfw_image_detection", device="cpu")
image = Image.open(sys.argv[1]).convert("RGB")
scores = classifier(image, top_k=None)
nsfw = next((r["score"] for r in scores if r["label"].lower() == "nsfw"), 0.0)
print(json.dumps({"nsfw": round(float(nsfw), 4)}))
