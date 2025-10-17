from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from app.routes.ask_route import router as ask_router

app = FastAPI(title="AI Assistant")

# Include all routers

app.include_router(ask_router, prefix="/api")
