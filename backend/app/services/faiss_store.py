# backend/app/services/faiss_store.py
import os
import json
from typing import List, Dict, Union, Optional

import numpy as np
import faiss

try:
    import requests
except Exception:
    requests = None  # requests only needed if GROQ API is used

# -------------------------
# Paths & config
# -------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "sample_dataset")
CHUNKS_PATH = os.path.join(DATA_DIR, "chunks.jsonl")
EMB_PATH = os.path.join(DATA_DIR, "embeddings.npy")
FAISS_INDEX_PATH = os.path.join(DATA_DIR, "faiss.index")

EMBED_DIM = int(os.getenv("FAISS_DIM", "512"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_EMBED_MODEL = os.getenv("GROQ_EMBED_MODEL", "groq-embedding-1")

# -------------------------
# Embedding helpers
# -------------------------
def _deterministic_embedding(text: str, dim: int = EMBED_DIM) -> np.ndarray:
    rng = np.random.RandomState(abs(hash(text)) % (2**32))
    vec = rng.rand(dim).astype("float32")
    norm = np.linalg.norm(vec) + 1e-9
    return (vec / norm).astype("float32")

def embed_with_groq(texts: List[str]) -> np.ndarray:
    """
    Try Groq embeddings API if API key present and requests available.
    Otherwise fall back to deterministic local embeddings.
    Returns np.ndarray shape (len(texts), EMBED_DIM).
    """
    if not GROQ_API_KEY or requests is None:
        # fallback
        return np.vstack([_deterministic_embedding(t, EMBED_DIM) for t in texts]).astype("float32")

    # Groq OpenAI-compatible embeddings endpoint
    url = "https://api.groq.com/openai/v1/embeddings"
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": GROQ_EMBED_MODEL, "input": texts}

    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    # Expecting structure like OpenAI: data[i].embedding
    embs = [item.get("embedding") for item in data.get("data", [])]
    return np.array(embs, dtype="float32")

def embed_local(texts: List[str]) -> np.ndarray:
    """Deterministic local embedding (always available)."""
    return np.vstack([_deterministic_embedding(t, EMBED_DIM) for t in texts]).astype("float32")

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
def build_faiss_index(chunks: List[Dict], dim: int = EMBED_DIM, use_groq: bool = True) -> int:
    """
    Build embeddings and FAISS index from provided chunks list.
    chunks: List[{"chunk_id","doc_id","text",...}]
    use_groq: try Groq if available (falls back to local)
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    texts = [c["text"] for c in chunks]
    # try groq if requested
    embs = None
    if use_groq:
        try:
            embs = embed_with_groq(texts)
        except Exception:
            embs = embed_local(texts)
    else:
        embs = embed_local(texts)

    np.save(EMB_PATH, embs)

    # normalize and build index for inner-product (cosine) similarity
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

# -------------------------
# Search helpers
# -------------------------
def _search_by_embedding(index, chunks, q_emb: np.ndarray, top_k: int = 3):
    q_emb = q_emb.astype("float32")
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

def search_by_text(query: str, top_k: int = 3, use_groq: bool = True):
    """
    Convenience function: embed `query` (Groq if available else local) and return top_k.
    """
    idx, chunks, _ = load_faiss_index()
    try:
        q_emb = embed_with_groq([query]) if use_groq else embed_local([query])
    except Exception:
        q_emb = embed_local([query])
    return _search_by_embedding(idx, chunks, q_emb, top_k=top_k)

# -------------------------
# FaissStore wrapper & factory
# -------------------------
class FaissStore:
    """
    Wrapper exposing `.query()` that accepts either:
      - a raw query string (it will embed then search),
      - or a numpy embedding vector (1D or 2D).
    """
    def __init__(self, prefer_groq: bool = True):
        self._index_loaded = False
        self._index = None
        self._chunks = None
        self._embs = None
        self.prefer_groq = prefer_groq

    def _ensure(self):
        if not self._index_loaded:
            self._index, self._chunks, self._embs = load_faiss_index()
            self._index_loaded = True

    def query(self, q: Union[str, np.ndarray], top_k: int = 3):
        self._ensure()
        if isinstance(q, str):
            try:
                q_emb = embed_with_groq([q]) if self.prefer_groq else embed_local([q])
            except Exception:
                q_emb = embed_local([q])
            return _search_by_embedding(self._index, self._chunks, q_emb, top_k=top_k)

        arr = np.asarray(q)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        return _search_by_embedding(self._index, self._chunks, arr.astype("float32"), top_k=top_k)

# singleton factory
_store_instance: Optional[FaissStore] = None

def get_store(prefer_groq: bool = True) -> FaissStore:
    global _store_instance
    if _store_instance is None:
        _store_instance = FaissStore(prefer_groq=prefer_groq)
    return _store_instance

# convenience exports
__all__ = [
    "build_faiss_index",
    "load_faiss_index",
    "search_by_text",
    "get_store",
    "embed_with_groq",
    "embed_local",
    "save_chunks",
    "load_chunks",
]
