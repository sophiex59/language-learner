"""AI Teacher stats, notes, and progress report tests."""
import pytest
from models import Lesson, VocabEntry, AITeacherNote


@pytest.mark.asyncio
async def test_stats_returns_counts(client):
    r = await client.get("/ai-teacher/stats")
    assert r.status_code == 200
    for key in ("lesson_count", "vocab_count", "transcript_count"):
        assert key in r.json()


@pytest.mark.asyncio
async def test_stats_reflects_db(client, db):
    db.add(Lesson(title="L1", topics="x"))
    db.add(Lesson(title="L2", topics="y"))
    db.add(VocabEntry(source_text="Hund", translated_text="Dog", source_lang="de", target_lang="en"))
    db.commit()
    data = (await client.get("/ai-teacher/stats")).json()
    assert data["lesson_count"] >= 2
    assert data["vocab_count"] >= 1


@pytest.mark.asyncio
async def test_create_and_list_note(client):
    r = await client.post("/ai-teacher/notes", json={"category": "goals", "content": "10 words/week", "ai_generated": False})
    assert r.status_code == 200
    nid = r.json()["id"]
    ids = [n["id"] for n in (await client.get("/ai-teacher/notes")).json()]
    assert nid in ids


@pytest.mark.asyncio
async def test_delete_note(client, db):
    note = AITeacherNote(category="general", content="Bye", ai_generated=False)
    db.add(note); db.commit(); db.refresh(note)
    assert (await client.delete(f"/ai-teacher/notes/{note.id}")).status_code == 200
    ids = [n["id"] for n in (await client.get("/ai-teacher/notes")).json()]
    assert note.id not in ids


@pytest.mark.asyncio
async def test_delete_note_not_found(client):
    assert (await client.delete("/ai-teacher/notes/99999")).status_code == 404


@pytest.mark.asyncio
async def test_progress_report_calls_gemini(client, mocker):
    mock = mocker.patch("services.gemini_service._generate", return_value="## Progress\nGoing well!")
    r = await client.get("/ai-teacher/report")
    assert r.status_code == 200
    assert "Progress" in r.json()["report"]
    assert mock.called
