"""Voz local: ouvir (faster-whisper) e falar (Piper). Tudo roda no servidor, em CPU, sem enviar audio para a nuvem."""

import asyncio
import io
import os
import wave
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

AYRAN_HOME = Path(os.environ.get("AYRAN_HOME", Path.home() / "ayran-server"))
VOICES_DIR = AYRAN_HOME / "data" / "voices"
WHISPER_DIR = AYRAN_HOME / "data" / "whisper"
WHISPER_MODEL = os.environ.get("AYRAN_WHISPER_MODEL", "small")
DEFAULT_VOICE = "pt_BR-faber-medium"
MAX_AUDIO = 15 * 1024 * 1024
# ajuda o reconhecimento com nomes proprios que o modelo nao conhece
HINT = "Conversa em português do Brasil com o Ayran, assistente da VZ Tecnologia. Gabriel, Douglas."

VOICE_NAMES = {
    "pt_BR-faber-medium": "Faber (masculina, clara)",
    "pt_BR-cadu-medium": "Cadu (masculina, jovem)",
    "pt_BR-jeff-medium": "Jeff (masculina, grave)",
}

_lock = asyncio.Lock()  # CPU: uma tarefa de voz por vez
_stt = None
_voices: dict = {}


def _voice_ids() -> list[str]:
    return sorted(p.stem for p in VOICES_DIR.glob("*.onnx")) if VOICES_DIR.exists() else []


def _load_stt():
    global _stt
    if _stt is None:
        from faster_whisper import WhisperModel

        _stt = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8", cpu_threads=4, download_root=str(WHISPER_DIR))
    return _stt


def _load_voice(voice_id: str):
    if voice_id not in _voices:
        from piper import PiperVoice

        _voices[voice_id] = PiperVoice.load(str(VOICES_DIR / f"{voice_id}.onnx"))
    return _voices[voice_id]


def _transcribe(data: bytes) -> str:
    segments, _ = _load_stt().transcribe(
        io.BytesIO(data),
        language="pt",
        vad_filter=True,
        beam_size=1,
        initial_prompt=HINT,
        condition_on_previous_text=False,
    )
    return " ".join(s.text.strip() for s in segments).strip()


def _synthesize(text: str, voice_id: str, speed: float) -> bytes:
    from piper import SynthesisConfig

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        _load_voice(voice_id).synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=1.0 / speed))
    return buf.getvalue()


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    voice: str = DEFAULT_VOICE
    speed: float = Field(default=1.0, ge=0.7, le=1.5)


def build_router(current_user) -> APIRouter:
    router = APIRouter(prefix="/api/voice")

    @router.get("/status")
    async def status(user=Depends(current_user)):
        ids = _voice_ids()
        return {
            "stt": True,
            "tts": bool(ids),
            "default": DEFAULT_VOICE if DEFAULT_VOICE in ids else (ids[0] if ids else None),
            "voices": [{"id": i, "name": VOICE_NAMES.get(i, i)} for i in ids],
        }

    @router.post("/stt")
    async def stt(request: Request, user=Depends(current_user)):
        data = await request.body()
        if not data:
            raise HTTPException(400, "Áudio vazio")
        if len(data) > MAX_AUDIO:
            raise HTTPException(413, "Áudio grande demais")
        async with _lock:
            try:
                text = await asyncio.to_thread(_transcribe, data)
            except Exception as e:  # audio corrompido / formato nao suportado
                raise HTTPException(422, f"Não consegui entender esse áudio ({type(e).__name__})")
        return {"text": text}

    @router.post("/tts")
    async def tts(body: SpeakIn, user=Depends(current_user)):
        if body.voice not in _voice_ids():
            raise HTTPException(404, "Voz não encontrada")
        async with _lock:
            wav = await asyncio.to_thread(_synthesize, body.text, body.voice, body.speed)
        return Response(wav, media_type="audio/wav", headers={"Cache-Control": "no-store"})

    return router
