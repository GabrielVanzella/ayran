"""
title: Ayran
author: Gabriel
description: Um so modelo "Ayran" que escolhe sozinho o especialista certo (conversa, raciocinio ou codigo) pra cada mensagem.
version: 0.1.0
"""

import json
import re
from typing import AsyncGenerator, Optional

import aiohttp
from pydantic import BaseModel, Field

PERSONA = (
    "Voce e o Ayran, assistente de IA do Gabriel e da software house dele. "
    "Fale em portugues do Brasil (a menos que pecam outro idioma), de forma direta, clara e amigavel, "
    "no masculino. Voce ajuda principalmente com desenvolvimento de software, gestao da empresa e "
    "comunicacao. Quando nao souber algo, diga que nao sabe em vez de inventar."
)

ROUTER_PROMPT = (
    "Classifique o pedido do usuario em UMA categoria e responda somente com a palavra:\n"
    "CODIGO - escrever, revisar, explicar, depurar ou planejar codigo, comandos, SQL, APIs, arquitetura de software\n"
    "RACIOCINIO - problema dificil de logica, matematica, analise com varios passos, decisao complexa\n"
    "CONVERSA - todo o resto (conversa, duvidas gerais, textos, resumos, emails)\n\n"
    "Pedido:\n"
)

CODE_HINTS = re.compile(
    r"```|\b(def|class|function|const|import|SELECT|INSERT|stack ?trace|traceback|exception|erro de compila|"
    r"bug|refator|endpoint|regex|typescript|javascript|python|c#|java|react|node|docker|git)\b",
    re.IGNORECASE,
)


class Pipe:
    class Valves(BaseModel):
        OLLAMA_URL: str = Field(default="http://127.0.0.1:11434")
        CHAT_MODEL: str = Field(default="qwen3.5:4b", description="Conversa do dia a dia (rapido)")
        REASONING_MODEL: str = Field(default="qwen3.5:9b", description="Problemas dificeis (pensa antes)")
        CODE_MODEL: str = Field(default="qwen3.6:35b-a3b-coding", description="Codigo (pesado)")
        ROUTER_MODEL: str = Field(default="qwen3.5:4b", description="Modelo que classifica o pedido")
        NUM_CTX: int = Field(default=8192)
        SHOW_ROUTE: bool = Field(default=True, description="Mostra qual especialista respondeu")

    def __init__(self):
        self.valves = self.Valves()

    # ---------- helpers ----------

    @staticmethod
    def _to_ollama_messages(messages: list) -> list:
        """Converte mensagens no formato OpenAI (texto + imagens) pro formato do Ollama."""
        out = []
        for m in messages:
            content = m.get("content", "")
            images = []
            if isinstance(content, list):
                texts = []
                for part in content:
                    if part.get("type") == "text":
                        texts.append(part.get("text", ""))
                    elif part.get("type") == "image_url":
                        url = part.get("image_url", {}).get("url", "")
                        if url.startswith("data:") and "," in url:
                            images.append(url.split(",", 1)[1])
                content = "\n".join(texts)
            msg = {"role": m.get("role", "user"), "content": content or ""}
            if images:
                msg["images"] = images
            out.append(msg)
        return out

    @staticmethod
    def _last_user_text(messages: list) -> str:
        for m in reversed(messages):
            if m.get("role") == "user":
                return m.get("content", "") if isinstance(m.get("content"), str) else ""
        return ""

    async def _route(self, session: aiohttp.ClientSession, text: str) -> str:
        if "```" in text:
            return "CODIGO"
        try:
            payload = {
                "model": self.valves.ROUTER_MODEL,
                "messages": [{"role": "user", "content": ROUTER_PROMPT + text[:2000]}],
                "stream": False,
                "think": False,
                # mesmo num_ctx da resposta: se mudar, o Ollama recarrega o modelo (~10s)
                "options": {"temperature": 0, "num_predict": 6, "num_ctx": self.valves.NUM_CTX},
            }
            async with session.post(f"{self.valves.OLLAMA_URL}/api/chat", json=payload) as r:
                answer = (await r.json())["message"]["content"].upper()
            for label in ("CODIGO", "RACIOCINIO", "CONVERSA"):
                if label in answer:
                    return label
        except Exception:
            pass
        return "CODIGO" if CODE_HINTS.search(text) else "CONVERSA"

    async def _status(self, emitter, description: str, done: bool):
        if emitter and self.valves.SHOW_ROUTE:
            await emitter({"type": "status", "data": {"description": description, "done": done}})

    # ---------- entry point ----------

    async def pipe(
        self, body: dict, __event_emitter__=None, __task__: Optional[str] = None
    ) -> AsyncGenerator[str, None] | str:
        messages = self._to_ollama_messages(body.get("messages", []))
        if not any(m["role"] == "system" for m in messages):
            messages.insert(0, {"role": "system", "content": PERSONA})

        timeout = aiohttp.ClientTimeout(total=None, sock_read=600)
        session = aiohttp.ClientSession(timeout=timeout)

        if __task__:
            route = "CONVERSA"  # titulos/tags etc: sempre o modelo leve
        else:
            await self._status(__event_emitter__, "Ayran escolhendo o especialista...", False)
            route = await self._route(session, self._last_user_text(body.get("messages", [])))

        model, think, label = {
            "CODIGO": (self.valves.CODE_MODEL, False, "codigo"),
            "RACIOCINIO": (self.valves.REASONING_MODEL, True, "raciocinio"),
            "CONVERSA": (self.valves.CHAT_MODEL, False, "conversa"),
        }[route]

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "think": think,
            "options": {"num_ctx": self.valves.NUM_CTX},
        }
        for key in ("temperature", "top_p", "seed"):
            if key in body:
                payload["options"][key] = body[key]
        if body.get("max_tokens"):
            payload["options"]["num_predict"] = body["max_tokens"]

        if not body.get("stream", False):
            payload["stream"] = False
            try:
                async with session.post(f"{self.valves.OLLAMA_URL}/api/chat", json=payload) as r:
                    data = await r.json()
                return data.get("message", {}).get("content", "")
            finally:
                await session.close()

        return self._stream(session, payload, label, model, __event_emitter__)

    async def _stream(self, session, payload, label, model, emitter) -> AsyncGenerator[str, None]:
        loading = " (carregando o modelo, pode levar ~40s)" if label == "codigo" else ""
        await self._status(emitter, f"Ayran usando: {label} - {model}{loading}", False)
        in_think = False
        try:
            async with session.post(f"{self.valves.OLLAMA_URL}/api/chat", json=payload) as r:
                if r.status != 200:
                    yield f"Erro do Ollama ({r.status}): {await r.text()}"
                    return
                async for raw in r.content:
                    line = raw.decode("utf-8").strip()
                    if not line:
                        continue
                    chunk = json.loads(line)
                    msg = chunk.get("message", {})
                    if msg.get("thinking"):
                        if not in_think:
                            in_think = True
                            yield "<think>"
                        yield msg["thinking"]
                    if msg.get("content"):
                        if in_think:
                            in_think = False
                            yield "</think>\n"
                        yield msg["content"]
                    if chunk.get("done"):
                        break
            if in_think:
                yield "</think>\n"
            await self._status(emitter, f"Respondido por: {label} ({model})", True)
        finally:
            await session.close()
