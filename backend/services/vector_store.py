from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma
import pathlib

EMBED_MODEL = "nomic-embed-text"
CHROMA_DIR = str(pathlib.Path(__file__).parent.parent / "chroma_db").replace("\\", "/")

embeddings = OllamaEmbeddings(model=EMBED_MODEL)


def _get_vectorstore(doc_id: str) -> Chroma:
    return Chroma(
        collection_name=doc_id,
        embedding_function=embeddings,
        persist_directory=CHROMA_DIR,
    )


def add_chunks(doc_id: str, chunks: list[dict]) -> None:
    texts = [c["text"] for c in chunks]
    metadatas = [c["metadata"] for c in chunks]
    vectorstore = _get_vectorstore(doc_id)
    vectorstore.add_texts(texts=texts, metadatas=metadatas)


def get_top_chunks(doc_id: str, query: str, k: int = 5) -> list[dict]:
    vectorstore = _get_vectorstore(doc_id)
    retriever = vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={"k": k, "fetch_k": k * 2},
    )
    docs = retriever.invoke(query)
    return [
        {"text": d.page_content, "page": d.metadata.get("page", 0), "doc_id": doc_id} for d in docs
    ]


def get_top_chunks_multi(doc_ids: list[str], filenames: dict[str, str], query: str, k: int = 6) -> list[dict]:
    """Query multiple collections and return the top-k chunks ranked by relevance."""
    all_results: list[dict] = []
    per_doc_k = max(k, 4)

    for doc_id in doc_ids:
        try:
            vs = _get_vectorstore(doc_id)
            scored = vs.similarity_search_with_relevance_scores(query, k=per_doc_k)
            for doc, score in scored:
                all_results.append({
                    "text": doc.page_content,
                    "page": doc.metadata.get("page", 0),
                    "doc_id": doc_id,
                    "filename": filenames.get(doc_id, doc_id),
                    "score": score,
                })
        except Exception:
            continue

    all_results.sort(key=lambda x: x["score"], reverse=True)
    return all_results[:k]


def get_all_chunks(doc_id: str, limit: int = 20) -> list[dict]:
    vectorstore = _get_vectorstore(doc_id)
    collection = vectorstore._collection
    result = collection.get(limit=limit, include=["documents", "metadatas"])
    chunks = []
    for text, meta in zip(result["documents"], result["metadatas"]):
        chunks.append({"text": text, "page": meta.get("page", 0)})
    return chunks
