# app/main.py
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.ask_route import router as ask_router

app = FastAPI(title="AI Assistant")

# === CORS (allow frontend to call this API during local dev) ===
# For local testing you can allow localhost:3000 (React dev server).
# You may use ["*"] temporarily while debugging, but replace it with
# the exact origin(s) before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # or ["*"] for quick test
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(ask_router, prefix="/api")
