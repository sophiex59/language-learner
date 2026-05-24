import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv()

from database import engine, Base, DATA_DIR
import models  # ensure models are registered with Base

# Create all tables
Base.metadata.create_all(bind=engine)

from routers import transcripts, lessons, vocab, textbooks, ai_teacher

app = FastAPI(title="Language Learner API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for local dev simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. API Routers
app.include_router(transcripts.router)
app.include_router(lessons.router)
app.include_router(vocab.router)
app.include_router(textbooks.router)
app.include_router(ai_teacher.router)

# 2. Static Audio/Thumbnails
AUDIO_DIR = os.path.join(DATA_DIR, "audio")
THUMBNAILS_DIR = os.path.join(DATA_DIR, "thumbnails")
TB_AUDIO_DIR = os.path.join(DATA_DIR, "textbook_audio")
app.mount("/static/audio", StaticFiles(directory=AUDIO_DIR), name="audio")
app.mount("/static/thumbnails", StaticFiles(directory=THUMBNAILS_DIR), name="thumbnails")
app.mount("/static/textbook_audio", StaticFiles(directory=TB_AUDIO_DIR), name="textbook_audio")

# 3. Frontend Assets (CSS, JS)
FRONTEND_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend"))
app.mount("/src", StaticFiles(directory=os.path.join(FRONTEND_DIR, "src")), name="src")
# We don't mount / at / yet, we want to catch it with a route for SPA fallback

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/style.css")
def serve_css():
    return FileResponse(os.path.join(FRONTEND_DIR, "style.css"))

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """Catch-all route to serve the SPA index.html for any frontend route."""
    # Check if it's a real file (like favicon or an asset we missed)
    potential_file = os.path.join(FRONTEND_DIR, full_path)
    if os.path.isfile(potential_file):
        return FileResponse(potential_file)
    
    # Otherwise, serve index.html for frontend routing
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    return FileResponse(index_path)

@app.on_event("startup")
async def on_startup():
    from database import SessionLocal
    from services.pdf_service import scan_textbook_directory
    db = SessionLocal()
    try:
        scan_textbook_directory(db)
    finally:
        db.close()
