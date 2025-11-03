import os
import logging
import requests
from typing import Any, Dict

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Environment variables
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_COMPLETION_MODEL", "llama-3.1-8b-instant")
GROQ_API_URL = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1").rstrip("/")
DEV_DEBUG = os.getenv("DEV_DEBUG", "false").lower() in ("1", "true", "yes")

def _extract_text_from_response(data: Dict[str, Any]) -> str:
    """
    Extract the clean text message from Groq's Chat Completions API JSON.
    Handles different possible JSON shapes for backward compatibility.
    """
    try:
        # Standard OpenAI-style shape
        choices = data.get("choices", [])
        if choices and isinstance(choices[0], dict):
            msg = choices[0].get("message")
            if isinstance(msg, dict) and "content" in msg:
                return msg["content"]
            # fallback: older or unusual Groq responses
            return choices[0].get("text", "") or data.get("text", "")
        return data.get("output", "") or ""
    except Exception as e:
        logger.debug("Error extracting text from response: %s", e)
        return ""

def call_groq_llm(
    prompt: str,
    max_tokens: int = 512,
    temperature: float = 0.0,
    timeout: int = 30,
) -> str:
    """
    Calls Groq Chat Completions API safely and returns clean text content.
    Falls back gracefully if the API or key is missing.
    """
    if not GROQ_API_KEY:
        logger.error("❌ GROQ_API_KEY not set.")
        return "Error: GROQ API key not configured."

    url = f"{GROQ_API_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a knowledgeable AI assistant that provides clear, concise answers "
                    "based on the given context and question."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "max_tokens": int(max_tokens),
        "temperature": float(temperature),
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=timeout)

        if DEV_DEBUG:
            logger.debug(f"🔹 Groq POST {url} -> {resp.status_code}")
            logger.debug(f"🔹 Groq response text (truncated): {resp.text[:800]!r}")

        if resp.status_code != 200:
            logger.error("Groq API returned non-200: %s %s", resp.status_code, resp.text)
            return f"Error: Groq API returned {resp.status_code} {resp.reason}"

        try:
            data = resp.json()
        except ValueError:
            logger.error("Groq returned invalid JSON.")
            return "Error: Groq returned invalid JSON."

        # Extract message text safely
        text = _extract_text_from_response(data)
        if not text:
            logger.warning("⚠️ Groq API returned empty message content.")
            return "Error: No text content in Groq response."

        return text.strip()

    except requests.exceptions.Timeout:
        return "Error: Groq API request timed out."
    except requests.exceptions.ConnectionError:
        return "Error: Unable to connect to Groq API."
    except Exception as e:
        logger.exception("Groq API call failed")
        return f"Error: Groq API call failed: {str(e)}"

# Backward compatibility alias (for older code)
generate_completion = call_groq_llm
