# backend/app/routes/ask_route.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import os
import traceback
import requests
import re
import json
from datetime import datetime

# --- Optional: only used if you enabled Mongo + auth files I gave you ---
# If you haven't added these yet, keep the imports; they won't break as long as files exist.
try:
    from app.db.mongo import chats_col
    from app.deps import get_current_user
except Exception:
    chats_col = None
    def get_current_user(*args, **kwargs):
        return None

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
        # Groq Responses API uses `max_output_tokens`
        payload = {
            "model": GROQ_MODEL,
            "input": prompt,
            "max_output_tokens": 512,
            "temperature": 0.2,
        }
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
        payload = {"model": GROQ_MODEL, "input": prompt, "max_output_tokens": 512, "temperature": 0.2}

    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if resp.status_code != 200:
        err_text = resp.text
        print(f"DEBUG: Groq non-200 status: {resp.status_code}, body: {err_text}")
        raise RuntimeError(f"Groq API error {resp.status_code}: {err_text}")

    data = resp.json()

    # 1) /responses style: look for top-level "output" list OR "output_text"
    if isinstance(data, dict):
        if "output" in data and isinstance(data["output"], list) and data["output"]:
            parts = []
            for out in data["output"]:
                if isinstance(out, dict):
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

    # 2) chat/completions style
    try:
        if isinstance(data, dict) and "choices" in data and len(data["choices"]) > 0:
            choice = data["choices"][0]
            text = _extract_content_from_choice(choice)
            if text:
                return text
    except Exception:
        pass

    # 3) older completions
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


# ---- Context / Prompt builder ----
def build_conversation_prompt(history: Optional[List[Dict[str, Any]]], retrieved: List[RetrievedChunk], user_query: str, max_history_turns: int = 6) -> str:
    """
    Combine system message + pruned history + numbered retrieved context + user question into a single prompt string.
    """
    # Prune and format history: keep only last max_history_turns turns
    history = history or []
    recent = history[-max_history_turns:] if history else []
    history_lines = []
    for turn in recent:
        role = turn.get("role", "user")
        text = turn.get("text", "").strip()
        if not text:
            continue
        history_lines.append(f"{role.capitalize()}: {text}")

    history_block = "\n".join(history_lines) if history_lines else "(no prior conversation)\n"

    # Number retrieved chunks for easier citation and clarity
    context_parts = []
    for idx, c in enumerate(retrieved, start=1):
        excerpt = (c.text or "").strip().replace("\n", " ")
        if len(excerpt) > 800:
            excerpt = excerpt[:797].rsplit(" ", 1)[0] + "..."
        context_parts.append(f"[{idx}] {c.doc_id} :: {c.chunk_id}\n{excerpt}")

    context_block = "\n\n".join(context_parts) if context_parts else "(no relevant documents retrieved)"

    prompt = (
        "You are a helpful, factual assistant. Use the conversation history and the provided document context to answer the user's question.\n\n"
        "Guidelines:\n"
        "- Provide a concise direct answer first (1–3 short sentences).\n"
        "- If you use content from the context, include inline citation markers like [1], [2], etc.\n"
        "- DO NOT repeat or paste full content from the retrieved documents. Only cite them by number.\n"
        "- After the concise answer, you may add one short explanatory sentence, but do NOT include long excerpts.\n"
        "- If the answer is not found in the documents or conversation, reply: 'I could not find the answer in the provided documents.'\n"
        "- If the user explicitly asks for a list (e.g. 'give 5 important points'), return a numbered or bulleted list only.\n"
        "- Provide the short answer first using bullets or numbered items if the user requested that format.\n\n"
        "Conversation so far:\n"
        f"{history_block}\n\n"
        "Relevant context (numbered):\n"
        f"{context_block}\n\n"
        f"User's new question: {user_query}\n\n"
        "Assistant:"
    )
    return prompt


