"""
faiss_store.py
--------------
Loads chunks metadata and FAISS index or fallback embeddings for semantic search.
Provides helpers to build the index and to search it.
"""

import json
from pathlib import Path
import numpy as np
import traceback

# try to import faiss (may not be available on some Windows setups)
try:
    import faiss
except Exception:
    faiss = None

APP_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = APP_DIR / "data"
CHUNKS_PATH = DATA_DIR / "chunks.jsonl"
INDEX_PATH = DATA_DIR / "faiss.index"
EMB_PATH = DATA_DIR / "faiss.index.embeddings.npy"


def load_chunks():
    """
    Returns list of chunk dicts loaded from chunks.jsonl (one JSON object per line).
    """
    if not CHUNKS_PATH.exists():
        return []
    lines = []
    with open(CHUNKS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            try:
                lines.append(json.loads(line))
            except Exception:
                # skip bad lines but continue
                continue
    return lines


def save_chunks(chunks):
    """
    Save chunks (list of dicts) to CHUNKS_PATH as JSON lines.
    Overwrites existing file.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(CHUNKS_PATH, "w", encoding="utf-8") as f:
        for c in chunks:
            json.dump(c, f, ensure_ascii=False)
            f.write("\n")


def load_faiss_index():
    """
    Load a saved FAISS index from INDEX_PATH, if available and faiss is installed.
    Returns index or None.
    """
    if faiss is None or not INDEX_PATH.exists():
        return None
    try:
        return faiss.read_index(str(INDEX_PATH))
    except Exception:
        traceback.print_exc()
        return None


def load_embeddings_fallback():
    """
    Load saved numpy embeddings fallback (if FAISS is not available).
    Returns numpy array or None.
    """
    if EMB_PATH.exists():
        try:
            return np.load(str(EMB_PATH))
        except Exception:
            traceback.print_exc()
    return None


def normalize(vectors: np.ndarray):
    """
    Normalize vectors row-wise to unit length (L2).
    """
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return vectors / norms


def embed_local_texts(texts, model_name="all-MiniLM-L6-v2"):
    """
    Helper to embed text using sentence-transformers locally.
    The model is loaded inside the function to avoid heavy import-time costs.
    Returns numpy array of shape (len(texts), dim)
    """
    try:
        from sentence_transformers import SentenceTransformer
    except Exception as e:
        raise RuntimeError(
            "sentence-transformers not available. Install it (`pip install sentence-transformers`) "
            "or use a different embedding method."
        ) from e

    model = SentenceTransformer(model_name)
    return model.encode(texts, convert_to_numpy=True, show_progress_bar=False)


def build_faiss_index(chunks=None, model_name="all-MiniLM-L6-v2", save_index=True):
    """
    Build a FAISS index (or embeddings file) from chunks.

    - chunks: list of chunk dicts (if None, load from CHUNKS_PATH)
      Each chunk dict should contain text to embed (commonly under 'text' key).
    - model_name: sentence-transformers model to use for embeddings
    - save_index: whether to write index and embeddings to disk

    Returns tuple (index_or_none, embeddings ndarray)
    """
    # load chunks if not provided
    if chunks is None:
        chunks = load_chunks()

    if not chunks:
        raise RuntimeError("No chunks to index. Add documents and run build_faiss_index again.")

    # Extract texts to embed. Adjust key if your chunk uses different field name.
    texts = []
    for c in chunks:
        # prefer 'text' key; fallback to any string representation
        if isinstance(c, dict) and "text" in c:
            texts.append(c["text"])
        else:
            texts.append(str(c))

    # compute embeddings
    emb = embed_local_texts(texts, model_name=model_name)
    emb = np.asarray(emb)
    if emb.ndim == 1:
        emb = emb.reshape(1, -1)

    # ensure directory exists
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Save embeddings fallback
    if save_index:
        try:
            np.save(str(EMB_PATH), emb)
        except Exception:
            traceback.print_exc()

    index = None
    if faiss is not None:
        try:
            # Use inner product on normalized vectors to approximate cosine similarity
            d = emb.shape[1]
            # IndexFlatIP supports inner product search
            index = faiss.IndexFlatIP(d)
            # normalize vectors before adding
            emb_normalized = emb.astype("float32")
            faiss.normalize_L2(emb_normalized)
            index.add(emb_normalized)
            if save_index:
                faiss.write_index(index, str(INDEX_PATH))
        except Exception:
            traceback.print_exc()
            index = None

    return index, emb


def search(query_emb: np.ndarray, top_k: int = 3):
    """
    Search top_k relevant chunks given a query embedding (numpy array).
    Returns list of {"score": float, "meta": chunk_dict}
    """
    chunks = load_chunks()
    if not chunks:
        return []

    # Try FAISS
    index = load_faiss_index()
    if index is not None:
        q = query_emb.astype("float32").reshape(1, -1)
        # normalize query vector for cosine-like similarity with IndexFlatIP
        try:
            faiss.normalize_L2(q)
        except Exception:
            pass
        D, I = index.search(q, top_k)
        results = []
        for s, i in zip(D[0], I[0]):
            if i < 0 or i >= len(chunks):
                continue
            results.append({"score": float(s), "meta": chunks[int(i)]})
        return results

    # Fallback with numpy embeddings
    embs = load_embeddings_fallback()
    if embs is None:
        raise RuntimeError("No FAISS index or embeddings found. Run build_faiss_index first.")
    embs_n = normalize(embs)
    q_n = normalize(query_emb.reshape(1, -1))
    scores = (embs_n @ q_n.T).squeeze()
    idxs = np.argsort(-scores)[:top_k]
    return [{"score": float(scores[i]), "meta": chunks[int(i)]} for i in idxs]


def search_faiss(query_text: str, top_k: int = 3, model_name="all-MiniLM-L6-v2"):
    """
    High-level helper: embed the query_text, then call `search`.
    Returns list of {"score": float, "meta": chunk_dict}
    """
    # Create embedding for query
    try:
        q_emb = embed_local_texts([query_text], model_name=model_name)
    except Exception as e:
        # If embedding model not available, propagate a clear error
        raise RuntimeError("Failed to embed query: " + str(e)) from e

    return search(q_emb[0], top_k=top_k)


# --- Backwards-compatible stubs (defensive) ---
# If other modules import build_faiss_index/load_chunks/save_chunks/search_faiss,
# ensure they exist. They are defined above, but keep this area to be explicit.
if "build_faiss_index" not in globals():
    def build_faiss_index(*args, **kwargs):
        print("[faiss_store] build_faiss_index() stub called")
        return None, None

if "save_chunks" not in globals():
    def save_chunks(*args, **kwargs):
        print("[faiss_store] save_chunks() stub called")
        return None

if "search_faiss" not in globals():
    def search_faiss(*args, **kwargs):
        return []
