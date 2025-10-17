# backend/app/scripts/build_faiss_index.py
import os, json, uuid
from pathlib import Path
from app.db.faiss_store import build_faiss_index, save_chunks


DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "sample_dataset"
DOCS_DIR = DATA_DIR / "documents"

def simple_text_split(text: str, chunk_size: int = 1000, overlap: int = 200):
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i:i+chunk_size]
        chunks.append(" ".join(chunk_words))
        i += chunk_size - overlap
    return chunks

def load_documents_and_chunk():
    docs = []
    for p in DOCS_DIR.glob("*"):
        if p.suffix.lower() in (".txt",):
            text = p.read_text(encoding="utf-8")
        elif p.suffix.lower() in (".pdf",):
            # simple PDF read fallback: try PyPDF2
            try:
                import PyPDF2
                with p.open("rb") as fh:
                    pdf = PyPDF2.PdfReader(fh)
                    text = "\n".join([page.extract_text() or "" for page in pdf.pages])
            except Exception as e:
                print("PDF read error:", e)
                text = ""
        else:
            continue
        docs.append({"path": str(p), "text": text, "filename": p.name})
    # chunk
    chunks = []
    for doc in docs:
        c_texts = simple_text_split(doc["text"], chunk_size=400, overlap=50)
        for idx, txt in enumerate(c_texts):
            chunks.append({
                "chunk_id": str(uuid.uuid4()),
                "doc_id": doc["filename"],
                "text": txt
            })
    return chunks

if __name__ == "__main__":
    print("Building chunks from documents...")
    chunks = load_documents_and_chunk()
    print(f"Created {len(chunks)} chunks.")
    save_chunks(chunks)
    print("Saved chunks.jsonl")
    ntotal = build_faiss_index(chunks)
    print(f"Built FAISS index with {ntotal} vectors.")
