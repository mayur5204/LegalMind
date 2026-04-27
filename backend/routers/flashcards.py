import json
import re
from fastapi import APIRouter, HTTPException, Query
from backend.models.schemas import FlashCard, FlashcardsResponse
from backend.services.vector_store import get_all_chunks
from backend.services.ollama_client import call_ollama

router = APIRouter()

FLASHCARD_PROMPT = """You are a legal analyst creating review flashcards from a legal document.

Generate exactly {n} flashcards as a JSON array. Each object has exactly three string keys:
  "front"  - a precise question about a clause, obligation, right, definition, or term (max 15 words)
  "back"   - a direct, factual answer grounded in the document (max 40 words, must NOT repeat the question)
  "topic"  - exactly one of: Parties, Definitions, Obligations, Rights, Termination, Payment, Liability, Dispute Resolution, Other

Requirements:
- Prioritise: parties & roles, key definitions, obligations, rights, penalties, key dates, governing law
- All cards must cover DISTINCT clauses or concepts — no duplicates
- Answers must be grounded in the content below — never speculate
- Output ONLY the raw JSON array — no markdown fences, no commentary

Content:
{context}

JSON array:"""


def _extract_json_array(raw: str) -> list:
    # Strip markdown fences first
    clean = re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()

    # Find outermost [ ... ] robustly
    start = clean.find("[")
    end = clean.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON array found in model output")

    return json.loads(clean[start : end + 1])


@router.post("/flashcards/{doc_id}", response_model=FlashcardsResponse)
async def generate_flashcards(
    doc_id: str,
    count: int = Query(default=10, ge=1, le=30),
):
    chunks = get_all_chunks(doc_id, limit=20)
    if not chunks:
        raise HTTPException(status_code=404, detail="Document not found.")

    context = "\n\n".join(f"[Page {c['page']}] {c['text']}" for c in chunks)
    prompt = FLASHCARD_PROMPT.format(n=count, context=context)

    raw = await call_ollama(prompt, temperature=0.1)

    try:
        data = _extract_json_array(raw)
        if not isinstance(data, list) or len(data) == 0:
            raise ValueError("Model returned empty or non-list JSON")
        cards = [FlashCard(**item) for item in data[:count]]
    except (json.JSONDecodeError, ValueError, TypeError, KeyError) as e:
        raise HTTPException(
            status_code=422,
            detail=f"Could not parse flashcards: {e}. Please retry.",
        )

    return FlashcardsResponse(cards=cards)
