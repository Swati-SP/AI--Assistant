# backend/app/build_faiss_from_saved.py
import os, json, sys, numpy as np, faiss

BASE = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE, "data", "sample_dataset")
CHUNKS_PATH = os.path.join(DATA_DIR, "chunks.jsonl")
EMB_PATH = os.path.join(DATA_DIR, "embeddings.npy")
FAISS_OUT = os.path.join(DATA_DIR, "faiss.index")

def load_chunks(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"chunks file not found: {path}")
    chunks=[]
    with open(path,"r",encoding="utf-8") as f:
        for line in f:
            line=line.strip()
            if not line: continue
            chunks.append(json.loads(line))
    return chunks

def main():
    print("DATA_DIR:", DATA_DIR)
    if not os.path.exists(EMB_PATH):
        print("ERROR: embeddings.npy not found at", EMB_PATH); sys.exit(1)
    chunks = load_chunks(CHUNKS_PATH)
    embs = np.load(EMB_PATH)
    print("Loaded chunks:", len(chunks))
    print("Loaded embeddings shape:", embs.shape, "dtype:", embs.dtype)
    if embs.ndim != 2:
        print("ERROR: embeddings.npy must be 2D"); sys.exit(1)
    n, dim = embs.shape
    if len(chunks) != n:
        print("ERROR: number of chunks != number of embeddings. Aborting."); sys.exit(1)
    embs = embs.astype("float32")
    faiss.normalize_L2(embs)
    idx_flat = faiss.IndexFlatIP(dim)
    idx = faiss.IndexIDMap(idx_flat)
    ids = np.arange(n, dtype="int64")
    idx.add_with_ids(embs, ids)
    faiss.write_index(idx, FAISS_OUT)
    print(f"Saved FAISS index to {FAISS_OUT} (ntotal={idx.ntotal})")

if __name__=="__main__":
    main()
