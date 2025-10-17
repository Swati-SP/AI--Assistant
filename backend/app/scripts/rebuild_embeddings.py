# rebuild_embeddings.py
import os, json, numpy as np, requests, time
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "sample_dataset")
CHUNKS = os.path.join(DATA_DIR, "chunks.jsonl")
OUT_EMB = os.path.join(DATA_DIR, "embeddings.npy")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MODEL = os.getenv("GROQ_EMBED_MODEL", "text-embedding-3-small")
URL = "https://api.groq.com/openai/v1/embeddings"

if not GROQ_API_KEY:
    raise SystemExit("Set GROQ_API_KEY in env before running")

texts=[]
with open(CHUNKS,'r',encoding='utf-8') as f:
    for line in f:
        if not line.strip(): continue
        texts.append(json.loads(line).get("text",""))

# Optional: chunk the requests to avoid too-large payloads
batch_size = 32
embs=[]
headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
for i in range(0, len(texts), batch_size):
    batch = texts[i:i+batch_size]
    payload={"model": MODEL, "input": batch}
    r = requests.post(URL, headers=headers, json=payload, timeout=60)
    if r.status_code != 200:
        print("ERROR", r.status_code, r.text)
        raise SystemExit("Embedding failed")
    data=r.json()
    for item in data.get("data", []):
        embs.append(item["embedding"])
    time.sleep(0.2)  # polite pause

arr = np.array(embs, dtype="float32")
np.save(OUT_EMB, arr)
print("Saved embeddings:", OUT_EMB, "shape:", arr.shape)
