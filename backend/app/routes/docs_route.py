# app/routes/docs_route.py
import os
import re
from typing import List
from fastapi import APIRouter, File, UploadFile, HTTPException, status

router = APIRouter()

# Directory where uploaded files are stored
UPLOAD_DIR = os.path.join(os.getcwd(), "uploaded_docs")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/docs/upload")
async def upload_docs(files: List[UploadFile] = File(...)):
    """
    Save uploaded documents to disk and return filenames.
    """
    saved = []
    for f in files:
        path = os.path.join(UPLOAD_DIR, f.filename)
        content = await f.read()
        with open(path, "wb") as fh:
            fh.write(content)
        saved.append({"filename": f.filename, "size": len(content)})
    return {"uploaded": saved}


def summarize_text(text: str, max_sentences: int = 4) -> str:
    """
    Simple extractive summarizer (takes first N sentences).
    """
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    sentences = [s for s in sentences if len(s.strip()) > 10]
    return " ".join(sentences[:max_sentences]) or text[:200]


@router.post("/docs/summarize")
async def summarize_docs(filenames: List[str]):
    """
    Generate summaries for given filenames from uploaded_docs.
    """
    summaries = []
    for fn in filenames:
        path = os.path.join(UPLOAD_DIR, fn)
        if not os.path.exists(path):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{fn} not found")

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception:
            with open(path, "rb") as f:
                content = f.read().decode("utf-8", errors="ignore")

        summary = summarize_text(content, max_sentences=4)
        summaries.append({"filename": fn, "summary": summary})

    return {"summaries": summaries}
