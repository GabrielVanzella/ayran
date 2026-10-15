"""Busca fotos REAIS de clima no Wikimedia Commons (licencas livres) para o fundo da Central.

Uso:
  python fetch-scene-photos.py candidates <pasta>        baixa candidatas por cena + folha de contato (para escolher)
  python fetch-scene-photos.py install <pasta> scene=N ...   instala a candidata N de cada cena em hub/frontend/public/scenes
                                                             e grava os creditos em credits.json

Nada de chave de API. Cada foto mantem autor e licenca (exigencia das licencas CC BY / CC BY-SA).
Roda com o Python do hub (precisa de Pillow e httpx).
"""

import json
import re
import sys
from pathlib import Path

import httpx
from PIL import Image, ImageDraw

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "AyranCentral/1.0 (https://vztecnologia.com.br/ayran; gabrielvanzella1@gmail.com)"}
ROOT = Path(__file__).resolve().parents[1] / "hub" / "frontend" / "public" / "scenes"
FREE = re.compile(r"^(cc0|public domain|pd|cc[- ]by(?:[- ]sa)?[- ]\d)", re.I)

# cena -> consultas (em ingles funciona melhor no Commons)
QUERIES = {
    "praia": ["tropical beach turquoise water palm", "beach sand sea sunny coast"],
    "dia": ["blue sky sunny day mountains valley landscape", "clear sky green hills landscape"],
    "sol": ["sunset golden hour landscape", "sunrise orange sky mountains"],
    "nublado": ["overcast cloudy sky mountains landscape", "grey clouds hills valley"],
    "chuva": ["rain city street wet", "rainy day landscape raindrops"],
    "tempestade": ["thunderstorm lightning landscape", "storm clouds dramatic sky"],
    "neblina": ["fog mist valley morning landscape", "misty forest morning"],
    "noite": ["night sky stars milky way landscape", "starry night mountains"],
    "frio": ["snow covered mountains winter landscape", "frozen lake winter snow"],
    "escritorio": [
        "software developers office",
        "developers bay office",
        "software company office interior",
        "IT company office workspace",
        "programmers desks monitors office",
        "technology company headquarters interior",
    ],
}


CATEGORIES = ['incategory:"Featured pictures on Wikimedia Commons"', 'incategory:"Quality images"', ""]


def search(client: httpx.Client, query: str, category: str, limit: int = 50) -> list[dict]:
    r = client.get(API, params={
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrlimit": limit,
        "gsrsearch": f"{query} filetype:bitmap {category}".strip(),
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 2560,
    }, headers=UA, timeout=60)
    r.raise_for_status()
    return list((r.json().get("query", {}).get("pages") or {}).values())


def usable(page: dict, min_w: int = 3000) -> dict | None:
    info = (page.get("imageinfo") or [{}])[0]
    meta = info.get("extmetadata", {})
    lic = meta.get("LicenseShortName", {}).get("value", "")
    w, h = info.get("width", 0), info.get("height", 0)
    if not FREE.match(lic.strip()) or w < min_w or not h or not (1.35 <= w / h <= 2.3):
        return None
    if info.get("mime") not in ("image/jpeg",):
        return None
    clean = lambda s: re.sub(r"<[^>]+>", "", s or "").strip()
    return {
        "title": page["title"].removeprefix("File:"),
        "thumb": info["thumburl"],
        "page": info["descriptionurl"],
        "author": clean(meta.get("Artist", {}).get("value", "")) or "autor desconhecido",
        "license": lic.strip(),
        "license_url": meta.get("LicenseUrl", {}).get("value", ""),
        "size": f"{w}x{h}",
    }


def candidates(out: Path, per_scene: int = 9, only: set[str] | None = None):
    out.mkdir(parents=True, exist_ok=True)
    meta: dict[str, list[dict]] = {}
    with httpx.Client(follow_redirects=True) as client:
        for scene, queries in QUERIES.items():
            if only and scene not in only:
                continue
            found: dict[str, dict] = {}
            for category in CATEGORIES:
                for q in queries:
                    for page in search(client, q, category):
                        u = usable(page, 1800 if scene == "escritorio" else 3000)
                        if u and u["title"] not in found:
                            found[u["title"]] = u
                if len(found) >= per_scene:
                    break
            picks = list(found.values())[:per_scene]
            meta[scene] = picks
            for i, c in enumerate(picks):
                path = out / f"{scene}_{i}.jpg"
                if not path.exists():
                    path.write_bytes(client.get(c["thumb"], headers=UA, timeout=120).content)
            print(scene, len(picks), "candidatas")
    old = json.loads((out / "candidates.json").read_text(encoding="utf-8")) if (out / "candidates.json").exists() else {}
    (out / "candidates.json").write_text(json.dumps({**old, **meta}, ensure_ascii=False, indent=2), encoding="utf-8")
    # folha de contato por cena (3 colunas) para escolher no olho
    for scene, picks in meta.items():
        thumbs = []
        for i, _ in enumerate(picks):
            im = Image.open(out / f"{scene}_{i}.jpg").convert("RGB")
            im.thumbnail((520, 300))
            canvas = Image.new("RGB", (520, 300), "black")
            canvas.paste(im, ((520 - im.width) // 2, (300 - im.height) // 2))
            ImageDraw.Draw(canvas).rectangle((0, 0, 40, 34), fill="black")
            ImageDraw.Draw(canvas).text((12, 10), str(i), fill="white")
            thumbs.append(canvas)
        if not thumbs:
            continue
        cols = 3
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 520, rows * 300), "black")
        for n, t in enumerate(thumbs):
            sheet.paste(t, ((n % cols) * 520, (n // cols) * 300))
        sheet.save(out / f"sheet_{scene}.jpg", quality=82)


def install(out: Path, choices: dict[str, str]):
    """choices: cena -> 'N' (candidata N da propria cena) ou 'outra:N' (candidata N de outra busca, ex.: chuvaX:1)."""
    meta = json.loads((out / "candidates.json").read_text(encoding="utf-8"))
    ROOT.mkdir(parents=True, exist_ok=True)
    credits_file = ROOT / "credits.json"
    credits = json.loads(credits_file.read_text(encoding="utf-8")) if credits_file.exists() else {}  # mantem as cenas ja instaladas
    for scene, choice in choices.items():
        src, _, n = choice.rpartition(":")
        src, n = src or scene, int(n)
        c = meta[src][n]
        im = Image.open(out / f"{src}_{n}.jpg").convert("RGB")
        if im.width > 2560:
            im = im.resize((2560, round(im.height * 2560 / im.width)), Image.LANCZOS)
        im.save(ROOT / f"{scene}.jpg", quality=84, optimize=True, progressive=True)
        credits[scene] = {k: c[k] for k in ("title", "author", "license", "license_url", "page")}
        print("instalada", scene, "<-", c["title"])
    credits_file.write_text(json.dumps(credits, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    cmd, folder = sys.argv[1], Path(sys.argv[2])
    if cmd == "candidates":
        candidates(folder, only=set(sys.argv[3:]) or None)
    elif cmd == "install":
        install(folder, dict(a.split("=") for a in sys.argv[3:]))
