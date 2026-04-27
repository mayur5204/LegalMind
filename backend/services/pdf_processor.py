import fitz  # PyMuPDF
from langchain_text_splitters import RecursiveCharacterTextSplitter


def extract_and_chunk(pdf_path: str, doc_id: str) -> tuple[list[dict], int]:
    doc = fitz.open(pdf_path)
    page_count = len(doc)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks = []
    empty_pages = 0

    for page_num, page in enumerate(doc):
        text = page.get_text("text")
        if not text.strip():
            empty_pages += 1
            continue
        for chunk in splitter.split_text(text):
            chunks.append(
                {
                    "text": chunk,
                    "metadata": {"doc_id": doc_id, "page": page_num + 1},
                }
            )

    doc.close()

    if empty_pages == page_count:
        raise ValueError(
            "This PDF appears to be scanned (image-only). Text extraction returned no content."
        )

    return chunks, page_count
