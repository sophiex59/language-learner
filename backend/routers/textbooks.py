import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from database import get_db, DATA_DIR
from models import Textbook, TextbookPage, TextbookAudio
from services.pdf_service import index_textbook, search_textbook, scan_textbook_directory

router = APIRouter(prefix="/textbooks", tags=["textbooks"])
TEXTBOOKS_DIR = os.path.join(DATA_DIR, "textbooks")
AUDIO_DIR = os.path.join(DATA_DIR, "textbook_audio")
THUMBNAILS_DIR = os.path.join(DATA_DIR, "thumbnails")


@router.post("/scan")
def scan_for_new_textbooks(db: Session = Depends(get_db)):
    """Auto-detect and index new PDFs dropped into the textbooks directory."""
    added = scan_textbook_directory(db)
    return {"added": added, "count": len(added)}


@router.get("/")
def list_textbooks(db: Session = Depends(get_db)):
    tbs = db.query(Textbook).order_by(Textbook.title).all()
    return [_serialize(t) for t in tbs]


@router.get("/{tb_id}")
def get_textbook(tb_id: int, db: Session = Depends(get_db)):
    t = db.query(Textbook).filter(Textbook.id == tb_id).first()
    if not t:
        raise HTTPException(404, "Textbook not found")
    return _serialize(t)


@router.patch("/{tb_id}")
def update_textbook(tb_id: int, body: dict, db: Session = Depends(get_db)):
    t = db.query(Textbook).filter(Textbook.id == tb_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    for field in ["title", "language", "nickname"]:
        if field in body:
            setattr(t, field, body[field])
    db.commit()
    return _serialize(t)


@router.post("/{tb_id}/reindex")
def reindex_textbook(tb_id: int, db: Session = Depends(get_db)):
    t = db.query(Textbook).filter(Textbook.id == tb_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    t.indexed = False
    db.commit()
    index_textbook(db, t)
    return {"ok": True, "pages": t.page_count}


@router.get("/{tb_id}/search")
def search_in_textbook(tb_id: int, q: str, db: Session = Depends(get_db)):
    if not q:
        raise HTTPException(400, "q param required")
    results = search_textbook(db, tb_id, q)
    return {"results": results, "count": len(results)}


@router.get("/{tb_id}/pages/{page_num}/thumbnail")
def get_page_thumbnail(tb_id: int, page_num: int, db: Session = Depends(get_db)):
    page = (
        db.query(TextbookPage)
        .filter(TextbookPage.textbook_id == tb_id, TextbookPage.page_number == page_num)
        .first()
    )
    if not page or not page.thumbnail_filename:
        raise HTTPException(404, "Page not found")
    path = os.path.join(THUMBNAILS_DIR, page.thumbnail_filename)
    if not os.path.exists(path):
        raise HTTPException(404, "Thumbnail not found on disk")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/{tb_id}/audio")
def list_textbook_audio(tb_id: int, db: Session = Depends(get_db)):
    audio = db.query(TextbookAudio).filter(TextbookAudio.textbook_id == tb_id).all()
    return [_serialize_audio(a) for a in audio]


@router.post("/{tb_id}/audio")
def link_audio_file(tb_id: int, body: dict, db: Session = Depends(get_db)):
    """Associate an audio file (already in textbook_audio/) with a textbook and chapter."""
    t = db.query(Textbook).filter(Textbook.id == tb_id).first()
    if not t:
        raise HTTPException(404, "Textbook not found")
    filename = body.get("filename", "")
    if not os.path.exists(os.path.join(AUDIO_DIR, filename)):
        raise HTTPException(400, f"File '{filename}' not found in textbook_audio/ directory")
    a = TextbookAudio(
        textbook_id=tb_id,
        filename=filename,
        chapter=body.get("chapter"),
        track_label=body.get("track_label"),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _serialize_audio(a)


@router.get("/audio/files")
def list_unlinked_audio_files(db: Session = Depends(get_db)):
    """List all audio files in textbook_audio/ directory."""
    if not os.path.exists(AUDIO_DIR):
        return {"files": []}
    all_files = [f for f in os.listdir(AUDIO_DIR) if not f.startswith(".")]
    linked = {a.filename for a in db.query(TextbookAudio).all()}
    return {
        "all": all_files,
        "unlinked": [f for f in all_files if f not in linked],
        "linked_count": len(linked),
    }


def _serialize(t: Textbook) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "nickname": t.nickname,
        "filename": t.filename,
        "page_count": t.page_count,
        "language": t.language,
        "indexed": t.indexed,
        "created_at": t.created_at.isoformat(),
    }


def _serialize_audio(a: TextbookAudio) -> dict:
    return {
        "id": a.id,
        "textbook_id": a.textbook_id,
        "filename": a.filename,
        "chapter": a.chapter,
        "track_label": a.track_label,
    }
