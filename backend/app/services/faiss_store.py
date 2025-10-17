# backend/app/db/faiss_store.py
import os
import json
import numpy as np
import faiss
import requests
from typing import List, Dict

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "sample_dataset")
CHUNKS_PATH = os.path.join(DATA_DIR, "chunks.jsonl")
EMB_PATH = os.path.join(DATA_DIR, "embeddings.npy")
FAISS_INDEX_PATH = os.path.join(DATA_DIR, "faiss.index")

# environment-driven configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_EMBED_MODEL = os.getenv("GROQ_EMBED_MODEL", "groq-embedding-1")  # example name
EMBED_DIM = int(os.getenv("FAISS_DIM", "512"))

# -------------------------
# embedding helper (Groq request)
# -------------------------
def embed_with_groq(texts: List[str]) -> np.ndarray:
    """
    Call Groq embeddings endpoint (via HTTP). Expects API key in env.
    Returns numpy array shape (n_texts, dim).
    Fallback: deterministic embedding stub if API key not set.
    """
    if not GROQ_API_KEY:
        # deterministic stub (use hashed rng)
        return np.vstack([_deterministic_embedding(t, EMBED_DIM) for t in texts]).astype("float32")

    url = "https://api.groq.com/v1/embeddings"  # placeholder; confirm with Groq docs
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": GROQ_EMBED_MODEL, "input": texts}
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    # adapt to response format; assume `data["data"][i]["embedding"]`
    embs = [item["embedding"] for item in data.get("data", [])]
    return np.array(embs, dtype="float32")

def _deterministic_embedding(text: str, dim: int):
    rng = np.random.RandomState(abs(hash(text)) % (2**32))
    vec = rng.rand(dim).astype("float32")
    norm = np.linalg.norm(vec) + 1e-9
    return (vec / norm).astype("float32")

# -------------------------
# Chunk loader / saver
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
def build_faiss_index(chunks: List[Dict], dim: int = EMBED_DIM, rebuild: bool = True) -> int:
    """Compute embeddings for chunks and write embeddings.npy and faiss.index."""
    os.makedirs(DATA_DIR, exist_ok=True)
    texts = [c["text"] for c in chunks]
    embs = embed_with_groq(texts)  # shape (n, dim)
    np.save(EMB_PATH, embs)
    # normalize for inner product similarity
    faiss.normalize_L2(embs)
    index = faiss.IndexFlatIP(dim)
    index.add(embs)
    faiss.write_index(index, FAISS_INDEX_PATH)
    return index.ntotal

def load_faiss_index():
    if not os.path.exists(FAISS_INDEX_PATH):
        raise RuntimeError("FAISS index missing. Run build_faiss_index() first.")
    index = faiss.read_index(FAISS_INDEX_PATH)
    chunks = load_chunks()
    embs = None
    if os.path.exists(EMB_PATH):
        embs = np.load(EMB_PATH)
    return index, chunks, embs

def search(query: str, top_k: int = 3, dim: int = EMBED_DIM):
    """Embed query and search FAISS for top_k results. Returns list of {chunk, score}."""
    idx, chunks, _ = load_faiss_index()
    q_emb = embed_with_groq([query]).astype("float32")
    faiss.normalize_L2(q_emb)
    D, I = idx.search(q_emb, top_k)
    results = []
    for score, i in zip(D[0], I[0]):
        if i < 0: continue
        c = chunks[i]
        results.append({"chunk_id": c.get("chunk_id"), "doc_id": c.get("doc_id"),
                        "text": c.get("text"), "score": float(score)})
    return results
