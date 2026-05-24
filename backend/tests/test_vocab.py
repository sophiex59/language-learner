"""Vocab translation and CRUD tests. Gemini is mocked — no API calls."""
import json
import pytest
from models import VocabEntry


@pytest.mark.asyncio
async def test_translate_returns_result(client, mocker):
    mocker.patch("services.gemini_service._generate", return_value=json.dumps({
        "translation": "Hello", "notes": "Common greeting", "example": "Hallo zusammen!"
    }))
    r = await client.post("/vocab/translate", json={"text": "Hallo", "source_lang": "de", "target_lang": "en", "save": False})
    assert r.status_code == 200
    assert r.json()["translation"] == "Hello"


@pytest.mark.asyncio
async def test_translate_requires_text(client):
    r = await client.post("/vocab/translate", json={"text": "", "source_lang": "de", "target_lang": "en"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_translate_save_persists_to_db(client, db, mocker):
    mocker.patch("services.gemini_service._generate", return_value=json.dumps({
        "translation": "Thank you", "notes": "Polite", "example": "Danke schoen!"
    }))
    r = await client.post("/vocab/translate", json={"text": "Danke", "source_lang": "de", "target_lang": "en", "save": True})
    assert r.status_code == 200
    vid = r.json().get("vocab_id")
    assert vid is not None
    entry = db.query(VocabEntry).filter(VocabEntry.id == vid).first()
    assert entry is not None
    assert entry.source_text == "Danke"


@pytest.mark.asyncio
async def test_translate_no_save_doesnt_persist(client, db, mocker):
    mocker.patch("services.gemini_service._generate", return_value=json.dumps({"translation": "Dog", "notes": "", "example": ""}))
    before = db.query(VocabEntry).count()
    await client.post("/vocab/translate", json={"text": "Hund", "source_lang": "de", "target_lang": "en", "save": False})
    assert db.query(VocabEntry).count() == before


@pytest.mark.asyncio
async def test_list_vocab_empty(client):
    r = await client.get("/vocab/")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_add_and_list_vocab(client):
    r = await client.post("/vocab/", json={"source_text": "Strasse", "translated_text": "Street", "source_lang": "de", "target_lang": "en"})
    assert r.status_code == 200
    vid = r.json()["id"]
    ids = [e["id"] for e in (await client.get("/vocab/")).json()]
    assert vid in ids


@pytest.mark.asyncio
async def test_delete_vocab(client, db):
    entry = VocabEntry(source_text="Alt", translated_text="Old", source_lang="de", target_lang="en")
    db.add(entry); db.commit(); db.refresh(entry)
    assert (await client.delete(f"/vocab/{entry.id}")).status_code == 200
    ids = [e["id"] for e in (await client.get("/vocab/")).json()]
    assert entry.id not in ids


@pytest.mark.asyncio
async def test_delete_vocab_not_found(client):
    assert (await client.delete("/vocab/99999")).status_code == 404
