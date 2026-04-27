from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.services.ollama_client import check_ollama_health
from backend.routers import ingest, chat, questions, classify


@asynccontextmanager
async def lifespan(app: FastAPI):
    healthy = await check_ollama_health()
    if not healthy:
        print("WARNING: Ollama is not reachable at http://localhost:11434 — start Ollama before using DocMind.")
    else:
        print("Ollama is running.")
    yield


app = FastAPI(title="DocMind API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(questions.router, prefix="/api")
app.include_router(classify.router, prefix="/api")


@app.get("/health")
async def health():
    ollama_ok = await check_ollama_health()
    if not ollama_ok:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "ollama": False},
        )
    return {"status": "ok", "ollama": True}
