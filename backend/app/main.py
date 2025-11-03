# app/main.py
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers AFTER app creation
from app.routes.ask_route import router as ask_router
from app.routes.docs_route import router as docs_router

# -------------------- Create FastAPI App --------------------
app = FastAPI(
    title="AI Assistant (RAG + Groq)",
    description="Backend for AI Assistant using FAISS, Groq Embeddings, and Document Upload.",
    version="1.0.0"
)

# -------------------- Configure CORS --------------------
# Allow your frontend (React dev server) to call this backend.
# You can use ["*"] temporarily during local testing.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------- Include Routers --------------------
# /api/ask  → for RAG-based question answering
# /api/docs → for document upload + indexing
app.include_router(ask_router, prefix="/api")
app.include_router(docs_router, prefix="/api")

# -------------------- Root Endpoint --------------------
@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "AI Assistant backend is running 🚀",
        "routes": ["/api/ask", "/api/docs/upload", "/api/docs/summarize"],
    }


# -------------------- Health Check --------------------
@app.get("/api/health")
def health_check():
    """
    Health check endpoint — verifies backend is alive and configured.
    """
    return {"ok": True, "service": "AI Assistant Backend (FAISS + Groq)", "status": "running"}
