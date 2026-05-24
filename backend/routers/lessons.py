import datetime
import json
import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, SessionLocal
from models import Lesson, Transcript, Textbook, TextbookPage, VocabEntry
from services.gemini_service import generate_lesson_summary, detect_lesson_metadata
from services.pdf_service import find_pages_by_chapter

router = APIRouter(prefix="/lessons", tags=["lessons"])


@router.post("/")
def create_lesson(body: dict, db: Session = Depends(get_db)):
    date = None
    if body.get("date"):
        try:
            date = datetime.date.fromisoformat(body["date"])
        except ValueError:
            pass

    lesson = Lesson(
        title=body.get("title", ""),
        date=date,
        topics=body.get("topics", ""),
        source=body.get("source", "recorded"),
        manual_notes=body.get("manual_notes"),
        transcript_id=body.get("transcript_id"),
        textbook_id=body.get("textbook_id"),
        textbook_page_start=body.get("textbook_page_start"),
        textbook_page_end=body.get("textbook_page_end"),
        references_json=json.dumps(body.get("references", []))
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return _serialize(lesson)


@router.post("/manual")
async def create_manual_lesson(body: dict, db: Session = Depends(get_db)):
    """Create a lesson from a user's free-text notes and immediately generate an AI summary."""
    notes = body.get("manual_notes", "").strip()
    if not notes:
        raise HTTPException(400, "manual_notes is required")

    date = None
    if body.get("date"):
        try:
            date = datetime.date.fromisoformat(body["date"])
        except ValueError:
            pass

    lesson = Lesson(
        title=body.get("title", "Manual Lesson"),
        date=date,
        topics=body.get("topics", ""),
        source="manual",
        manual_notes=notes,
        references_json=json.dumps([])
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)

    # Immediately summarise from the notes
    result = await generate_lesson_summary(notes, lesson.topics or "")
    lesson.summary_went_well = json.dumps(result.get("went_well", []))
    lesson.summary_struggles = json.dumps(result.get("struggles", []))
    lesson.summary_new_vocab = json.dumps(result.get("new_vocab", []))
    lesson.summary_grammar = json.dumps(result.get("grammar", []))
    hw = result.get("homework", {"text": "None", "verbatim_quote": ""})
    if isinstance(hw, str):
        hw = {"text": hw, "verbatim_quote": ""}
    lesson.summary_homework = json.dumps(hw)
    lesson.summary_next_steps = json.dumps(result.get("next_steps", []))
    lesson.summary_generated_at = datetime.datetime.utcnow()
    db.commit()
    return _serialize(lesson)


@router.get("/")
def list_lessons(db: Session = Depends(get_db)):
    lessons = db.query(Lesson).order_by(Lesson.created_at.desc()).all()
    return [_serialize(l) for l in lessons]


@router.get("/{lesson_id}")
def get_lesson(lesson_id: str, db: Session = Depends(get_db)):
    if not lesson_id.isdigit():
        raise HTTPException(400, "Invalid lesson ID")
    l = db.query(Lesson).filter(Lesson.id == int(lesson_id)).first()
    if not l:
        raise HTTPException(404, "Lesson not found")
    return _serialize(l)


@router.patch("/{lesson_id}")
def update_lesson(lesson_id: int, body: dict, db: Session = Depends(get_db)):
    l = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not l:
        raise HTTPException(404, "Not found")
    
    fields = ["title", "topics", "textbook_id", "textbook_page_start", "textbook_page_end", "transcript_id"]
    for f in fields:
        if f in body:
            setattr(l, f, body[f])
    
    if "references" in body:
        l.references_json = json.dumps(body["references"])
        
    if "date" in body and body["date"]:
        l.date = datetime.date.fromisoformat(body["date"])
    
    db.commit()
    return _serialize(l)


@router.delete("/{lesson_id}")
def delete_lesson(lesson_id: int, db: Session = Depends(get_db)):
    l = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not l:
        raise HTTPException(404, "Not found")
    db.delete(l)
    db.commit()
    return {"ok": True}


@router.post("/{lesson_id}/summarise")
async def summarise_lesson(lesson_id: int, db: Session = Depends(get_db)):
    """Run AI lesson recap via Gemini, including context from ALL linked textbooks."""
    l = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not l:
        raise HTTPException(404, "Lesson not found")

    transcript_text = ""
    if l.transcript_id:
        t = db.query(Transcript).filter(Transcript.id == l.transcript_id).first()
        if t:
            transcript_text = t.raw_text or ""
    
    # Fallback to manual notes for manual lessons
    if not transcript_text and l.manual_notes:
        transcript_text = l.manual_notes

    if not transcript_text:
        raise HTTPException(400, "No content (transcript or notes) available for this lesson")

    # Fetch textbook page content from ALL references
    textbook_context = ""
    references = []
    if l.references_json:
        try:
            references = json.loads(l.references_json or "[]")
        except: pass
    
    # Legacy fallback
    if not references and l.textbook_id:
        references = [{"textbook_id": l.textbook_id, "page_start": l.textbook_page_start, "page_end": l.textbook_page_end}]

    for ref in references:
        tid = ref.get("textbook_id")
        ps = ref.get("page_start")
        pe = ref.get("page_end") or ps
        if tid and ps:
            tb = db.query(Textbook).filter(Textbook.id == tid).first()
            tb_name = "Book"
            if tb:
                tb_name = tb.nickname or tb.title
            
            page_range = range(ps, pe + 1)
            pages = db.query(TextbookPage).filter(
                TextbookPage.textbook_id == tid,
                TextbookPage.page_number.in_(list(page_range))
            ).all()
            if pages:
                textbook_context += f"\n\n--- CONTENT FROM {tb_name} ---\n"
                for p in pages:
                    textbook_context += f"Page {p.page_number}:\n{p.text_content[:2500]}\n"

    # Combine transcript with textbook context for the AI
    full_input = transcript_text + textbook_context
    result = await generate_lesson_summary(full_input, l.topics or "")

    l.summary_went_well = json.dumps(result.get("went_well", []))
    l.summary_struggles = json.dumps(result.get("struggles", []))
    l.summary_new_vocab = json.dumps(result.get("new_vocab", []))
    l.summary_grammar = json.dumps(result.get("grammar", []))
    hw = result.get("homework", {"text": "None", "verbatim_quote": ""})
    if isinstance(hw, str):
        hw = {"text": hw, "verbatim_quote": ""}
    l.summary_homework = json.dumps(hw)
    l.summary_next_steps = json.dumps(result.get("next_steps", []))
    l.summary_generated_at = datetime.datetime.utcnow()
    db.commit()

    # Auto-import new vocab into the flashcard system
    import datetime as dt
    today = dt.date.today()
    for item in result.get("new_vocab", []):
        if not isinstance(item, dict): continue
        word = item.get("word", "").strip()
        meaning = item.get("meaning", "").strip()
        if not word: continue
        # Skip if this word is already in the deck for this lesson
        existing = db.query(VocabEntry).filter(
            VocabEntry.lesson_id == l.id,
            VocabEntry.source_text == word
        ).first()
        if not existing:
            db.add(VocabEntry(
                source_text=word,
                translated_text=meaning,
                source_lang="de",
                target_lang="en",
                lesson_id=l.id,
                srs_interval=1,
                srs_ease=2.5,
                srs_due_date=today,
                srs_reviews=0,
            ))
    db.commit()
    return _serialize(l)


@router.get("/detect-metadata/{transcript_id}")
async def detect_metadata(transcript_id: int, db: Session = Depends(get_db)):
    """Use AI to detect multiple lesson references from a transcript."""
    t = db.query(Transcript).filter(Transcript.id == transcript_id).first()
    if not t:
        raise HTTPException(404, "Transcript not found")

    if not t.raw_text or not t.raw_text.strip():
        raise HTTPException(400, "Transcript has no text content yet")

    # Get all textbooks for the AI to choose from
    textbooks = db.query(Textbook).all()
    tb_list = [{"id": tb.id, "title": tb.title, "nickname": tb.nickname} for tb in textbooks]

    metadata = await detect_lesson_metadata(t.raw_text or "", available_textbooks=tb_list)
    
    # Resolve logical chapters for each reference
    resolved_refs = []
    for ref in metadata.get("references", []):
        tid = ref.get("textbook_id")
        chapter = ref.get("chapter")
        ps = ref.get("page_start")
        pe = ref.get("page_end")
        
        if tid and chapter and not ps:
            rps, rpe = find_pages_by_chapter(db, tid, chapter)
            if rps:
                ps, pe = rps, rpe
        
        if tid and ps:
            tb = db.query(Textbook).filter(Textbook.id == tid).first()
            resolved_refs.append({
                "textbook_id": tid,
                "textbook_name": tb.nickname or tb.title if tb else f"Book {tid}",
                "chapter": chapter,
                "page_start": ps,
                "page_end": pe
            })

    return {
        "title": metadata.get("title", ""),
        "topics": metadata.get("topics", ""),
        "references": resolved_refs,
        "is_truncated": metadata.get("is_truncated_context", False)
    }


def _serialize(l: Lesson) -> dict:
    def _json_field(val):
        if val is None: return []
        try: return json.loads(val)
        except: return val

    # Resolve references for frontend
    refs = _json_field(l.references_json)
    if not refs and l.textbook_id:
        refs = [{
            "textbook_id": l.textbook_id,
            "page_start": l.textbook_page_start,
            "page_end": l.textbook_page_end
        }]
    
    # Add names to references
    for r in refs:
        if "textbook_id" in r and "textbook_name" not in r:
            tb = SessionLocal().query(Textbook).filter(Textbook.id == r["textbook_id"]).first()
            r["textbook_name"] = tb.nickname or tb.title if tb else f"Book {r['textbook_id']}"

    def _parse_homework(val):
        """Return {text, verbatim_quote} regardless of whether stored as string or JSON object."""
        if val is None:
            return {"text": "None", "verbatim_quote": ""}
        try:
            parsed = json.loads(val)
            if isinstance(parsed, dict):
                return {"text": parsed.get("text", "None"), "verbatim_quote": parsed.get("verbatim_quote", "")}
            # Legacy: stored as plain string
            return {"text": str(parsed), "verbatim_quote": ""}
        except Exception:
            return {"text": str(val), "verbatim_quote": ""}

    return {
        "id": l.id,
        "title": l.title,
        "date": l.date.isoformat() if l.date else None,
        "topics": l.topics,
        "source": l.source or "recorded",
        "manual_notes": l.manual_notes,
        "created_at": l.created_at.isoformat(),
        "transcript_id": l.transcript_id,
        "references": refs,
        "summary": {
            "went_well": _json_field(l.summary_went_well),
            "struggles": _json_field(l.summary_struggles),
            "new_vocab": _json_field(l.summary_new_vocab),
            "grammar": _json_field(l.summary_grammar),
            "homework": _parse_homework(l.summary_homework),
            "next_steps": _json_field(l.summary_next_steps),
            "generated_at": l.summary_generated_at.isoformat() if l.summary_generated_at else None,
        },
    }
