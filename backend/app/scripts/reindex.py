"""
Robust reindex script for your AI Assistant RAG backend.

- Reads all .txt, .pdf, .docx files from data_dir (recursively)
- Extracts text, splits into chunks
- Creates embeddings using:
   1. Groq embeddings API (if GROQ_API_KEY present)
   2. sentence-transformers local model (if installed)
   3. Deterministic local fallback (if neither available)
- Writes:
   - chunks.jsonl (metadata)
   - faiss.index (if faiss installed)
   - faiss.index.embeddings.npy (fallback embeddings)
"""

import argparse
import json
import os
from pathlib import Path
from typing import List
import numpy as np
from tqdm import tqdm

# Optional libs
try:
    import faiss
except Exception:
    faiss = None

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None

try:
    from docx import Document as DocxDocument
except Exception:
    DocxDocument = None

try:
    import pdfplumber
except Exception:
    pdfplumber = None


# ---------- Helpers ----------

def read_txt(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def read_docx(path: Path) -> str:
    if not DocxDocument:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx")
    doc = DocxDocument(path)
    return "\n".join(p.text for p in doc.paragraphs if p.text)


def read_pdf(path: Path) -> str:
    if not pdfplumber:
        raise RuntimeError("pdfplumber not installed. Run: pip install pdfplumber")
    text_parts = []
    with pdfplumber.open(path) as pdf:
        for p in pdf.pages:
            try:
                t = p.extract_text()
                if t:
                    text_parts.append(t)
            except Exception:
                continue
    return "\n".join(text_parts)


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> List[str]:
    """Split long text into overlapping chunks."""
    text = text.replace("\r", "\n")
    chunks = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        chunk = text[start:end].strip()
        if len(chunk) >= 40:  # accept relatively small chunks
            chunks.append(chunk)
        start = end - overlap if end < n else end
    return chunks


# ---------- Main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data_dir", required=True)
    ap.add_argument("--out_index", required=True)
    ap.add_argument("--out_meta", required=True)
    ap.add_argument("--chunk_size", type=int, default=800)
    ap.add_argument("--overlap", type=int, default=150)
    ap.add_argument("--local_model", default="all-MiniLM-L6-v2")
    ap.add_argument("--groq_key", default=os.getenv("GROQ_API_KEY"))
    ap.add_argument("--groq_model", default=os.getenv("GROQ_EMBED_MODEL", "text-embedding-3-small"))
    ap.add_argument("--groq_url", default=os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1"))
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        raise RuntimeError(f"Data dir not found: {data_dir}")

    allowed_ext = {".txt", ".pdf", ".docx"}
    files = [p for p in data_dir.rglob("*") if p.is_file() and p.suffix.lower() in allowed_ext]
    print(f"Found {len(files)} input files under {data_dir}")

    meta, texts = [], []

    for f in files:
        try:
            if f.suffix.lower() == ".txt":
                raw = read_txt(f)
            elif f.suffix.lower() == ".pdf":
                raw = read_pdf(f)
            elif f.suffix.lower() == ".docx":
                raw = read_docx(f)
            else:
                continue
        except Exception as e:
            print(f"❌ Failed to read {f.name}: {e}")
            continue

        if not raw or len(raw.strip()) < 20:
            print(f"⚠️ Skipping {f.name} (empty or too short)")
            continue

        chunks = chunk_text(raw, args.chunk_size, args.overlap)
        for i, ch in enumerate(chunks):
            meta.append({"doc_id": f.name, "chunk_id": f"{f.name}::chunk_{i}", "text": ch})
            texts.append(ch)

    print(f"✅ Total usable chunks: {len(texts)}")

    if len(texts) == 0:
        raise RuntimeError("No usable chunks found — check your text files or reduce filters.")

    # Write metadata
    out_meta = Path(args.out_meta)
    out_meta.parent.mkdir(parents=True, exist_ok=True)
    with out_meta.open("w", encoding="utf-8") as f:
        for m in meta:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")
    print(f"📁 Saved metadata to {out_meta}")

    # Generate embeddings
    embeddings = None

    if args.groq_key:
        try:
            import requests
            print("🔹 Using Groq embeddings API...")
            url = f"{args.groq_url.rstrip('/')}/embeddings"
            headers = {"Authorization": f"Bearer {args.groq_key}", "Content-Type": "application/json"}
            payload = {"model": args.groq_model, "input": texts}
            r = requests.post(url, json=payload, headers=headers, timeout=30)
            r.raise_for_status()
            data = r.json()
            emb = [d["embedding"] for d in data.get("data", [])]
            embeddings = np.array(emb, dtype="float32")
        except Exception as e:
            print("⚠️ Groq API failed:", e)

    if embeddings is None and SentenceTransformer:
        try:
            print(f"🔹 Using local model: {args.local_model}")
            model = SentenceTransformer(args.local_model)
            embeddings = model.encode(texts, show_progress_bar=True, convert_to_numpy=True)
        except Exception as e:
            print("⚠️ Local model failed:", e)

    if embeddings is None:
        print("⚠️ Falling back to fake deterministic embeddings.")
        def fake_vec(t):
            rng = np.random.RandomState(abs(hash(t)) % (2**32))
            v = rng.rand(384).astype("float32")
            v /= (np.linalg.norm(v) + 1e-9)
            return v
        embeddings = np.vstack([fake_vec(t) for t in texts])

    np.save(Path(args.out_index).with_suffix(".embeddings.npy"), embeddings)
    print("💾 Saved embeddings fallback (.npy)")

    # Build FAISS index
    if faiss is not None:
        d = embeddings.shape[1]
        faiss.normalize_L2(embeddings)
        index = faiss.IndexFlatIP(d)
        index.add(embeddings)
        faiss.write_index(index, str(args.out_index))
        print(f"✅ FAISS index saved to {args.out_index} with {index.ntotal} vectors")
    else:
        print("⚠️ FAISS not installed, skipped index creation.")

    print("🎯 Reindex complete.")


if __name__ == "__main__":
    main()
