# backend/app/routes/ask_route.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import os
import traceback
import requests
import re
import json

router = APIRouter()

# ---- Request / Response models ----
class AskRequest(BaseModel):
    query: str
    history: Optional[List[Dict[str, Any]]] = []
    top_k: Optional[int] = 3


class RetrievedChunk(BaseModel):
    score: float
    doc_id: str
    chunk_id: str
    text: str


class AskResponse(BaseModel):
    answer: Optional[str] = None
    retrieved: List[RetrievedChunk] = []
    debug: Optional[Dict[str, Any]] = None


# ---- Environment config ----
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL")
GROQ_API_BASE = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1").rstrip("/")


# ---- Helper functions ----
def _import_faiss_store():
    try:
        from app.db import faiss_store
        return faiss_store
    except Exception as e:
        raise RuntimeError(f"Failed to import faiss_store: {e}")


def embed_query_local(query: str):
    fs = _import_faiss_store()
    try:
        emb = fs.embed_local_texts([query])
        return emb[0]
    except Exception as e:
        raise RuntimeError(f"Local embedding failed: {e}")


def _extract_content_from_choice(choice: Any) -> str:
    try:
        if isinstance(choice, dict):
            # chat/completions style
            msg = choice.get("message") or choice.get("output") or {}
            if isinstance(msg, dict):
                content = msg.get("content") or msg.get("text") or msg.get("message")
                if isinstance(content, str):
                    return content.strip()
                if isinstance(content, list):
                    parts = []
                    for p in content:
                        if isinstance(p, dict) and "text" in p:
                            parts.append(str(p.get("text", "")).strip())
                        elif isinstance(p, str):
                            parts.append(p.strip())
                    return " ".join(parts).strip()
                return str(content).strip()
    except Exception:
        pass
    return str(choice)


def call_groq_completion(prompt: str, system_message: Optional[str] = None, timeout: int = 60) -> str:
    """Call Groq API using the correct payload for /responses or /chat/completions."""
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set in environment. Please set it and restart the server.")

    # Choose endpoint: if user already included full path use as-is; otherwise use /responses by default
    # Accept either base ending with /responses or /chat/completions
    preferred_path = "/responses"
    if GROQ_API_BASE.endswith("/responses") or GROQ_API_BASE.endswith("/chat/completions"):
        url = GROQ_API_BASE
    else:
        url = GROQ_API_BASE + preferred_path

    print(f"DEBUG: call_groq_completion -> URL: {url}, GROQ_MODEL: {GROQ_MODEL}, GROQ_API_KEY set? {bool(GROQ_API_KEY)}")

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    sys_msg = system_message or "You are a helpful assistant. Use the provided context to answer accurately."

    # If calling /responses endpoint, it expects {"model": ..., "input": "..."}
    if url.endswith("/responses"):
        # IMPORTANT: Groq Responses API uses `max_output_tokens` (not `max_tokens`).
        payload = {
            "model": GROQ_MODEL,
            "input": prompt,
            "max_output_tokens": 512,
            "temperature": 0.2,
        }
    # If calling chat/completions style endpoint, use messages array
    elif url.endswith("/chat/completions"):
        payload = {
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": prompt},
            ],
            "max_output_tokens": 512,
            "temperature": 0.2,
        }
    else:
        # fallback to responses-style
        payload = {"model": GROQ_MODEL, "input": prompt, "max_output_tokens": 512, "temperature": 0.2}

    # Send request and include full response body when raising for easier debugging
    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if resp.status_code != 200:
        # print response text for debugging and raise detailed error
        err_text = resp.text
        print(f"DEBUG: Groq non-200 status: {resp.status_code}, body: {err_text}")
        raise RuntimeError(f"Groq API error {resp.status_code}: {err_text}")

    data = resp.json()

    # 1) /responses style: look for top-level "output" list OR "output_text"
    if isinstance(data, dict):
        # responses endpoint often returns 'output' as a list
        if "output" in data and isinstance(data["output"], list) and data["output"]:
            # join textual pieces
            parts = []
            for out in data["output"]:
                if isinstance(out, dict):
                    # content may be list of blocks
                    content = out.get("content") or out.get("text")
                    if isinstance(content, list):
                        for c in content:
                            if isinstance(c, dict) and "text" in c:
                                parts.append(str(c.get("text", "")).strip())
                            elif isinstance(c, str):
                                parts.append(c.strip())
                    elif isinstance(content, str):
                        parts.append(content.strip())
                elif isinstance(out, str):
                    parts.append(out.strip())
            if parts:
                return " ".join(parts).strip()
        if "output_text" in data:
            return str(data["output_text"]).strip()

    # 2) chat/completions style: choices -> first -> message/content
    try:
        if isinstance(data, dict) and "choices" in data and len(data["choices"]) > 0:
            choice = data["choices"][0]
            text = _extract_content_from_choice(choice)
            if text:
                return text
    except Exception:
        pass

    # 3) older completions: choices[0].text
    try:
        if isinstance(data, dict) and "choices" in data and data["choices"]:
            c0 = data["choices"][0]
            if isinstance(c0, dict) and "text" in c0:
                return str(c0["text"]).strip()
    except Exception:
        pass

    # 4) fallback top-level fields
    for key in ("text", "output", "message"):
        if isinstance(data, dict) and key in data:
            return str(data[key]).strip()

    return json.dumps(data)[:4096]


