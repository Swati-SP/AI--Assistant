# app/routes/ask_route.py
from fastapi import APIRouter
from pydantic import BaseModel
from app.services.rag_service import get_answer

router = APIRouter()

class Question(BaseModel):
    query: str

@router.post("/ask", summary="Ask Question")
def ask_question(question: Question):
    """
    Accepts a query and returns an AI-generated answer
    using the RAG (Retrieval-Augmented Generation) pipeline.
    """
    result = get_answer(question.query)
    return result
