"""Health endpoint tests."""
import pytest


@pytest.mark.asyncio
async def test_health_returns_ok(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_unknown_path_returns_frontend(client):
    """Catch-all route should serve index.html (200), not 404."""
    r = await client.get("/some-unknown-page")
    assert r.status_code == 200
