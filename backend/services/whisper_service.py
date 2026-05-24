import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))


async def transcribe_english(audio_path: str) -> dict:
    """Transcribe English-only audio via OpenAI Whisper (cheaper for mono-language)."""
    with open(audio_path, "rb") as f:
        resp = await _client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )

    segments = resp.segments or []
    utterances = [
        {
            "speaker": "Speaker 1",
            "language": "en",
            "text": seg["text"].strip(),
            "start": seg["start"],
            "end": seg["end"],
        }
        for seg in segments
    ]
    return {
        "utterances": utterances,
        "full_text": resp.text,
        "duration_seconds": getattr(resp, "duration", None),
    }
