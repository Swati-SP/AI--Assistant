# app/services/embeddings.py
import os
import openai

openai.api_key = os.getenv("OPENAI_API_KEY")
EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")

def embed_texts(texts):
    """
    texts: list[str]
    returns list[list[float]] embeddings
    """
    if not texts:
        return []
    # OpenAI embeddings call (batched)
    resp = openai.Embedding.create(model=EMBED_MODEL, input=texts)
    embeddings = [r["embedding"] for r in resp["data"]]
    return embeddings