def _is_chitchat(query: str) -> bool:
    if not query:
        return False
    q = query.strip().lower()
    if len(q.split()) <= 3:
        if re.search(r"\b(hi|hello|hey|how are you|how's it going|howdy|thanks|thank you|bye|good morning|good afternoon|good evening)\b", q):
            return True
    if re.search(r"\b(who are you|what can you do|how can you help|tell me a joke)\b", q):
        return True
    return False


# ---- Main route ----
@router.post("/ask", response_model=AskResponse)
async def api_ask(payload: AskRequest):
    try:
        q = payload.query
        top_k = payload.top_k or 3

        if not q or not q.strip():
            return AskResponse(answer="", retrieved=[], debug={"error": "empty_query"})

        chit_err = None
        if _is_chitchat(q):
            try:
                open_prompt = f"The user said: \"{q}\". Reply briefly and politely as a friendly assistant."
                answer = call_groq_completion(open_prompt, system_message="You are a friendly conversational assistant.")
                return AskResponse(answer=answer, retrieved=[], debug={"provider": "groq", "chitchat": True})
            except Exception as e:
                chit_err = str(e)
                print(f"DEBUG: chit chat groq error: {chit_err}")

        try:
            q_emb = embed_query_local(q)
        except Exception as e:
            return AskResponse(answer=None, retrieved=[], debug={"error": "embedding_failed", "detail": str(e)})

        try:
            fs = _import_faiss_store()
            raw_results = fs.search(q_emb, top_k=top_k)
        except Exception as e:
            return AskResponse(answer=None, retrieved=[], debug={"error": "search_failed", "detail": str(e)})

        retrieved = []
        for r in raw_results:
            meta = r.get("meta", {}) if isinstance(r, dict) else {}
            retrieved.append(
                RetrievedChunk(
                    score=float(r.get("score", 0.0)),
                    doc_id=meta.get("doc_id", "<unknown>"),
                    chunk_id=meta.get("chunk_id", "<unknown>"),
                    text=meta.get("text", ""),
                )
            )

        combined_context = "\n\n".join([f"{c.doc_id}::{c.chunk_id}\n{c.text}" for c in retrieved])

        prompt = (
            "Use the following context to answer the user's question. "
            "If the answer is not in the context, say: 'I could not find the answer in the provided documents.'\n\n"
            f"Context:\n{combined_context}\n\nQuestion: {q}\nAnswer:"
        )

        llm_debug: Dict[str, Any] = {}
        llm_answer = None
        try:
            llm_answer = call_groq_completion(prompt)
            llm_debug["provider"] = "groq"
        except Exception as e:
            llm_debug["groq_error"] = str(e)
            print(f"DEBUG: strict-context groq error: {llm_debug['groq_error']}")
            llm_answer = None

        if llm_answer is None:
            if not retrieved or len(combined_context.strip()) < 50:
                try:
                    fallback_prompt = f"The user said: \"{q}\". Reply helpfully and conversationally."
                    llm_answer = call_groq_completion(fallback_prompt, system_message="You are a friendly conversational assistant.")
                    llm_debug["provider"] = "groq_fallback"
                except Exception as e:
                    llm_debug["fallback_error"] = str(e)
                    print(f"DEBUG: fallback groq error: {llm_debug['fallback_error']}")
                    llm_answer = "(No relevant documents and Groq chat failed.)"
            else:
                llm_answer = "(No LLM configured — showing retrieved context instead.)\n\n" + (combined_context or "(no context available)")

        return AskResponse(answer=llm_answer, retrieved=retrieved, debug={"num_retrieved": len(retrieved), **llm_debug, **({"chitchat_error": chit_err} if chit_err else {})})

    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))
