# app/main.py
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# -------------------- Create FastAPI App --------------------
app = FastAPI(
    title="AI Assistant (RAG + Groq)",
    description="Backend for AI Assistant using FAISS, Groq Embeddings, and Document Upload.",
    version="1.0.0",
)

# -------------------- Configure CORS --------------------
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

# -------------------- Import & Include Routers --------------------
# (Import after app creation to avoid accidental import cycles)
from app.routes.ask_route import router as ask_router
from app.routes.docs_route import router as docs_router
from app.routes.auth_route import router as auth_router  # NEW

# /api/ask  → RAG Q&A
# /api/docs → document upload/index/summarize
# /auth/*   → signup/login (router already has prefix="/auth")
app.include_router(ask_router, prefix="/api")
app.include_router(docs_router, prefix="/api")
app.include_router(auth_router)

# -------------------- Root Endpoint --------------------
@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "AI Assistant backend is running 🚀",
        "routes": [
            "/api/ask",
            "/api/docs/upload",
            "/api/docs/summarize",
            "/auth/signup",
            "/auth/login",
        ],
    }

# -------------------- Health Check --------------------
@app.get("/api/health")
def health_check():
    """Health check endpoint — verifies backend is alive and configured."""
    return {"ok": True, "service": "AI Assistant Backend (FAISS + Groq)", "status": "running"}
