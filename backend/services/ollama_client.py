import httpx
import json
from typing import AsyncGenerator

OLLAMA_BASE = "http://127.0.0.1:11434"


async def call_ollama(
    prompt: str, model: str = "gemma4:31b-cloud", temperature: float = 0.1
) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature},
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{OLLAMA_BASE}/api/generate", json=payload)
        resp.raise_for_status()
        return resp.json()["response"]


async def stream_ollama(
    prompt: str, model: str = "gemma4:31b-cloud", temperature: float = 0.3
) -> AsyncGenerator[str, None]:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": True,
        "options": {"temperature": temperature},
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST", f"{OLLAMA_BASE}/api/generate", json=payload
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                data = json.loads(line)
                token = data.get("response", "")
                if token:
                    yield token
                if data.get("done"):
                    break


async def check_ollama_health() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_BASE}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False
