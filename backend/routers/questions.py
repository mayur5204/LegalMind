import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.vector_store import get_top_chunks_multi
from backend.services.ollama_client import call_ollama

router = APIRouter()

QUESTIONS_PROMPT = """You are a legal analyst. Based on the legal document excerpts below, generate exactly {n} specific questions that a lawyer or client would want to ask about this document.

Requirements:
- Questions must reference actual content found in the document (parties, clauses, terms, dates, amounts)
- Cover different aspects: parties & roles, obligations, rights, payment, termination, liability, governing law
- Each question must be directly answerable from the document
- Keep each question under 15 words
- Output ONLY a raw JSON array of question strings — no numbering, no markdown, no commentary

Content:
{context}

JSON array:"""


class QuestionRequest(BaseModel):
    docs: list[dict]  # [{doc_id, filename}]


def _extract_json_array(raw: str) -> list:
    clean = re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()
    start = clean.find("[")
    end = clean.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON array found")
    return json.loads(clean[start: end + 1])


@router.post("/questions")
async def generate_questions(request: QuestionRequest):
    if not request.docs:
        raise HTTPException(status_code=400, detail="No documents provided.")

    doc_ids = [d["doc_id"] for d in request.docs]
    filenames = {d["doc_id"]: d["filename"] for d in request.docs}

    chunks = get_top_chunks_multi(doc_ids, filenames, "key clauses parties obligations rights", k=8)
    if not chunks:
        raise HTTPException(status_code=404, detail="No content found.")

    context = "\n\n".join(
        f"[{c['filename']}, Page {c['page']}] {c['text']}" for c in chunks
    )
    prompt = QUESTIONS_PROMPT.format(n=8, context=context)

    raw = await call_ollama(prompt, temperature=0.3)

    try:
        questions = _extract_json_array(raw)
        if not isinstance(questions, list) or len(questions) == 0:
            raise ValueError("Empty list")
        questions = [q for q in questions if isinstance(q, str) and q.strip()][:8]
    except Exception:
        raise HTTPException(status_code=422, detail="Could not parse questions. Please retry.")

    return {"questions": questions}