# ---- Main route ----
@router.post("/ask", response_model=AskResponse)
async def api_ask(payload: AskRequest, user=Depends(get_current_user)):
    try:
        q = payload.query
        top_k = payload.top_k or 3
        history = payload.history or []

        if not q or not q.strip():
            return AskResponse(answer="", retrieved=[], debug={"error": "empty_query"})

        chit_err = None
        if _is_chitchat(q):
            try:
                open_prompt = f'The user said: "{q}". Reply briefly and politely as a friendly assistant.'
                answer = call_groq_completion(open_prompt, system_message="You are a friendly conversational assistant.")
                # Save chit-chat too (optional)
                try:
                    if user and chats_col:
                        chats_col.insert_one({
                            "user_id": user.get("user_id"),
                            "email": user.get("email"),
                            "question": q,
                            "answer": answer,
                            "retrieved": [],
                            "created_at": datetime.utcnow(),
                            "kind": "chitchat"
                        })
                except Exception:
                    pass
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

        retrieved: List[RetrievedChunk] = []
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

        # (Optional) light filtering to reduce noise, without changing core behavior
        if len(retrieved) > 0:
            retrieved = sorted(retrieved, key=lambda x: x.score, reverse=True)[:top_k]

        # Build the contextual prompt using history + retrieved
        prompt = build_conversation_prompt(history, retrieved, q)

        llm_debug: Dict[str, Any] = {}
        llm_answer = None
        try:
            system_msg = (
                "You are a concise assistant. ALWAYS keep answers brief and structured. "
                "Use citations like [1], [2] when drawing from context."
            )
            llm_answer = call_groq_completion(prompt, system_message=system_msg)
            llm_debug["provider"] = "groq"
        except Exception as e:
            llm_debug["groq_error"] = str(e)
            print(f"DEBUG: strict-context groq error: {llm_debug['groq_error']}")
            llm_answer = None

        # --- Defensive cleanup: remove any 'Sources:' or long context echoes from model output ---
        try:
            if isinstance(llm_answer, str) and llm_answer.strip():
                llm_answer = re.split(r'\n{1,2}Sources:\s*\n', llm_answer, flags=re.IGNORECASE)[0].strip()
                if len(llm_answer) > 3000:
                    llm_answer = llm_answer.split('\n\n', 1)[0].strip()
        except Exception:
            pass

        # Fallbacks if LLM failed or no context
        if llm_answer is None:
            if not retrieved or len("\n\n".join([c.text for c in retrieved]).strip()) < 50:
                try:
                    fallback_prompt = f'The user said: "{q}". Reply helpfully and conversationally.'
                    llm_answer = call_groq_completion(fallback_prompt, system_message="You are a friendly conversational assistant.")
                    llm_debug["provider"] = "groq_fallback"
                except Exception as e:
                    llm_debug["fallback_error"] = str(e)
                    print(f"DEBUG: fallback groq error: {llm_debug['fallback_error']}")
                    llm_answer = "(No relevant documents and Groq chat failed.)"
            else:
                combined_context = "\n\n".join([f"{c.doc_id}::{c.chunk_id}\n{c.text}" for c in retrieved])
                llm_answer = "(No LLM configured — showing retrieved context instead.)\n\n" + (combined_context or "(no context available)")

        # Append deterministic Sources block so frontend can display exact sources
        sources_lines = []
        for idx, c in enumerate(retrieved, start=1):
            excerpt = (c.text or "").strip().replace("\n", " ")
            if len(excerpt) > 200:
                excerpt = excerpt[:197].rsplit(" ", 1)[0] + "..."
            sources_lines.append(f"[{idx}] {c.doc_id} :: {c.chunk_id}\n    {excerpt}")

        sources_block = "Sources:\n" + "\n\n".join(sources_lines) if sources_lines else ""
        llm_answer_with_sources = f"{llm_answer}\n\n{sources_block}" if sources_block else llm_answer

        # --- Save Q/A for logged-in users (best-effort, never blocks) ---
        try:
            if user and chats_col:
                chats_col.insert_one({
                    "user_id": user.get("user_id"),
                    "email": user.get("email"),
                    "question": q,
                    "answer": llm_answer_with_sources,
                    "retrieved": [c.dict() for c in retrieved],
                    "created_at": datetime.utcnow(),
                    "kind": "qa"
                })
        except Exception:
            pass

        return AskResponse(
            answer=llm_answer_with_sources,
            retrieved=retrieved,
            debug={"num_retrieved": len(retrieved), **llm_debug, **({"chitchat_error": chit_err} if chit_err else {})}
        )

    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))
