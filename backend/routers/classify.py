import json
import re
from fastapi import APIRouter, HTTPException
from backend.services.vector_store import get_all_chunks
from backend.services.ollama_client import call_ollama

router = APIRouter()

CLASSIFY_PROMPT = """You are a legal document analyst. Based on the document excerpts below, identify the document type and key metadata.

Output ONLY a JSON object with exactly these four keys — no markdown fences, no commentary:
{{
  "category": "...",
  "parties": "...",
  "date": "...",
  "suggested_name": "..."
}}

Rules:
- category: pick the most specific match from this list:
  Non-Disclosure Agreement, Employment Contract, Lease Agreement, Service Agreement,
  Purchase Agreement, Loan Agreement, Partnership Agreement, Settlement Agreement,
  Consulting Agreement, Licensing Agreement, Terms of Service, Privacy Policy,
  Power of Attorney, Will and Testament, Shareholders Agreement, Franchise Agreement,
  Distribution Agreement, Independent Contractor Agreement, Other
- parties: up to 2 main party names separated by " & " (e.g. "Acme Corp & John Smith"), or "Unknown"
- date: the year of the agreement (e.g. "2024"), or "Unknown"
- suggested_name: a clean snake_case filename, max 40 chars, no extension, no spaces.
  Format: PartyA_PartyB_ShortCategory_Year (e.g. "Acme_Corp_NDA_2024")

Content:
{context}

JSON:"""

CAT_SHORT = {
    'Non-Disclosure Agreement': 'NDA',
    'Employment Contract': 'Employment_Contract',
    'Lease Agreement': 'Lease_Agreement',
    'Service Agreement': 'Service_Agreement',
    'Purchase Agreement': 'Purchase_Agreement',
    'Loan Agreement': 'Loan_Agreement',
    'Partnership Agreement': 'Partnership_Agreement',
    'Settlement Agreement': 'Settlement_Agreement',
    'Consulting Agreement': 'Consulting_Agreement',
    'Licensing Agreement': 'License_Agreement',
    'Terms of Service': 'Terms_of_Service',
    'Privacy Policy': 'Privacy_Policy',
    'Power of Attorney': 'Power_of_Attorney',
    'Will and Testament': 'Will_Testament',
    'Shareholders Agreement': 'Shareholders_Agreement',
    'Independent Contractor Agreement': 'Contractor_Agreement',
}


def _extract_json_object(raw: str) -> dict:
    clean = re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()
    start = clean.find("{")
    end = clean.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found")
    return json.loads(clean[start: end + 1])


def _build_fallback_name(category: str, date: str) -> str:
    short = CAT_SHORT.get(category, 'Agreement')
    date_str = date if date and date != 'Unknown' else ''
    name = f"{short}{'_' + date_str if date_str else ''}"
    return name[:40] + ".pdf"


@router.post("/classify/{doc_id}")
async def classify_document(doc_id: str):
    chunks = get_all_chunks(doc_id, limit=10)
    if not chunks:
        raise HTTPException(status_code=404, detail="Document not found.")

    context = "\n\n".join(f"[Page {c['page']}] {c['text']}" for c in chunks)
    prompt = CLASSIFY_PROMPT.format(context=context)

    raw = await call_ollama(prompt, temperature=0.1)

    try:
        result = _extract_json_object(raw)
        category = str(result.get("category", "Other")).strip() or "Other"
        parties = str(result.get("parties", "Unknown")).strip() or "Unknown"
        date = str(result.get("date", "Unknown")).strip() or "Unknown"

        raw_name = str(result.get("suggested_name", "")).strip()
        suggested_name = re.sub(r"[^\w\-]", "_", raw_name)
        suggested_name = re.sub(r"_+", "_", suggested_name).strip("_")[:40]

        if suggested_name:
            suggested_name += ".pdf"
        else:
            suggested_name = _build_fallback_name(category, date)

    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse classification: {e}")

    return {
        "category": category,
        "parties": parties,
        "date": date,
        "suggested_name": suggested_name,
    }
