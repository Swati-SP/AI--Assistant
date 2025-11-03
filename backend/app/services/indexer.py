# app/services/indexer.py
import os
from .embeddings import embed_texts
from .faiss_store import get_store

def chunk_text(text, chunk_size=800, overlap=100):
    text = text.replace("\r\n", "\n")
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start = max(start + chunk_size - overlap, start + chunk_size)
    return chunks

def index_document_from_text(filename, text):
    chunks = chunk_text(text)
    embeddings = embed_texts(chunks)
    metas = []
    for i, chunk in enumerate(chunks):
        metas.append({"doc": filename, "chunk_id": i, "text": chunk})
    store = get_store(dim=len(embeddings[0]) if embeddings else 1536)
    store.add(embeddings, metas)
    return len(chunks)
