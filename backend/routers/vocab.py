import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import VocabEntry
from services.gemini_service import translate, generate_vocab_list

router = APIRouter(prefix="/vocab", tags=["vocab"])


# ─── SM-2 Spaced Repetition ───────────────────────────────────────────────────

def _apply_sm2(entry: VocabEntry, rating: int) -> VocabEntry:
    """
    Apply the classic SM-2 algorithm.
    rating: 1=Again, 2=Hard, 3=Good, 4=Easy
    """
    ease = entry.srs_ease or 2.5
    interval = entry.srs_interval or 1
    reviews = entry.srs_reviews or 0

    if rating == 1:  # Again
        interval = 1
        ease = max(1.3, ease - 0.2)
        reviews = 0 # Reset streak on fail
    elif rating == 2:  # Hard
        interval = max(1, round(interval * 1.2))
        ease = max(1.3, ease - 0.15)
        reviews += 1
    elif rating == 3:  # Good
        if reviews == 0:
            interval = 1
        elif reviews == 1:
            interval = 6
        else:
            interval = round(interval * ease)
        reviews += 1
    elif rating == 4:  # Easy
        if reviews == 0:
            interval = 4
        else:
            interval = round(interval * ease * 1.3)
        ease = min(4.0, ease + 0.15)
        reviews += 1

    entry.srs_interval = interval
    entry.srs_ease = round(ease, 2)
    entry.srs_reviews = reviews
    entry.srs_due_date = datetime.date.today() + datetime.timedelta(days=interval)
    return entry


# ─── Translation ──────────────────────────────────────────────────────────────

