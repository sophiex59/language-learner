import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))
FLASH = "gemini-2.5-flash"
PRO = "gemini-2.5-pro"


def _generate(prompt: str, model: str = FLASH) -> str:
    response = _client.models.generate_content(model=model, contents=prompt)
    return response.text.strip()


async def translate(text: str, source_lang: str, target_lang: str, context: str = "") -> dict:
    """Translate text and return structured result with example sentence."""
    lang_names = {"de": "German", "en": "English", "fr": "French", "es": "Spanish", "it": "Italian"}
    src = lang_names.get(source_lang, source_lang)
    tgt = lang_names.get(target_lang, target_lang)

    prompt = f"""You are a language teacher. Translate the following {src} text to {tgt}.
Return ONLY a JSON object with these fields:
- "translation": the {tgt} translation
- "notes": brief linguistic notes (grammar, register, idiom explanation if relevant) — max 2 sentences
- "example": a natural example sentence in {src} using the word/phrase differently if possible

Text to translate: "{text}"
{"Context: " + context if context else ""}

Return valid JSON only."""

    import json
    raw = _generate(prompt)
    try:
        # Strip markdown code fences if present
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(clean)
    except Exception:
        return {"translation": raw, "notes": "", "example": ""}


async def generate_lesson_summary(transcript_text: str, topics: str = "") -> dict:
    """Generate structured AI lesson recap from transcript."""
    prompt = f"""You are an expert language teacher analysing a German language lesson transcript.
The student is learning German. Topics covered this lesson: {topics or "not specified"}.

Analyse the transcript and return ONLY a JSON object with these fields:
- "went_well": bullet points (as a list of strings) of what the student did well
- "struggles": bullet points of errors, hesitations, or weak areas (be specific — quote examples)
- "new_vocab": list of new German words/phrases introduced, each as {{"word": "...", "meaning": "..."}}
- "grammar": list of grammar points covered or that need work, each as {{"point": "...", "note": "..."}}
- "homework": an object describing homework assigned by the teacher:
    {{"text": "clear description of the homework task (pages, exercises, etc.)", "verbatim_quote": "the EXACT words from the transcript where the teacher assigned the homework — copy them verbatim"}}
    If no homework was mentioned, use {{"text": "None", "verbatim_quote": ""}}
- "next_steps": 3-4 concrete recommended study actions

Transcript:
{transcript_text[:12000]}

Return valid JSON only."""

    import json
    raw = _generate(prompt, model=PRO)
    try:
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(clean)
    except Exception:
        return {
            "went_well": [], "struggles": [], "new_vocab": [],
            "grammar": [], "homework": {"text": "None", "verbatim_quote": ""}, "next_steps": [raw]
        }


async def generate_progress_report(context: dict) -> str:
    """Generate AI teacher progress report from full lesson history and user goals."""
    import json

    goals_text = context.get("goals_text", "No goals provided.")
    lesson_summaries = context.get("lesson_summaries", [])
    teacher_notes = context.get("teacher_notes", "None")

    # Compact lesson summaries to avoid token overload
    lessons_text = ""
    for i, l in enumerate(lesson_summaries[-30:], 1):  # Most recent 30
        lessons_text += f"\n### Lesson {i}: {l.get('title', 'Untitled')} ({l.get('date', 'no date')})\n"
        lessons_text += f"Source: {l.get('source', 'recorded')} | Topics: {l.get('topics', '')}\n"
        if l.get("manual_notes"):
            lessons_text += f"Notes: {l['manual_notes'][:600]}\n"
        if l.get("went_well"):
            lessons_text += f"✅ Went well: {'; '.join(str(x) for x in l['went_well'][:3])}\n"
        if l.get("struggles"):
            lessons_text += f"❌ Struggles: {'; '.join(str(x) for x in l['struggles'][:3])}\n"
        if l.get("new_vocab"):
            words = [v.get("word", "") if isinstance(v, dict) else str(v) for v in l["new_vocab"][:5]]
            lessons_text += f"📚 Vocab: {', '.join(words)}\n"
        if l.get("grammar"):
            points = [g.get("point", "") if isinstance(g, dict) else str(g) for g in l["grammar"][:3]]
            lessons_text += f"⚙️ Grammar: {', '.join(points)}\n"
        if l.get("homework"):
            hw = l["homework"]
            hw_text = hw.get("text", "") if isinstance(hw, dict) else str(hw)
            if hw_text and hw_text != "None":
                lessons_text += f"🏠 Homework: {hw_text}\n"
        if l.get("next_steps"):
            steps = [str(s) for s in l["next_steps"][:2]]
            lessons_text += f"📝 Recommended: {'; '.join(steps)}\n"

    prompt = f"""You are a concise AI language teacher writing a brief progress report. Keep the entire report under 350 words.

## Student's Goals
{goals_text}

## Lesson History ({context.get('lesson_count', 0)} lessons, {context.get('vocab_count', 0)} vocab entries)
{lessons_text if lessons_text else "No summarised lessons yet."}

---

Write a **brief, punchy progress report** with exactly these sections (2-4 bullet points each, no padding):

**Overall Progress** – one sentence honest assessment vs goals.
**Strengths** – what they're doing well (cite specific lessons/words).
**Recurring Struggles** – patterns across lessons, be direct.
**Next Steps** – 3 concrete study tasks this week (reference Lektionen and explicitly mention any assigned homework found in the lesson history).
**Teacher's Note** – one encouraging sentence.

Use markdown. Be specific, not generic. Under 350 words total."""

    return _generate(prompt, model=PRO)


