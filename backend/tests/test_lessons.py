"""
Lesson CRUD + AI summarise + REGRESSION: detect-metadata route not shadowed.
"""
import json
import pytest
from models import Transcript, Lesson


@pytest.mark.asyncio
async def test_list_lessons_empty(client):
    r = await client.get("/lessons/")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_create_lesson(client, db):
    t = Transcript(title="Trans", raw_text="Hallo", utterances_json="[]")
    db.add(t); db.commit(); db.refresh(t)
    r = await client.post("/lessons/", json={"title": "Lektion 3", "date": "2026-04-26",
                                              "topics": "Greetings", "transcript_id": t.id})
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "Lektion 3"
    assert data["summary"]["generated_at"] is None


@pytest.mark.asyncio
async def test_get_lesson_not_found(client):
    assert (await client.get("/lessons/99999")).status_code == 404


@pytest.mark.asyncio
async def test_delete_lesson(client, db):
    lesson = Lesson(title="Temp", topics="x")
    db.add(lesson); db.commit(); db.refresh(lesson)
    lid = lesson.id
    assert (await client.delete(f"/lessons/{lid}")).status_code == 200
    assert (await client.get(f"/lessons/{lid}")).status_code == 404


@pytest.mark.asyncio
async def test_patch_lesson(client, db):
    lesson = Lesson(title="Old", topics="old")
    db.add(lesson); db.commit(); db.refresh(lesson)
    r = await client.patch(f"/lessons/{lesson.id}", json={"title": "New Title"})
    assert r.status_code == 200
    assert r.json()["title"] == "New Title"


@pytest.mark.asyncio
async def test_summarise_without_transcript_returns_400(client, db):
    lesson = Lesson(title="No Trans", topics="x")
    db.add(lesson); db.commit(); db.refresh(lesson)
    r = await client.post(f"/lessons/{lesson.id}/summarise")
    assert r.status_code == 400
    assert "transcript" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_summarise_empty_transcript_returns_400(client, db):
    t = Transcript(title="Empty", raw_text="", utterances_json="[]")
    db.add(t); db.commit(); db.refresh(t)
    lesson = Lesson(title="L", topics="x", transcript_id=t.id)
    db.add(lesson); db.commit(); db.refresh(lesson)
    r = await client.post(f"/lessons/{lesson.id}/summarise")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_summarise_stores_result(client, db, mocker):
    mocker.patch("services.gemini_service._generate", return_value=json.dumps({
        "went_well": ["Good pronunciation"],
        "struggles": ["Article genders"],
        "new_vocab": [{"word": "Bahnhof", "meaning": "train station"}],
        "grammar": [{"point": "Dative", "note": "after 'mit'"}],
        "homework": {"text": "Do Arbeitsbuch p.12", "verbatim_quote": "Machen Sie bitte Seite 12"},
        "next_steps": ["Review Lektion 4"],
    }))
    t = Transcript(title="T", raw_text="Ich fahre zum Bahnhof.", utterances_json="[]")
    db.add(t); db.commit(); db.refresh(t)
    lesson = Lesson(title="L", topics="travel", transcript_id=t.id)
    db.add(lesson); db.commit(); db.refresh(lesson)
    r = await client.post(f"/lessons/{lesson.id}/summarise")
    assert r.status_code == 200
    s = r.json()["summary"]
    assert s["generated_at"] is not None
    assert "Good pronunciation" in s["went_well"]


# ── REGRESSION: detect-metadata must NOT be shadowed by /{lesson_id} ─────────

@pytest.mark.asyncio
async def test_detect_metadata_not_shadowed(client, db, mocker):
    """
    Before the fix, /lessons/detect-metadata/{id} was matched by /{lesson_id}
    which tried to parse 'detect-metadata' as an integer and returned 400.
    This test must return 200 after the route order fix.
    """
    mocker.patch("services.gemini_service._generate", return_value=json.dumps({
        "title": "Lektion 5: Travel",
        "topics": "Transport",
        "textbook_name": "Menschen B1",
        "page_start": 55,
        "page_end": 57,
    }))
    t = Transcript(title="T", raw_text="Wir lernen aus Menschen B1 Seite 55.", utterances_json="[]")
    db.add(t); db.commit(); db.refresh(t)
    r = await client.get(f"/lessons/detect-metadata/{t.id}")
    assert r.status_code != 400, (
        "detect-metadata route is still shadowed by /{lesson_id}. "
        "The route must be registered BEFORE the /{lesson_id} GET route."
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Lektion 5: Travel"
    # Page info is now returned inside references[], not as a top-level key
    # The mock returns no references so we just verify the route resolved correctly


@pytest.mark.asyncio
async def test_detect_metadata_transcript_not_found(client):
    r = await client.get("/lessons/detect-metadata/99999")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_detect_metadata_empty_transcript_returns_400(client, db):
    t = Transcript(title="Empty", raw_text="", utterances_json="[]")
    db.add(t); db.commit(); db.refresh(t)
    r = await client.get(f"/lessons/detect-metadata/{t.id}")
    assert r.status_code == 400
