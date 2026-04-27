from pydantic import BaseModel
from typing import Any


class IngestResponse(BaseModel):
    doc_id: str
    filename: str
    page_count: int
    chunk_count: int
    status: str


class DocRef(BaseModel):
    doc_id: str
    filename: str


class ChatRequest(BaseModel):
    docs: list[DocRef]
    question: str
    history: list[Any] = []


class Citation(BaseModel):
    page: int
    text: str


class FlashCard(BaseModel):
    front: str
    back: str
    topic: str


class FlashcardsResponse(BaseModel):
    cards: list[FlashCard]
