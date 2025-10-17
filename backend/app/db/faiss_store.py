# backend/app/db/faiss_store.py
import os
import json
import numpy as np
import faiss
from typing import List, Dict

# -------------------------
# Path setup
# -------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "sample_dataset")
CHUNKS_PATH = os.path.join(DATA_DIR, "chunks.jsonl")
EMB_PATH = os.path.join(DATA_DIR, "embeddings.npy")
FAISS_INDEX_PATH = os.path.join(DATA_DIR, "faiss.index")

# -------------------------
# Config
# -------------------------
EMBED_DIM = int(os.getenv("FAISS_DIM", "512"))

# -------------------------
# Fake embedding generator (deterministic)
# -------------------------
def _fake_embedding(text: str, dim: int = EMBED_DIM) -> np.ndarray:
    """
    Generate deterministic pseudo-embeddings for a given text.
    Used as fallback when real embedding API is unavailable.
    """
    rng = np.random.RandomState(abs(hash(text)) % (2**32))
    vec = rng.rand(dim).astype("float32")
    vec /= np.linalg.norm(vec) + 1e-9
    return vec

def embed_with_local(texts: List[str]) -> np.ndarray:
    """
    Generate local fake embeddings for multiple texts.
    """
    print("⚠️  Using local fake embeddings (Groq embeddings API not available).")
    return np.vstack([_fake_embedding(t, EMBED_DIM) for t in texts]).astype("float32")

# -------------------------
# Chunk loader/saver
# -------------------------
def load_chunks() -> List[Dict]:
    if not os.path.exists(CHUNKS_PATH):
        return []
    chunks = []
    with open(CHUNKS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                chunks.append(json.loads(line))
    return chunks

def save_chunks(chunks: List[Dict]):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CHUNKS_PATH, "w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

# -------------------------
# Build / load index
# -------------------------
def build_faiss_index(chunks: List[Dict], dim: int = EMBED_DIM) -> int:
    """Compute embeddings for chunks and build FAISS index."""
    os.makedirs(DATA_DIR, exist_ok=True)
    texts = [c["text"] for c in chunks]
    embs = embed_with_local(texts)  # using local embeddings
    np.save(EMB_PATH, embs)

    # Normalize for cosine similarity (inner product)
    faiss.normalize_L2(embs)
    index = faiss.IndexFlatIP(dim)
    index.add(embs)
    faiss.write_index(index, FAISS_INDEX_PATH)
    print(f"✅ FAISS index built with {index.ntotal} vectors.")
    return index.ntotal

def load_faiss_index():
    if not os.path.exists(FAISS_INDEX_PATH):
        raise RuntimeError("FAISS index missing. Run build_faiss_index() first.")
    index = faiss.read_index(FAISS_INDEX_PATH)
    chunks = load_chunks()
    return index, chunks

# -------------------------
# Search function
# -------------------------
def search(query: str, top_k: int = 3):
    """Embed query locally and search FAISS for top_k results."""
    index, chunks = load_faiss_index()
    q_emb = embed_with_local([query]).astype("float32")
    faiss.normalize_L2(q_emb)
    D, I = index.search(q_emb, top_k)

    results = []
    for score, i in zip(D[0], I[0]):
        if i < 0 or i >= len(chunks):
            continue
        c = chunks[i]
        results.append({
            "chunk_id": c.get("chunk_id"),
            "doc_id": c.get("doc_id"),
            "text": c.get("text"),
            "score": float(score)
        })
    return results
