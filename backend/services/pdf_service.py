import os
import fitz  # PyMuPDF
from PIL import Image
import io
from sqlalchemy.orm import Session
from models import Textbook, TextbookPage
from database import BASE_DIR

DATA_DIR = os.path.join(BASE_DIR, "data")
TEXTBOOKS_DIR = os.path.join(DATA_DIR, "textbooks")
THUMBNAILS_DIR = os.path.join(DATA_DIR, "thumbnails")


def index_textbook(db: Session, textbook: Textbook) -> None:
    """Extract text and generate thumbnails for all pages of a PDF."""
    pdf_path = os.path.join(TEXTBOOKS_DIR, textbook.filename)
    if not os.path.exists(pdf_path):
        return

    doc = fitz.open(pdf_path)
    textbook.page_count = len(doc)

    # Remove existing pages
    db.query(TextbookPage).filter(TextbookPage.textbook_id == textbook.id).delete()

    for i, page in enumerate(doc):
        page_num = i + 1
        text = page.get_text("text")

        # Generate thumbnail
        thumb_filename = f"{textbook.id}_page_{page_num}.jpg"
        thumb_path = os.path.join(THUMBNAILS_DIR, thumb_filename)
        pix = page.get_pixmap(dpi=72)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        img.save(thumb_path, "JPEG", quality=70)

        db_page = TextbookPage(
            textbook_id=textbook.id,
            page_number=page_num,
            text_content=text,
            thumbnail_filename=thumb_filename,
        )
        db.add(db_page)

    textbook.indexed = True
    db.commit()
    doc.close()


def search_textbook(db: Session, textbook_id: int, query: str, limit: int = 10) -> list[dict]:
    """Full-text search within a textbook's indexed pages."""
    pages = (
        db.query(TextbookPage)
        .filter(TextbookPage.textbook_id == textbook_id)
        .all()
    )
    results = []
    query_lower = query.lower()
    for page in pages:
        if page.text_content and query_lower in page.text_content.lower():
            idx = page.text_content.lower().find(query_lower)
            snippet_start = max(0, idx - 80)
            snippet_end = min(len(page.text_content), idx + 160)
            snippet = "..." + page.text_content[snippet_start:snippet_end].strip() + "..."
            results.append({
                "page_number": page.page_number,
                "snippet": snippet,
                "thumbnail": page.thumbnail_filename,
            })
        if len(results) >= limit:
            break
    return results


def get_page_image_bytes(textbook_id: int, page_number: int, dpi: int = 150) -> bytes:
    """Render a specific page of a PDF as a JPEG image."""
    # Find the textbook filename by id from filesystem convention
    thumbs = [f for f in os.listdir(THUMBNAILS_DIR) if f.startswith(f"{textbook_id}_page_{page_number}.")]
    if thumbs:
        path = os.path.join(THUMBNAILS_DIR, thumbs[0])
        with open(path, "rb") as f:
            return f.read()
    return b""


def find_pages_by_chapter(db: Session, textbook_id: int, chapter_query: str) -> tuple[int, int]:
    """
    Search for a chapter marker (e.g. "Lektion 3") and return a page range.
    Returns (start_page, end_page) or (None, None).
    """
    import re
    # Clean query: "Lektion 3" -> "lektion 3"
    q = chapter_query.lower().strip()
    
    # Fetch all pages for this textbook
    pages = db.query(TextbookPage).filter(TextbookPage.textbook_id == textbook_id).order_by(TextbookPage.page_number).all()
    
    start_page = None
    for p in pages:
        if not p.text_content: continue
        text = p.text_content.lower()
        # Look for the chapter marker at the start of lines or as a header
        if q in text:
            # Simple check: does it look like a header? 
            # We look for the exact phrase "Lektion 3" with some boundary
            if re.search(rf"\b{re.escape(q)}\b", text):
                start_page = p.page_number
                break
    
    if start_page:
        # Assume a chapter is ~8 pages or until the next "Lektion" is found
        end_page = start_page + 8
        # Try to find the next Lektion to be more precise
        # Match the "Lektion" part but look for a different number
        base_match = re.match(r"([a-z]+)\s*(\d+)", q)
        if base_match:
            next_q = f"{base_match.group(1)} {int(base_match.group(2)) + 1}"
            for p in pages[start_page:]: # Look ahead
                if next_q in p.text_content.lower():
                    end_page = p.page_number - 1
                    break
        return start_page, end_page
        
    return None, None


def scan_textbook_directory(db: Session) -> list[str]:
    """Auto-detect new PDFs in the textbooks directory and register them."""
    added = []
    from models import Textbook as TB
    existing = {t.filename for t in db.query(TB).all()}
    for fname in os.listdir(TEXTBOOKS_DIR):
        if fname.endswith(".pdf") and fname not in existing:
            title = fname.replace("_", " ").replace("-", " ").removesuffix(".pdf")
            tb = TB(title=title, filename=fname, indexed=False)
            db.add(tb)
            db.flush()
            index_textbook(db, tb)
            added.append(fname)
    db.commit()
    return added
