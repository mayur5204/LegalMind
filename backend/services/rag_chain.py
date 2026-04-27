from langchain_ollama import OllamaEmbeddings, OllamaLLM as Ollama
from langchain_chroma import Chroma
from langchain.chains import RetrievalQA
import pathlib

EMBED_MODEL = "nomic-embed-text"
CHAT_MODEL = "gemma4:31b-cloud"
CHROMA_DIR = str(pathlib.Path(__file__).parent.parent / "chroma_db").replace("\\", "/")

embeddings = OllamaEmbeddings(model=EMBED_MODEL)
llm = Ollama(model=CHAT_MODEL, temperature=0.1)


def build_rag_chain(collection_name: str) -> RetrievalQA:
    vectorstore = Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=CHROMA_DIR,
    )
    retriever = vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={"k": 5, "fetch_k": 10},
    )
    return RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=retriever,
        return_source_documents=True,
    )
