import { api } from '../api.js';
import { toast, fmtTime, fmtDate, showLoading, showEmpty, el } from '../utils.js';

export async function renderTranscription(container) {
    container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2>🎙️ Transcription</h2>
        <p>Upload a lesson recording — we'll transcribe it, detect the lesson details, and generate your AI summary automatically.</p>
      </div>

      <div class="grid grid-2" style="gap:24px; align-items: start;">
        <div class="card">
          <div class="card-title">New Recording</div>
          <div class="mode-toggle mb-20" id="mode-selector">
            <button class="active" data-mode="lesson">Lesson (Multilingual)</button>
            <button data-mode="english">English-Only</button>
          </div>

          <div class="upload-zone mt-20" id="drop-zone">
            <input type="file" id="audio-file" accept="audio/*">
            <div class="upload-icon">📁</div>
            <p><strong>Click to upload</strong> or drag and drop</p>
            <p class="text-sm">MP3, M4A, WAV supported</p>
          </div>

          <div class="divider"></div>
          
          <div class="form-group mb-20">
            <label class="form-label">Lesson Title (optional)</label>
            <input class="form-input" id="trans-title" placeholder="e.g. German Lesson with Petra">
          </div>

          <div class="form-group mb-20" id="lang-select-group">
            <label class="form-label">Languages (comma separated)</label>
            <input class="form-input" id="langs-input" value="de,en">
          </div>

          <button class="btn btn-primary w-100" id="start-trans-btn" style="width: 100%;">Upload &amp; Transcribe</button>

          <!-- Progress panel — hidden until upload starts -->
          <div id="upload-progress" class="hidden mt-20">
            <div id="progress-steps">
              <div class="progress-step" id="step-upload">⏳ Uploading audio...</div>
              <div class="progress-step hidden" id="step-transcribe">⏳ Transcribing recording...</div>
              <div class="progress-step hidden" id="step-lesson">⏳ Creating lesson...</div>
              <div class="progress-step hidden" id="step-metadata">⏳ Detecting lesson metadata...</div>
              <div class="progress-step hidden" id="step-summary">⏳ Generating AI summary &amp; homework...</div>
              <div class="progress-step hidden" id="step-done">✅ Done! Opening lesson...</div>
            </div>
          </div>
        </div>

        <div>
          <div class="section-header">
            <h3>📜 Recent Transcripts</h3>
          </div>
          <div id="transcripts-list"></div>
        </div>
      </div>

      <div id="transcript-view" class="mt-32 hidden">
        <div class="section-header">
          <h3 id="current-trans-title">Transcript Details</h3>
          <div class="flex gap-8" id="trans-actions"></div>
        </div>
        <div class="transcript-block" id="utterances-container"></div>
      </div>
    </div>`;

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('audio-file');
    const modeBtns = document.querySelectorAll('#mode-selector button');
    const startBtn = document.getElementById('start-trans-btn');
    const langGroup = document.getElementById('lang-select-group');

    let currentMode = 'lesson';

    modeBtns.forEach(btn => {
        btn.onclick = () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
            langGroup.style.display = currentMode === 'lesson' ? 'block' : 'none';
        };
    });

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            dropZone.querySelector('p').innerHTML = `Selected: <strong>${file.name}</strong>`;
        }
    };

    startBtn.onclick = async () => {
        const file = fileInput.files[0];
        if (!file) {
            toast('Please select an audio file first', 'error');
            return;
        }

        startBtn.disabled = true;
        startBtn.textContent = 'Processing...';

        // Show progress panel
        document.getElementById('upload-progress').classList.remove('hidden');
        _setStep('step-upload', 'running');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('mode', currentMode);
        formData.append('title', document.getElementById('trans-title').value);
        formData.append('langs', document.getElementById('langs-input').value);

        try {
            // Step 1: Upload
            const res = await api.transcripts.create(formData);
            _setStep('step-upload', 'done');
            _setStep('step-transcribe', 'running');
            loadTranscriptsList();

            // Step 2: Poll until transcription is ready
            const transcript = await _pollUntilReady(res.id);
            _setStep('step-transcribe', 'done');

            if (transcript.raw_text && transcript.raw_text.startsWith('ERROR:')) {
                _setStep('step-lesson', 'error');
                toast('Transcription failed: ' + transcript.raw_text, 'error');
                startBtn.disabled = false;
                startBtn.textContent = 'Upload & Transcribe';
                return;
            }

            // Step 3: Auto-create lesson
            _setStep('step-lesson', 'running');
            const lesson = await api.lessons.create({
                title: transcript.title,
                date: new Date().toISOString().split('T')[0],
                transcript_id: transcript.id,
                source: 'recorded',
            });
            _setStep('step-lesson', 'done');

            // Step 4: Detect metadata (title, topics, textbook refs)
            _setStep('step-metadata', 'running');
            try {
                const meta = await api.lessons.detectMetadata(transcript.id);
                const patch = {};
                if (meta.title) patch.title = meta.title;
                if (meta.topics) patch.topics = meta.topics;
                if (meta.references && meta.references.length) patch.references = meta.references;
                if (Object.keys(patch).length) {
                    await api.lessons.patch(lesson.id, patch);
                }
            } catch (e) {
                console.warn('Metadata detection failed, continuing anyway:', e);
            }
            _setStep('step-metadata', 'done');

            // Step 5: Generate AI summary (includes homework)
            _setStep('step-summary', 'running');
            await api.lessons.summarise(lesson.id);
            _setStep('step-summary', 'done');
            _setStep('step-done', 'done');

            await new Promise(r => setTimeout(r, 800));

            // Navigate to lesson
            window.navigateTo('lessons', lesson.id);

        } catch (e) {
            toast(e.message, 'error');
            startBtn.disabled = false;
            startBtn.textContent = 'Upload & Transcribe';
        }
    };

    loadTranscriptsList();
}

function _setStep(id, state) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    const icons = { running: '⏳', done: '✅', error: '❌' };
    const labels = {
        'step-upload':    { running: 'Uploading audio...', done: 'Audio uploaded', error: 'Upload failed' },
        'step-transcribe':{ running: 'Transcribing recording (this can take a minute)...', done: 'Transcription complete', error: 'Transcription failed' },
        'step-lesson':    { running: 'Creating lesson...', done: 'Lesson created', error: 'Could not create lesson' },
        'step-metadata':  { running: 'Detecting lesson metadata (title, textbook, pages)...', done: 'Metadata detected', error: 'Metadata detection skipped' },
        'step-summary':   { running: 'Generating AI summary & homework extraction...', done: 'AI summary generated', error: 'Summary failed' },
        'step-done':      { running: '', done: '✅ Done! Opening lesson...', error: '' },
    };
    const icon = icons[state] || '⏳';
    const label = (labels[id] && labels[id][state]) || '';
    el.textContent = `${icon} ${label}`;
    el.style.color = state === 'done' ? 'var(--green)' : state === 'error' ? 'var(--red)' : 'var(--text-muted)';
}

async function _pollUntilReady(transcriptId, maxAttempts = 120) {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const t = await api.transcripts.get(transcriptId);
        if (t.raw_text && t.raw_text.length > 0) return t;
    }
    throw new Error('Transcription timed out');
}

async function loadTranscriptsList() {
    const container = document.getElementById('transcripts-list');
    if (!container) return;
    showLoading(container, 'Loading transcripts...');
    try {
        const list = await api.transcripts.list();
        if (!list.length) {
            showEmpty(container, '🎙️', 'No transcripts yet.');
            return;
        }
        container.innerHTML = list.map(t => `
      <div class="card mb-12" style="margin-bottom: 12px; cursor: pointer;" onclick="window.viewTranscript(${t.id})">
        <div class="flex items-center justify-between">
          <div>
            <div class="badge ${t.mode === 'lesson' ? 'badge-blue' : 'badge-purple'} mb-8" style="margin-bottom: 4px;">${t.mode}</div>
            <div style="font-weight: 600;">${t.title}</div>
            <div class="text-sm text-muted">${fmtDate(t.created_at)} • ${t.duration_seconds ? fmtTime(t.duration_seconds) : 'Analyzing...'}</div>
          </div>
          <div>${t.has_text ? '✅' : '⏳'}</div>
        </div>
      </div>
    `).join('');
    } catch (e) {
        if (container) container.innerHTML = `<p class="text-error">Error: ${e.message}</p>`;
    }
}

window.viewTranscript = async (id) => {
    const view = document.getElementById('transcript-view');
    const container = document.getElementById('utterances-container');
    const titleEl = document.getElementById('current-trans-title');
    const actions = document.getElementById('trans-actions');

    view.classList.remove('hidden');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const t = await api.transcripts.get(id);
        titleEl.textContent = t.title;

        actions.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="createLessonFromTranscript(${t.id})">🏫 Create Lesson</button>
      <button class="btn btn-danger btn-sm" onclick="handleDeleteTranscript(${t.id})">🗑️ Delete</button>
    `;

        if (!t.raw_text) {
            container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Still processing transcription...</p></div>';
            return;
        }

        if (t.raw_text.startsWith('ERROR:')) {
            container.innerHTML = `<div class="card" style="border-color: var(--red); color: var(--red);">${t.raw_text}</div>`;
            return;
        }

        container.innerHTML = t.utterances.map(u => `
      <div class="utterance lang-${u.language || 'unknown'}">
        <div class="utterance-meta">
          <div class="utterance-speaker">${u.speaker}</div>
          <div class="utterance-time">${fmtTime(u.start)} - ${fmtTime(u.end)}</div>
          <div class="utterance-lang">${u.language}</div>
        </div>
        <div class="utterance-text">${u.text}</div>
      </div>
    `).join('');

        view.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
        toast(e.message, 'error');
    }
};

window.createLessonFromTranscript = (id) => {
    window.navigateTo('lessons', `new?transcript_id=${id}`);
};

window.handleDeleteTranscript = async (id) => {
    if (!confirm('Are you sure you want to delete this transcript?')) return;
    try {
        await api.transcripts.delete(id);
        toast('Transcript deleted', 'success');
        document.getElementById('transcript-view').classList.add('hidden');
        loadTranscriptsList();
    } catch (e) {
        toast(e.message, 'error');
    }
};
