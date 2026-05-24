"""
Test configuration.

Uses a temporary SQLite FILE (not :memory:) because SQLite :memory: databases
are connection-scoped — each new connection gets an empty DB, which breaks
FastAPI's per-request session model. A temp file works with all connections
sharing the same data.
"""
import os
import tempfile
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# ── Create temp DB file and set env BEFORE any app imports ───────────────────
_db_fd, _db_path = tempfile.mkstemp(suffix=".sqlite3", prefix="langlearner_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["GEMINI_API_KEY"] = "test-key"
os.environ["GLADIA_API_KEY"] = "test-key"
os.environ["OPENAI_API_KEY"] = "test-key"

# ── Import app AFTER env is set ───────────────────────────────────────────────
from database import Base, engine, get_db, SessionLocal
from main import app

# Ensure all tables exist (main.py does this too but be explicit)
Base.metadata.create_all(bind=engine)


def _override_get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


# ── Session-level cleanup ─────────────────────────────────────────────────────

def pytest_sessionfinish(session, exitstatus):
    """Delete the temp DB file after the whole test session."""
    try:
        os.close(_db_fd)
    except OSError:
        pass
    try:
        os.unlink(_db_path)
    except OSError:
        pass


# ── Per-test row cleanup ──────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_tables():
    """Delete all rows before each test so tests are fully isolated."""
    db = SessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    finally:
        db.close()


@pytest.fixture
def db():
    """Synchronous DB session for seeding data in a test."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@pytest_asyncio.fixture
async def client():
    """Async HTTP client wired directly to the FastAPI app (no network)."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
