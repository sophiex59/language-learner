"""Transcript CRUD + state-machine tests. No external API calls."""
import json
import pytest
from models import Transcript


@pytest.mark.asyncio
async def test_list_transcripts_empty(client):
    r = await client.get("/transcripts/")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_list_transcripts_returns_item(client, db):
    t = Transcript(title="My Lesson", raw_text="Hallo", utterances_json="[]")
    db.add(t); db.commit()
    r = await client.get("/transcripts/")
    assert r.status_code == 200
    assert any(i["title"] == "My Lesson" for i in r.json())


@pytest.mark.asyncio
async def test_get_transcript_not_found(client):
    r = await client.get("/transcripts/99999")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_transcript_returns_utterances(client, db):
    utterances = [{"speaker": "A", "language": "de", "text": "Hallo", "start": 0.0, "end": 1.0}]
    t = Transcript(title="Test", raw_text="Hallo", utterances_json=json.dumps(utterances), mode="lesson")
    db.add(t); db.commit(); db.refresh(t)
    r = await client.get(f"/transcripts/{t.id}")
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "Test"
    assert len(data["utterances"]) == 1
    assert data["utterances"][0]["text"] == "Hallo"


@pytest.mark.asyncio
async def test_delete_transcript(client, db):
    t = Transcript(title="ToDelete", raw_text="x", utterances_json="[]")
    db.add(t); db.commit(); db.refresh(t)
    tid = t.id
    r = await client.delete(f"/transcripts/{tid}")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert (await client.get(f"/transcripts/{tid}")).status_code == 404


@pytest.mark.asyncio
async def test_delete_transcript_not_found(client):
    assert (await client.delete("/transcripts/99999")).status_code == 404


@pytest.mark.asyncio
async def test_processing_state_returns_200(client, db):
    """Transcript with empty text (still processing) should return 200."""
    t = Transcript(title="InFlight", raw_text="", utterances_json="[]")
    db.add(t); db.commit(); db.refresh(t)
    r = await client.get(f"/transcripts/{t.id}")
    assert r.status_code == 200
    assert r.json()["raw_text"] == ""


@pytest.mark.asyncio
async def test_error_state_returns_200(client, db):
    """Error transcript should return 200 — UI handles the display."""
    t = Transcript(title="Failed", raw_text="ERROR: Gladia timed out", utterances_json="[]")
    db.add(t); db.commit(); db.refresh(t)
    r = await client.get(f"/transcripts/{t.id}")
    assert r.status_code == 200
    assert r.json()["raw_text"].startswith("ERROR:")


@pytest.mark.asyncio
async def test_has_text_flag(client, db):
    """has_text must be False for error/empty, True for real text."""
    db.add_all([
        Transcript(title="OK",    raw_text="Hallo",        utterances_json="[]"),
        Transcript(title="Empty", raw_text="",             utterances_json="[]"),
        Transcript(title="Error", raw_text="ERROR: boom",  utterances_json="[]"),
    ])
    db.commit()
    items = {i["title"]: i["has_text"] for i in (await client.get("/transcripts/")).json()}
    assert items["OK"]    is True
    assert items["Empty"] is False
    assert items["Error"] is False
