"""
bulk_import.py — Run the full pipeline for every audio file in a source folder.

  SOURCE folder  →  script uploads files  →  server saves copies to data/audio/
  (data/audio_inbox by default)                (server's storage, don't read from here)

Usage (from the backend/ directory, with the server running):
    python scripts/bulk_import.py [--source-dir data/audio_inbox] [--mode lesson] [--api http://localhost:8000]

Already-processed files are skipped automatically on re-runs.

Steps per file (sequential to respect API rate limits):
  1. Upload audio       → POST /transcripts/
  2. Poll for result    → GET /transcripts/{id}  (until raw_text populated)
  3. Create lesson      → POST /lessons/
  4. Detect metadata    → GET /lessons/detect-metadata/{transcript_id}
  5. Generate summary   → POST /lessons/{lesson_id}/summarise
"""

import argparse
import asyncio
import datetime
import sys
import time
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

async def upload_and_transcribe(client: httpx.AsyncClient, api: str, file_path: Path, mode: str) -> dict:
    """Upload audio; server saves a copy to data/audio/ and returns a transcript record."""
    with open(file_path, "rb") as f:
        resp = await client.post(
            f"{api}/transcripts/",
            files={"file": (file_path.name, f, "audio/m4a")},
            data={
                "mode": mode,
                "title": file_path.stem,   # full stem is unique per file
                "langs": "de,en",
            },
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


async def poll_transcript(client: httpx.AsyncClient, api: str, transcript_id: int,
                          max_wait_s: int = 600, interval_s: int = 8) -> dict:
    """Poll until raw_text is populated, up to max_wait_s seconds."""
    deadline = time.time() + max_wait_s
    while time.time() < deadline:
        await asyncio.sleep(interval_s)
        resp = await client.get(f"{api}/transcripts/{transcript_id}", timeout=30)
        resp.raise_for_status()
        t = resp.json()
        if t.get("raw_text"):
            return t
    raise TimeoutError(f"Transcript {transcript_id} not ready after {max_wait_s}s")


async def create_lesson(client: httpx.AsyncClient, api: str, title: str, transcript_id: int) -> dict:
    resp = await client.post(f"{api}/lessons/", json={
        "title": title,
        "date": datetime.date.today().isoformat(),
        "transcript_id": transcript_id,
        "source": "recorded",
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()


async def detect_metadata(client: httpx.AsyncClient, api: str, transcript_id: int) -> dict:
    resp = await client.get(f"{api}/lessons/detect-metadata/{transcript_id}", timeout=120)
    resp.raise_for_status()
    return resp.json()


async def patch_lesson(client: httpx.AsyncClient, api: str, lesson_id: int, patch: dict):
    resp = await client.patch(f"{api}/lessons/{lesson_id}", json=patch, timeout=30)
    resp.raise_for_status()


async def summarise_lesson(client: httpx.AsyncClient, api: str, lesson_id: int) -> dict:
    resp = await client.post(f"{api}/lessons/{lesson_id}/summarise", timeout=300)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Per-file pipeline
# ---------------------------------------------------------------------------

async def process_file(client: httpx.AsyncClient, api: str, file_path: Path, mode: str, idx: int, total: int):
    tag = f"[{file_path.stem[:28]}]"

    def log(msg: str):
        print(f"  {tag} {msg}", flush=True)

    log(f"📤 Uploading ({idx}/{total})…")

    record = await upload_and_transcribe(client, api, file_path, mode)
    transcript_id = record["id"]
    log(f"→ transcript ID: {transcript_id}")

    log("⏳ Waiting for transcription…")
    transcript = await poll_transcript(client, api, transcript_id)

    if transcript["raw_text"].startswith("ERROR:"):
        log(f"❌ Transcription failed: {transcript['raw_text']}")
        return False

    log(f"✅ Transcription done ({len(transcript['raw_text'])} chars)")

    log("🏫 Creating lesson…")
    lesson = await create_lesson(client, api, transcript["title"], transcript_id)
    lesson_id = lesson["id"]
    log(f"→ lesson ID: {lesson_id}")

    log("🔍 Detecting metadata…")
    try:
        meta = await detect_metadata(client, api, transcript_id)
        patch = {}
        if meta.get("title"):      patch["title"] = meta["title"]
        if meta.get("topics"):     patch["topics"] = meta["topics"]
        if meta.get("references"): patch["references"] = meta["references"]
        if patch:
            await patch_lesson(client, api, lesson_id, patch)
            log(f"→ patched: {list(patch.keys())}")
        else:
            log("→ no metadata found")
    except Exception as e:
        log(f"⚠️  Metadata failed (continuing): {e!r}")

    log("🤖 Generating AI summary…")
    lesson_final = await summarise_lesson(client, api, lesson_id)
    vocab_count = len(lesson_final.get("summary", {}).get("new_vocab", []))
    log(f"✅ Done — {vocab_count} vocab items imported")

    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(description="Bulk import audio files into the language learner app.")
    parser.add_argument("--source-dir", default=None,
                        help="Folder containing source audio files (default: data/audio_inbox)")
    parser.add_argument("--mode", default="lesson", choices=["lesson", "english"],
                        help="Transcription mode (default: lesson)")
    parser.add_argument("--api", default="http://localhost:8000",
                        help="Base URL of the running API server")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    source_dir = Path(args.source_dir) if args.source_dir else script_dir.parent / "data" / "audio_inbox"

    if not source_dir.exists():
        print(f"❌ Source directory not found: {source_dir}")
        print(f"   Create it and drop your audio files in there, then re-run.")
        sys.exit(1)

    files = sorted(f for f in source_dir.iterdir() if f.is_file() and not f.name.startswith("."))
    if not files:
        print(f"❌ No audio files found in {source_dir}")
        sys.exit(1)

    print(f"\n🔎 Source:    {source_dir}")
    print(f"🌐 API:       {args.api}")
    print(f"🎚️  Mode:      {args.mode}")
    print(f"📂 Files ({len(files)}):")
    for f in files:
        print(f"   • {f.name}")

    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{args.api}/health", timeout=5)
            r.raise_for_status()
        except Exception as e:
            print(f"\n❌ Cannot reach API at {args.api}: {e!r}")
            print("   Make sure `uvicorn main:app --reload` is running in backend/")
            sys.exit(1)

        # Fetch existing transcript titles so we can skip already-processed files.
        # Only count transcripts that actually have content (not errored/empty ones).
        existing_titles: set[str] = set()
        try:
            resp = await client.get(f"{args.api}/transcripts/", timeout=10)
            existing_titles = {t["title"] for t in resp.json() if t.get("has_text")}
        except Exception:
            pass  # if it fails, we just won't skip anything

        print(f"\n── Processing {len(files)} files sequentially ──────────────────\n")

        ok, failed, skipped = 0, [], []
        for i, fp in enumerate(files, 1):
            title = fp.stem
            if title in existing_titles:
                print(f"  [{fp.stem[:28]}] ⏭️  Already processed, skipping.", flush=True)
                skipped.append(fp.name)
                continue
            try:
                success = await process_file(client, args.api, fp, args.mode, i, len(files))
                if success:
                    ok += 1
                    existing_titles.add(title)  # prevent re-processing within same run
                else:
                    failed.append(fp.name)
            except Exception as e:
                print(f"  ❌ {fp.name}: {e!r}", flush=True)
                failed.append(fp.name)

    print(f"\n{'='*60}")
    total_attempted = len(files) - len(skipped)
    print(f"✨ Done!  {ok}/{total_attempted} processed  |  {len(skipped)} skipped (already done)")
    if failed:
        print(f"❌ Failed: {', '.join(failed)}")
    print("\nOpen the app → Lessons tab to review everything.")


if __name__ == "__main__":
    asyncio.run(main())
