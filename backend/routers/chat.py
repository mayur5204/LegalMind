import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from backend.models.schemas import ChatRequest
from backend.services.vector_store import get_top_chunks_multi
from backend.services.ollama_client import stream_ollama

router = APIRouter()

CHAT_PROMPT = """You are a legal document analyst. Extract and explain information from the legal documents below with precision.

When answering:
- Identify the relevant **parties**, their **obligations**, and their **rights**
- Reference specific **clause numbers**, **sections**, or **article numbers** when available
- Flag key **dates**, **deadlines**, **conditions precedent**, and **penalties**
- Define any **legal terms** in plain language after quoting them
- Highlight **risks** or **liabilities** that may affect a party
- If information is not present in the context, state this explicitly — never speculate
- Format using Markdown: **bold** for key terms, bullet lists for obligations/rights, ## headings for distinct sections

Context:
{context}

{history}Question: {question}

Answer:"""


@router.post("/chat")
async def chat(request: ChatRequest):
    if not request.docs:
        raise HTTPException(status_code=400, detail="No documents selected.")

    doc_ids = [d.doc_id for d in request.docs]
    filenames = {d.doc_id: d.filename for d in request.docs}

    chunks = get_top_chunks_multi(doc_ids, filenames, request.question, k=6)
    if not chunks:
        raise HTTPException(status_code=404, detail="No content found in selected documents.")

    context = "\n\n".join(
        f"[{c['filename']}, Page {c['page']}] {c['text']}" for c in chunks
    )

    history_text = ""
    for turn in request.history:
        if isinstance(turn, dict):
            role = turn.get("role", "")
            content = turn.get("content", "")
            if role == "user":
                history_text += f"Previous Question: {content}\n"
            elif role == "assistant":
                history_text += f"Previous Answer: {content}\n"
    if history_text:
        history_text += "\n"

    prompt = CHAT_PROMPT.format(context=context, history=history_text, question=request.question)

    async def generate():
        async for token in stream_ollama(prompt):
            yield f"data: {json.dumps(token)}\n\n"

        yield "data: [DONE]\n\n"

        citations = [
            {"page": c["page"], "text": c["text"][:150], "filename": c["filename"]}
            for c in chunks
        ]
        yield f"data: {json.dumps({'citations': citations})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
