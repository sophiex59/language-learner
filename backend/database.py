from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")

for d in ["audio", "textbooks", "textbook_audio", "thumbnails"]:
    os.makedirs(os.path.join(DATA_DIR, d), exist_ok=True)

DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIR, 'db.sqlite3')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
