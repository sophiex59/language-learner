import os
import httpx
import asyncio
from dotenv import load_dotenv

load_dotenv()

GLADIA_API_KEY = os.getenv("GLADIA_API_KEY", "")
GLADIA_BASE = "https://api.gladia.io/v2"


async def transcribe_multilingual(audio_path: str, langs: list[str] = None) -> dict:
    """Transcribe with Gladia Solaria-1; code-switching for multilingual lessons."""
    if langs is None:
        langs = ["de", "en"]

    upload_headers = {"x-gladia-key": GLADIA_API_KEY}
    json_headers = {**upload_headers, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=120.0) as client:
        # Upload audio file
        with open(audio_path, "rb") as f:
            up = await client.post(f"{GLADIA_BASE}/upload", headers=upload_headers, files={"audio": f})
        up.raise_for_status()
        audio_url = up.json()["audio_url"]

        # Create transcription job
        job = await client.post(
            f"{GLADIA_BASE}/pre-recorded",
            headers=json_headers,
            json={
                "audio_url": audio_url,
                "model": "solaria-1",
                "language_config": {"languages": langs, "code_switching": True},
                "diarization": True,
            },
        )
        job.raise_for_status()
        job_data = job.json()
        job_id = job_data["id"]
        result_url = job_data.get("result_url", f"{GLADIA_BASE}/pre-recorded/{job_id}")

        # Poll for result (up to 4 min)
        for _ in range(120):
            await asyncio.sleep(2)
            r = await client.get(result_url, headers=json_headers)
            r.raise_for_status()
            data = r.json()
            if data.get("status") == "done":
                return _parse_result(data)
            if data.get("status") == "error":
                raise RuntimeError(f"Gladia error: {data}")

    raise TimeoutError("Gladia transcription timed out after 4 minutes")


def _parse_result(data: dict) -> dict:
    transcription = data.get("result", {}).get("transcription", {})
    utterances = [
        {
            "speaker": u.get("speaker", "Speaker 1"),
            "language": u.get("language", ""),
            "text": u.get("text", "").strip(),
            "start": u.get("start", 0),
            "end": u.get("end", 0),
        }
        for u in transcription.get("utterances", [])
    ]
    full_text = transcription.get("full_transcript") or " ".join(u["text"] for u in utterances)
    duration = data.get("result", {}).get("metadata", {}).get("audio_duration")
    return {"utterances": utterances, "full_text": full_text, "duration_seconds": duration}
