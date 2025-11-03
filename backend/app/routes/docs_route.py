# app/routes/docs_route.py
import os
from fastapi import APIRouter, File, UploadFile, BackgroundTasks, HTTPException
from typing import List
from pathlib import Path

# Updated import list — consistent with new faiss_store
from app.db.faiss_store import build_faiss_index, load_chunks, save_chunks
from app.services.text_splitter import chunk_text

router = APIRouter()

# Directory where uploaded files will be stored
UPLOAD_DIR = Path(os.getenv("UPLOADED_DIR", "./uploaded_docs"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/docs/upload")
async def upload_docs(
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = None
):
    """
    Upload one or more documents, save them, and asynchronously
    index their content for retrieval (FAISS + local embeddings).
    """
    saved = []

    for f in files:
        dest = UPLOAD_DIR / f.filename
        body = await f.read()
        dest.write_bytes(body)
        saved.append({"filename": f.filename, "size": len(body)})

        # Decode file to text
        try:
            text = body.decode("utf-8", errors="ignore")
        except Exception:
            raise HTTPException(status_code=400, detail=f"Unable to decode {f.filename}")

        # Background FAISS indexing task
        if background_tasks:
            background_tasks.add_task(index_document_from_text, f.filename, text)
        else:
            index_document_from_text(f.filename, text)

    return {"uploaded": saved}


def index_document_from_text(filename: str, text: str):
    """
    Break document into chunks, save them, and update FAISS index.
    """
    print(f"📄 Indexing document: {filename}")

    # 1️⃣ Load existing chunks
    existing = load_chunks()

    # 2️⃣ Split new file into chunks
    new_chunks = chunk_text(text, chunk_size=500, overlap=50)
    new_records = [
        {
            "doc_id": filename,
            "chunk_id": f"{filename}_chunk_{i}",
            "text": chunk,
        }
        for i, chunk in enumerate(new_chunks)
    ]

    # 3️⃣ Merge and save
    all_chunks = existing + new_records
    save_chunks(all_chunks)

    # 4️⃣ Rebuild FAISS index (safe call with internal embedding)
    try:
        index, emb = build_faiss_index(all_chunks)
        print(f"✅ Indexed {len(new_records)} new chunks from {filename}. Total in FAISS: {len(all_chunks)}")
    except Exception as e:
        print(f"⚠️  Failed to rebuild FAISS index for {filename}: {e}")


@router.post("/docs/summarize")
async def summarize_docs(filenames: List[str]):
    """
    (Optional) Generate summaries for uploaded text files using simple extractive summarization.
    This step is independent of RAG indexing.
    """
    summaries = []
    for fn in filenames:
        file_path = UPLOAD_DIR / fn
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"{fn} not found")

        try:
            text = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            text = file_path.read_bytes().decode("utf-8", errors="ignore")

        # Simple first-N-sentences summarization
        sentences = [s.strip() for s in text.split(".") if len(s.strip()) > 10]
        summary = ". ".join(sentences[:4])
        summaries.append({"filename": fn, "summary": summary})

    return {"summaries": summaries}
