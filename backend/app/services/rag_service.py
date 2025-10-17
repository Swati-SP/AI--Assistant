# backend/app/services/rag_service.py

import os
from groq import Groq
from app.db.faiss_store import search

# Load environment variables
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_COMPLETION_MODEL = os.getenv("GROQ_COMPLETION_MODEL", "llama-3.1-8b-instant")

PROMPT_TEMPLATE = """
You are an AI assistant helping employees with HR, IT, and Finance queries.
Use only the context below to answer accurately and concisely.

Question:
{question}

Context:
{context}

Answer in a polite, professional tone:
"""


def call_groq_llm(prompt: str) -> str:
    """
    Calls Groq chat completions API and returns the generated answer.
    """
    if not GROQ_API_KEY:
        return "⚠️ No GROQ_API_KEY found. Running in local mode."

    try:
        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model=GROQ_COMPLETION_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful AI assistant for enterprise workflow support."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,
            max_tokens=300
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        return f"Groq API error: {str(e)}"


def get_answer(question: str):
    """
    Retrieve top chunks from FAISS, build context, and query Groq LLM.
    """
    results = search(question, top_k=4)
    if not results:
        return {"answer": "No relevant information found.", "sources": []}

    # Build context from top chunks
    context = "\n\n".join([r["text"][:500] for r in results])
    prompt = PROMPT_TEMPLATE.format(question=question, context=context)

    # Get LLM-generated answer
    answer = call_groq_llm(prompt)

    return {
        "question": question,
        "answer": answer,
        "sources": [{"doc_id": r["doc_id"], "score": r["score"]} for r in results]
    }
