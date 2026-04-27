import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from backend.services.vector_store import get_all_chunks
from backend.services.ollama_client import stream_ollama

router = APIRouter()

MINDMAP_PROMPT = """You are an expert at creating structured mind maps from documents.
Create a comprehensive hierarchical mind map in Markdown heading format.

Strict rules:
- Line 1 MUST be: # <Central Topic>  (the document's main subject)
- Use ## for 4-6 major themes or sections
- Use ### for key concepts under each section (2-4 per section)
- Use #### for specific details or sub-points (1-3 per concept)
- Each node: max 7 words, no punctuation at end
- Output ONLY the Markdown headings. No prose, no bullet points, no fences.

Document content:
{context}

Mind Map:"""


@router.post("/mindmap/{doc_id}")
async def generate_mindmap(doc_id: str):
    chunks = get_all_chunks(doc_id, limit=20)
    if not chunks:
        raise HTTPException(status_code=404, detail="Document not found.")

    context = "\n\n".join(f"[Page {c['page']}] {c['text']}" for c in chunks)
    prompt = MINDMAP_PROMPT.format(context=context)

    async def generate():
        async for token in stream_ollama(prompt, temperature=0.2):
            # JSON-encode so newlines in markdown tokens don't break SSE framing
            yield f"data: {json.dumps(token)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
