# backend/app/services/rag_service.py
import os
import re
import html
import logging
from typing import List, Dict, Any, Optional

from app.db import faiss_store
from app.services.groq_llm import call_groq_llm

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Env config
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
DEV_DEBUG = os.getenv("DEV_DEBUG", "false").lower() in ("1", "true", "yes")

PROMPT_TEMPLATE = """
You are an AI assistant helping employees with HR, IT, and Finance queries.
Use ONLY the CONTEXT below and the recent conversation history (if any) to answer accurately and concisely.
If the answer is not in the context, reply exactly: "I could not find the answer in the provided documents."

Conversation history:
{history_block}

CONTEXT:
{context}

QUESTION:
{question}

Answer in a polite, professional tone. At the end include a "Sources:" line listing doc_ids used.
"""


def clean_text(txt: Optional[str]) -> str:
    """Sanitize model output: remove control chars, reserved tokens, decode HTML entities."""
    if not txt:
        return ""
    if not isinstance(txt, str):
        try:
            txt = str(txt)
        except Exception:
            return ""
    txt = re.sub(r"<\|reserved_[^|]*\|>", " ", txt, flags=re.IGNORECASE)
    txt = re.sub(r"\|reserved_special_token_\d+\|>?", " ", txt, flags=re.IGNORECASE)
    txt = re.sub(r"<\|[^|]{1,500}\|>", " ", txt, flags=re.IGNORECASE)
    txt = txt.encode("utf-8", "ignore").decode("utf-8", "ignore")
    txt = re.sub(r"[\x00-\x1F\x7F-\x9F]", " ", txt)
    txt = html.unescape(txt)
    txt = re.sub(r"\s+", " ", txt).strip()
    return txt


def _history_to_block(history: Optional[List[Dict[str, str]]], max_turns: int = 6) -> str:
    """Convert history list (chronological) into a compact string block for the prompt."""
    if not history:
        return ""
    h = history[-max_turns:]
    lines = []
    for turn in h:
        role = (turn.get("role") or "user").lower()
        text = (turn.get("text") or "").strip()
        if not text:
            continue
        if role == "assistant":
            lines.append(f"Assistant: {text}")
        else:
            lines.append(f"User: {text}")
    return "\n".join(lines)


def _redact_email(text: str) -> str:
    """Replace email addresses with a redaction token for privacy."""
    return re.sub(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", "[redacted-email]", text)


def generate_answer_with_context(
    query: str,
    history: Optional[List[Dict[str, str]]] = None,
    session_id: Optional[str] = None,
    top_k: int = 4,
) -> Dict[str, Any]:
    """
    Main entrypoint: embed query, retrieve top chunks, build prompt including history, call LLM,
    and return structured response.
    """
    try:
        # 1) Embed the query using local model (faiss_store provides embed_local_texts)
        try:
            emb = faiss_store.embed_local_texts([query])
            if emb is None or len(emb) == 0:
                raise RuntimeError("Local embedding returned no vectors.")
            query_emb = emb[0]
        except Exception as e:
            logger.exception("Local embedding failed")
            return {"question": query, "answer": "Local embedding failed.", "sources": [], "debug": {"error": "embedding_failed", "detail": str(e)}}

        # 2) Retrieve relevant chunks using FAISS or numpy fallback
        try:
            results = faiss_store.search(query_emb, top_k=top_k)
        except Exception as e:
            logger.exception("FAISS search failed")
            results = []
            # continue — we will handle empty results below

        # If nothing retrieved, return explicit "not found" (or you could choose to call LLM freeform)
        if not results:
            return {
                "question": query,
                "answer": "I could not find the answer in the provided documents.",
                "sources": [],
            }

        # 3) Build readable context (limit length per chunk)
        context_parts = []
        for r in results:
            # r is expected to be {"score":float, "meta": chunk_dict}
            meta = r.get("meta") if isinstance(r, dict) else {}
            text = meta.get("text") if isinstance(meta, dict) else (r.get("text") if isinstance(r, dict) else "")
            doc_id = meta.get("doc_id") or r.get("doc_id") or "unknown"
            snippet = (text or "").strip()[:1500]
            context_parts.append(f"[{doc_id}]\n{snippet}")
        context_text = "\n\n".join(context_parts)

        # 4) Build conversation history block
        history_block = _history_to_block(history, max_turns=6)

        # 5) Build final prompt for strict-context RAG
        prompt = PROMPT_TEMPLATE.format(history_block=history_block, context=context_text, question=query)

        if DEV_DEBUG:
            logger.debug("PROMPT SENT TO LLM:\n%s", prompt)

        # 6) Call Groq LLM (call_groq_llm should return string or dict)
        try:
            llm_resp = call_groq_llm(prompt)
        except Exception as e:
            logger.exception("call_groq_llm failed")
            llm_resp = None

        raw_text = ""
        raw_obj = None
        if isinstance(llm_resp, dict):
            raw_text = llm_resp.get("text") or ""
            raw_obj = llm_resp.get("raw")
        else:
            raw_text = llm_resp or ""

        # 7) Redact emails for privacy
        if raw_text:
            raw_text = _redact_email(raw_text)

        # 8) Clean and validate output
        cleaned = clean_text(raw_text)
        if not cleaned:
            # If model returned nothing clean, fallback to returning readable context
            readable_context = "\n\n".join([f"{r.get('doc_id')}: {(r.get('text') or '')[:800]}" for r in results])
            resp = {
                "question": query,
                "answer": "I couldn't get a clean model response. Here is the most relevant information I found:\n\n" + readable_context,
                "sources": [{"doc_id": r.get("doc_id"), "score": r.get("score")} for r in results],
            }
            if DEV_DEBUG:
                resp["raw_llm"] = raw_obj or raw_text
            return resp

        # 9) Parse sources: prefer explicit "Sources:" line emitted by model, fallback to those retrieved
        sources = []
        m = re.search(r"SOURCES\s*:\s*(.+)", raw_text or "", flags=re.IGNORECASE)
        if m:
            parts = [p.strip() for p in re.split(r"[,\|;]", m.group(1)) if p.strip()]
            sources = [{"doc_id": p} for p in parts]
        else:
            sources = [{"doc_id": r.get("meta", {}).get("doc_id") or r.get("doc_id"), "score": r.get("score")} for r in results]

        # 10) Return structured response
        response = {"question": query, "answer": cleaned, "sources": sources}
        if DEV_DEBUG:
            response["raw_llm"] = raw_obj or raw_text

        return response

    except Exception as e:
        logger.exception("Error in generate_answer_with_context")
        return {"question": query, "answer": f"Error generating answer: {str(e)}", "sources": []}
