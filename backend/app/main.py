# app/main.py
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers AFTER app creation
from app.routes.ask_route import router as ask_router
from app.routes.docs_route import router as docs_router

# -------------------- Create FastAPI App --------------------
app = FastAPI(title="AI Assistant")

# -------------------- Configure CORS --------------------
# Allow your frontend (React dev server) to call this backend.
# You can temporarily use ["*"] during testing but restrict later for security.
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
# Each router handles a separate module of the backend.
app.include_router(ask_router, prefix="/api")
app.include_router(docs_router, prefix="/api")

# -------------------- Root Endpoint --------------------
@app.get("/")
def root():
    return {"message": "AI Assistant backend is running 🚀"}
