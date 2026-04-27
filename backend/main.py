import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")]

from backend.services.ollama_client import check_ollama_health
from backend.routers import ingest, chat, questions, classify


@asynccontextmanager
async def lifespan(app: FastAPI):
    healthy = await check_ollama_health()
    if not healthy:
        print("WARNING: Ollama is not reachable — start Ollama before using LegalMind.")
    else:
        print("Ollama is running.")
    yield


app = FastAPI(title="LegalMind API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