async def generate_vocab_list(vocab_entries: list[dict]) -> str:
    """Compile vocab entries into a structured thematic study list."""
    if not vocab_entries:
        return "No vocabulary entries yet."

    entries_text = "\n".join(
        f"- {e['source_text']} → {e['translated_text']} (added {e.get('date', 'unknown')})"
        for e in vocab_entries[:100]
    )

    prompt = f"""You are a German language teacher. Organise the following vocabulary into thematic groups for study.
For each group, provide the theme title and list the words with their translations and a brief memory tip.

Vocabulary list:
{entries_text}

Format as markdown with clear headings per theme."""

    return _generate(prompt)


async def generate_english_summary(transcript_text: str, context: str = "") -> dict:
    """Summarise an English-only audio (meetings, life notes etc)."""
    prompt = f"""Summarise the following transcript concisely.
{"Context: " + context if context else ""}

Return ONLY a JSON object:
- "title": a short descriptive title (max 8 words)
- "summary": 3-5 sentence summary of key points
- "action_items": list of any action items or follow-ups mentioned
- "key_points": list of the 3-5 most important points

Transcript:
{transcript_text[:5000]}

Return valid JSON only."""

    import json
    raw = _generate(prompt)
    try:
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(clean)
    except Exception:
        return {"title": "Recording Summary", "summary": raw, "action_items": [], "key_points": []}


async def detect_lesson_metadata(transcript_text: str, available_textbooks: list[dict] = None) -> dict:
    """Analyze transcript to find title, topics, textbook, and pages."""
    
    # Flag truncation
    limit = 50000
    is_truncated = len(transcript_text) > limit
    text_to_send = transcript_text[:limit]
    
    truncation_warning = "\n[WARNING: The transcript below is TRUNCATED because it was too long. Base your analysis on this first part.]\n" if is_truncated else ""
    
    tb_list_str = ""
    if available_textbooks:
        tb_list_str = "AVAILABLE TEXTBOOKS (pick the best match from this list):\n"
        for tb in available_textbooks:
            tb_list_str += f"- ID {tb['id']}: {tb['title']} (Nickname: {tb.get('nickname')})\n"

    prompt = f"""Analyze this language lesson transcript and extract metadata.
{truncation_warning}
{tb_list_str}

Find:
Find:
1. A concise, descriptive title.
2. Main topics or grammar points.
3. A list of all textbook references mentioned (e.g. "Lektion 3 in Kursbuch" and "p. 12 in Arbeitsbuch").

Transcript:
{text_to_send}

Return valid JSON only:
{{
  "title": "string",
  "topics": "string",
  "references": [
    {{
      "textbook_id": number or null, 
      "chapter": "string or null (e.g. Lektion 3)",
      "page_start": number or null,
      "page_end": number or null
    }}
  ],
  "is_truncated_context": bool
}}
"""
    import json
    raw = _generate(prompt, model=PRO)
    try:
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(clean)
        data["is_truncated_context"] = is_truncated
        return data
    except Exception:
        return {"title": "Language Lesson", "topics": "", "textbook_id": None, "page_start": None, "page_end": None, "is_truncated_context": is_truncated}
