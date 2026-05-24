import os
import json
import shutil
import datetime
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db, DATA_DIR
from models import Transcript
from services.gladia_service import transcribe_multilingual
from services.whisper_service import transcribe_english
from services.gemini_service import generate_english_summary

router = APIRouter(prefix="/transcripts", tags=["transcripts"])
AUDIO_DIR = os.path.join(DATA_DIR, "audio")


@router.post("/")
async def create_transcript(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    mode: str = Form("lesson"),          # "lesson" | "english"
    title: str = Form(""),
    source_lang: str = Form("de"),
    target_lang: str = Form("en"),
    langs: str = Form("de,en"),           # comma-separated
    db: Session = Depends(get_db),
):
    """Upload audio and start transcription. Returns transcript record immediately; processing is async."""
    ext = os.path.splitext(file.filename)[1] or ".m4a"
    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{ts}_{file.filename}"
    audio_path = os.path.join(AUDIO_DIR, filename)

    with open(audio_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Delete any existing transcript with the same filename to avoid duplicates
    existing = db.query(Transcript).filter(Transcript.audio_filename == filename).first()
    if not existing:
        # Also check by original title (same file re-uploaded)
        existing = db.query(Transcript).filter(Transcript.title == (title or file.filename)).first()
    if existing:
        db.delete(existing)
        db.flush()

    # Also delete any transcript that literally has the same title
    title_to_match = title or file.filename
    duplicates = db.query(Transcript).filter(Transcript.title == title_to_match).all()
    for d in duplicates:
        db.delete(d)
    db.flush()

    db_transcript = Transcript(
        title=title or file.filename,
        mode=mode,
        source_lang=source_lang,
        target_lang=target_lang,
        audio_filename=filename,
        raw_text="",
        utterances_json="[]",
    )
    db.add(db_transcript)
    db.commit()
    db.refresh(db_transcript)

    background_tasks.add_task(_run_transcription, db_transcript.id, audio_path, mode, langs.split(","))
    return {"id": db_transcript.id, "status": "processing", "filename": filename}


async def _run_transcription(transcript_id: int, audio_path: str, mode: str, langs: list[str]):
    """Background task that calls the transcription API and updates the DB."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        db_transcript = db.query(Transcript).filter(Transcript.id == transcript_id).first()
        if not db_transcript:
            return

        if mode == "lesson":
            result = await transcribe_multilingual(audio_path, langs)
        else:
            result = await transcribe_english(audio_path)

        db_transcript.raw_text = result["full_text"]
        db_transcript.utterances_json = json.dumps(result["utterances"])
        db_transcript.duration_seconds = result.get("duration_seconds")
        
        char_count = len(db_transcript.raw_text)
        print(f"DEBUG: Transcript {transcript_id} created. Length: {char_count} characters.")
        
        db.commit()
    except Exception as e:
        db_transcript = db.query(Transcript).filter(Transcript.id == transcript_id).first()
        if db_transcript:
            db_transcript.raw_text = f"ERROR: {str(e)}"
            db.commit()
    finally:
        db.close()


@router.get("/")
def list_transcripts(db: Session = Depends(get_db)):
    transcripts = db.query(Transcript).order_by(Transcript.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "mode": t.mode,
            "created_at": t.created_at.isoformat(),
            "duration_seconds": t.duration_seconds,
            "audio_filename": t.audio_filename,
            "has_text": bool(t.raw_text and not t.raw_text.startswith("ERROR")),
            "char_count": len(t.raw_text) if t.raw_text else 0,
        }
        for t in transcripts
    ]


@router.get("/{transcript_id}")
def get_transcript(transcript_id: int, db: Session = Depends(get_db)):
    t = db.query(Transcript).filter(Transcript.id == transcript_id).first()
    if not t:
        raise HTTPException(404, "Transcript not found")
    utterances = json.loads(t.utterances_json or "[]")
    return {
        "id": t.id,
        "title": t.title,
        "mode": t.mode,
        "source_lang": t.source_lang,
        "target_lang": t.target_lang,
        "created_at": t.created_at.isoformat(),
        "duration_seconds": t.duration_seconds,
        "audio_filename": t.audio_filename,
        "raw_text": t.raw_text,
        "utterances": utterances,
    }


@router.patch("/{transcript_id}")
def update_transcript(transcript_id: int, body: dict, db: Session = Depends(get_db)):
    t = db.query(Transcript).filter(Transcript.id == transcript_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    for field in ["title", "mode", "source_lang", "target_lang"]:
        if field in body:
            setattr(t, field, body[field])
    db.commit()
    return {"ok": True}


@router.delete("/{transcript_id}")
def delete_transcript(transcript_id: int, db: Session = Depends(get_db)):
    t = db.query(Transcript).filter(Transcript.id == transcript_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/{transcript_id}/summarise-english")
async def summarise_english(transcript_id: int, body: dict = {}, db: Session = Depends(get_db)):
    """Generate AI summary for English-mode transcripts (meetings, life notes, etc)."""
    t = db.query(Transcript).filter(Transcript.id == transcript_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    result = await generate_english_summary(t.raw_text or "", body.get("context", ""))
    return result
