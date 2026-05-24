# 🏫 Language Learner

A local-first, AI-powered study companion designed for students working with private language tutors and structured textbooks (e.g., German *Menschen B1.1*). 

Instead of letting recorded lessons, textbook exercises, grammar notes, and vocabulary lists scatter across different apps, **Language Learner** unifies them into a single, cohesive workflow.

---

## 🌟 Key Features

* **🎙️ Diarized Multilingual Transcription**
  Upload your audio files (MP3/M4A/WAV) to transcribe conversations. In **Lesson Mode** (powered by Gladia), the system automatically diarizes speakers and handles multilingual transitions between English explanations and German tutor dialogues.
* **📚 Textbook & Audio Integration**
  Drop textbook PDFs and chapter audio tracks directly into the app. On startup, the system indexes chapters and page content, letting the AI map class conversations to specific textbook exercises and chapters.
* **🤖 AI Teacher Summaries & Homework Audits**
  Powered by Gemini 2.5 Pro, the AI analyzes each lesson to extract:
  * **What Went Well** and **Struggles** (e.g. grammar focus areas like *Konjunktiv II*, *Relativsätze*, or *Passiv*).
  * **🏠 Homework Tracking** complete with verbatim transcription quotes directly pulling the teacher's assignment words.
  * **Actionable Next Steps** to guide your study window.
* **🗂️ SM-2 Spaced Repetition (SRS) Flashcards**
  Vocabulary introduced in lesson transcripts is automatically extracted and populated into your active review deck, running on the SM-2 algorithm. You can also translate and log vocab manually during self-study.
* **📝 Manual Study Log**
  Log notes and key takeaways from self-study sessions or homework reviews, instantly summarizing topics with AI to link back to your progress stats.

---

## 🛠️ Setup

### 1. Install dependencies

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
```

### 2. Configure API keys

```bash
cp .env.example .env
# Edit .env and add your keys
```

Required keys:
- `GLADIA_API_KEY` — multilingual lesson transcription ([gladia.io](https://gladia.io))
- `OPENAI_API_KEY` — English-only Whisper transcription
- `GEMINI_API_KEY` — AI teacher, translation, summaries ([aistudio.google.com](https://aistudio.google.com))

### 3. Add your textbooks & audio

Drop textbook PDFs into `backend/data/textbooks/`
Drop textbook audio files into `backend/data/textbook_audio/`

They will be indexed automatically on server start.

### 4. Run

```bash
# Terminal 1 — backend
cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev
```

App runs at: http://localhost:5173
API docs at: http://localhost:8000/docs
