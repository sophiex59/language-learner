# Language Learner

A local-first AI language learning assistant with lesson transcription, AI teacher summaries, translation, and textbook integration.

## Setup

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
