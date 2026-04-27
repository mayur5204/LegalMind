import uuid
import json
import tempfile
import os
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse
from backend.services.pdf_processor import extract_and_chunk
from backend.services.vector_store import add_chunks

router = APIRouter()

EMBED_BATCH = 25


def _event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/ingest")
async def ingest_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        async def _err():
            yield _event({"step": "error", "message": "Only PDF files are accepted."})
        return StreamingResponse(_err(), media_type="text/event-stream")

    file_bytes = await file.read()
    filename = file.filename
    doc_id = str(uuid.uuid4())

    async def generate():
        tmp_path = None
        try:
            yield _event({"step": "saving", "message": "Saving file…"})

            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name

            yield _event({"step": "extracting", "message": "Extracting text from PDF…"})
            try:
                chunks, page_count = extract_and_chunk(tmp_path, doc_id)
            except ValueError as e:
                yield _event({"step": "error", "message": str(e)})
                return

            yield _event({
                "step": "chunking",
                "message": f"Split into {len(chunks)} chunks across {page_count} pages",
            })

            total = len(chunks)
            for i in range(0, total, EMBED_BATCH):
                batch = chunks[i : i + EMBED_BATCH]
                add_chunks(doc_id, batch)
                done = min(i + EMBED_BATCH, total)
                yield _event({
                    "step": "embedding",
                    "message": f"Embedding chunks… {done}/{total}",
                    "progress": done,
                    "total": total,
                })

            yield _event({
                "step": "done",
                "doc_id": doc_id,
                "filename": filename,
                "page_count": page_count,
                "chunk_count": total,
                "status": "ready",
            })

        except Exception as e:
            yield _event({"step": "error", "message": f"Unexpected error: {e}"})
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    return StreamingResponse(generate(), media_type="text/event-stream")