@router.post("/translate")
async def do_translate(body: dict, db: Session = Depends(get_db)):
    """Translate text and optionally save to vocab log."""
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(400, "text is required")

    source_lang = body.get("source_lang", "de")
    target_lang = body.get("target_lang", "en")
    context = body.get("context", "")

    result = await translate(text, source_lang, target_lang, context)

    # Auto-save to vocab log
    if body.get("save", True):
        today = datetime.date.today()
        entry = VocabEntry(
            source_text=text,
            translated_text=result.get("translation", ""),
            source_lang=source_lang,
            target_lang=target_lang,
            context_sentence=context or None,
            example_sentence=result.get("example", "") or None,
            notes=result.get("notes", "") or None,
            textbook_id=body.get("textbook_id"),
            textbook_chapter=body.get("textbook_chapter"),
            lesson_id=body.get("lesson_id"),
            srs_interval=1,
            srs_ease=2.5,
            srs_due_date=today,
            srs_reviews=0,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        result["vocab_id"] = entry.id

    return result


# ─── Listing & management ─────────────────────────────────────────────────────

@router.get("/due")
def get_due_cards(lesson_id: int = None, db: Session = Depends(get_db)):
    """Return vocab cards due for review today (optionally filtered by lesson)."""
    today = datetime.date.today()
    q = db.query(VocabEntry).filter(
        (VocabEntry.srs_due_date == None) | (VocabEntry.srs_due_date <= today)
    )
    if lesson_id:
        q = q.filter(VocabEntry.lesson_id == lesson_id)
    cards = q.order_by(VocabEntry.srs_due_date.asc().nullsfirst()).all()
    return {"cards": [_serialize(c) for c in cards], "count": len(cards)}


@router.get("/stats")
def get_vocab_stats(db: Session = Depends(get_db)):
    """Quick SRS stats for the flashcard tab."""
    today = datetime.date.today()
    total = db.query(VocabEntry).count()
    due = db.query(VocabEntry).filter(
        (VocabEntry.srs_due_date == None) | (VocabEntry.srs_due_date <= today)
    ).count()
    return {"total": total, "due_today": due}


@router.post("/review/{entry_id}")
def review_card(entry_id: int, body: dict, db: Session = Depends(get_db)):
    """Apply SM-2 rating to a vocab card. rating: 1=Again, 2=Good, 3=Easy."""
    e = db.query(VocabEntry).filter(VocabEntry.id == entry_id).first()
    if not e:
        raise HTTPException(404, "Not found")
    rating = body.get("rating", 2)
    if rating not in (1, 2, 3):
        raise HTTPException(400, "rating must be 1, 2, or 3")
    e = _apply_sm2(e, rating)
    db.commit()
    return _serialize(e)


@router.get("/")
def list_vocab(
    source_lang: str = None,
    lesson_id: int = None,
    textbook_id: int = None,
    db: Session = Depends(get_db),
):
    q = db.query(VocabEntry).order_by(VocabEntry.created_at.desc())
    if source_lang:
        q = q.filter(VocabEntry.source_lang == source_lang)
    if lesson_id:
        q = q.filter(VocabEntry.lesson_id == lesson_id)
    if textbook_id:
        q = q.filter(VocabEntry.textbook_id == textbook_id)
    return [_serialize(e) for e in q.all()]


@router.get("/study-list")
async def get_study_list(db: Session = Depends(get_db)):
    """Generate an AI-compiled thematic vocab study list from all saved vocab."""
    entries = db.query(VocabEntry).order_by(VocabEntry.created_at.desc()).limit(150).all()
    vocab_dicts = [
        {
            "source_text": e.source_text,
            "translated_text": e.translated_text or "",
            "date": e.created_at.date().isoformat() if e.created_at else "",
        }
        for e in entries
    ]
    if not vocab_dicts:
        return {"study_list": "No vocabulary saved yet."}
    result = await generate_vocab_list(vocab_dicts)
    return {"study_list": result}


@router.post("/")
def add_vocab(body: dict, db: Session = Depends(get_db)):
    today = datetime.date.today()
    entry = VocabEntry(
        source_text=body.get("source_text", ""),
        translated_text=body.get("translated_text", ""),
        source_lang=body.get("source_lang", "de"),
        target_lang=body.get("target_lang", "en"),
        context_sentence=body.get("context_sentence"),
        example_sentence=body.get("example_sentence"),
        notes=body.get("notes"),
        textbook_id=body.get("textbook_id"),
        textbook_chapter=body.get("textbook_chapter"),
        lesson_id=body.get("lesson_id"),
        srs_interval=1,
        srs_ease=2.5,
        srs_due_date=today,
        srs_reviews=0,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _serialize(entry)


@router.patch("/{entry_id}")
def update_vocab(entry_id: int, body: dict, db: Session = Depends(get_db)):
    e = db.query(VocabEntry).filter(VocabEntry.id == entry_id).first()
    if not e:
        raise HTTPException(404, "Not found")
    for field in ["notes", "textbook_chapter", "textbook_id", "lesson_id", "context_sentence"]:
        if field in body:
            setattr(e, field, body[field])
    db.commit()
    return _serialize(e)


@router.delete("/{entry_id}")
def delete_vocab(entry_id: int, db: Session = Depends(get_db)):
    e = db.query(VocabEntry).filter(VocabEntry.id == entry_id).first()
    if not e:
        raise HTTPException(404, "Not found")
    db.delete(e)
    db.commit()
    return {"ok": True}


def _serialize(e: VocabEntry) -> dict:
    return {
        "id": e.id,
        "source_text": e.source_text,
        "translated_text": e.translated_text,
        "source_lang": e.source_lang,
        "target_lang": e.target_lang,
        "context_sentence": e.context_sentence,
        "example_sentence": e.example_sentence,
        "notes": e.notes,
        "textbook_id": e.textbook_id,
        "textbook_chapter": e.textbook_chapter,
        "lesson_id": e.lesson_id,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "srs_interval": e.srs_interval,
        "srs_ease": e.srs_ease,
        "srs_due_date": e.srs_due_date.isoformat() if e.srs_due_date else None,
        "srs_reviews": e.srs_reviews,
    }
