import asyncio
import sys
import os

# Add parent directory to path to import modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models import Lesson
from routers.lessons import summarise_lesson

async def main():
    db = SessionLocal()
    lessons = db.query(Lesson).all()
    print(f"🔄 Found {len(lessons)} lessons. Starting regeneration...")
    
    for i, lesson in enumerate(lessons, 1):
        print(f"[{i}/{len(lessons)}] Regenerating summary for: {lesson.title or 'Untitled'} (ID: {lesson.id})")
        try:
            # We call the logic from the router directly
            # This will update l.summary_*, commit, and auto-import vocab
            await summarise_lesson(lesson.id, db)
            print(f"   ✅ Done.")
        except Exception as e:
            print(f"   ❌ Failed: {str(e)}")
            
    db.close()
    print("\n✨ All summaries regenerated!")

if __name__ == "__main__":
    asyncio.run(main())
