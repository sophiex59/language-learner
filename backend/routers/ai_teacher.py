import datetime
import json
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import AITeacherNote, Lesson, VocabEntry, Transcript, ProgressReport
from services.gemini_service import generate_progress_report

router = APIRouter(prefix="/ai-teacher", tags=["ai-teacher"])

# GOALS.md lives at the project root (two levels up from this file)
_GOALS_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "GOALS.md")


def _read_goals() -> str:
    try:
        with open(_GOALS_PATH, "r") as f:
            return f.read()
    except FileNotFoundError:
        return "No goals file found. Please create a GOALS.md file in the project root."


@router.get("/report")
async def get_progress_report(db: Session = Depends(get_db)):
    """Generate a full AI progress report using all lesson summaries and GOALS.md."""
    lesson_count = db.query(Lesson).count()
    vocab_count = db.query(VocabEntry).count()
    transcript_count = db.query(Transcript).count()

    # Pull ALL lessons that have summaries — manual and recorded
    all_lessons = (
        db.query(Lesson)
        .order_by(Lesson.date.asc().nullslast(), Lesson.created_at.asc())
        .all()
    )

    lesson_summaries = []
    for l in all_lessons:
        entry = {
            "title": l.title or "Untitled",
            "date": l.date.isoformat() if l.date else None,
            "topics": l.topics or "",
            "source": l.source or "recorded",
        }
        if l.summary_went_well:
            try:
                entry["went_well"] = json.loads(l.summary_went_well)
            except Exception:
                pass
        if l.summary_struggles:
            try:
                entry["struggles"] = json.loads(l.summary_struggles)
            except Exception:
                pass
        if l.summary_new_vocab:
            try:
                entry["new_vocab"] = json.loads(l.summary_new_vocab)
            except Exception:
                pass
        if l.summary_grammar:
            try:
                entry["grammar"] = json.loads(l.summary_grammar)
            except Exception:
                pass
        if l.summary_next_steps:
            try:
                entry["next_steps"] = json.loads(l.summary_next_steps)
            except Exception:
                pass
        if l.manual_notes:
            entry["manual_notes"] = l.manual_notes
        lesson_summaries.append(entry)

    # Gather teacher notes
    notes = db.query(AITeacherNote).order_by(AITeacherNote.updated_at.desc()).limit(10).all()
    notes_text = "\n".join(f"[{n.category}] {n.content}" for n in notes) if notes else "None"

    context = {
        "lesson_count": lesson_count,
        "vocab_count": vocab_count,
        "transcript_count": transcript_count,
        "goals_text": _read_goals(),
        "lesson_summaries": lesson_summaries,
        "teacher_notes": notes_text,
    }

    report_text = await generate_progress_report(context)

    # Persist the report
    saved = ProgressReport(content=report_text)
    db.add(saved)
    db.commit()
    db.refresh(saved)

    return {"id": saved.id, "report": report_text, "generated_at": saved.created_at.isoformat()}


@router.get("/reports")
def list_reports(db: Session = Depends(get_db)):
    """Return all previously generated progress reports, newest first."""
    reports = db.query(ProgressReport).order_by(ProgressReport.created_at.desc()).all()
    return [
        {"id": r.id, "created_at": r.created_at.isoformat(), "preview": r.content[:200]}
        for r in reports
    ]


@router.get("/reports/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)):
    r = db.query(ProgressReport).filter(ProgressReport.id == report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    return {"id": r.id, "report": r.content, "generated_at": r.created_at.isoformat()}


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Quick stats for the dashboard header."""
    return {
        "lesson_count": db.query(Lesson).count(),
        "vocab_count": db.query(VocabEntry).count(),
        "transcript_count": db.query(Transcript).count(),
        "note_count": db.query(AITeacherNote).count(),
    }


@router.get("/notes")
def list_notes(db: Session = Depends(get_db)):
    notes = db.query(AITeacherNote).order_by(AITeacherNote.updated_at.desc()).all()
    return [_serialize_note(n) for n in notes]


@router.post("/notes")
def create_note(body: dict, db: Session = Depends(get_db)):
    note = AITeacherNote(
        category=body.get("category", "general"),
        content=body.get("content", ""),
        ai_generated=body.get("ai_generated", False),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _serialize_note(note)


@router.patch("/notes/{note_id}")
def update_note(note_id: int, body: dict, db: Session = Depends(get_db)):
    note = db.query(AITeacherNote).filter(AITeacherNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    if "content" in body:
        note.content = body["content"]
    if "category" in body:
        note.category = body["category"]
    note.updated_at = datetime.datetime.utcnow()
    db.commit()
    return _serialize_note(note)


@router.delete("/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(AITeacherNote).filter(AITeacherNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Not found")
    db.delete(note)
    db.commit()
    return {"ok": True}


def _serialize_note(n: AITeacherNote) -> dict:
    return {
        "id": n.id,
        "category": n.category,
        "content": n.content,
        "ai_generated": n.ai_generated,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }
