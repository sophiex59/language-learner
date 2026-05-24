import { api } from '../api.js';
import { toast, fmtTime, fmtDate, showLoading, showEmpty, md } from '../utils.js';

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function renderHome(container, params = null) {
    container.innerHTML = `
    <div class="page home-layout">

      <!-- LEFT: Record panel -->
      <div class="home-left">
        <div class="page-header" style="padding-bottom:0">
          <h2>🎙️ Record &amp; Learn</h2>
          <p>Upload a lesson recording to get a transcript and AI summary.</p>
        </div>

        <div class="mode-toggle mt-20 mb-16" id="mode-selector">
          <button class="active" data-mode="lesson">Lesson (Multilingual · Gladia)</button>
          <button data-mode="english">English-Only · Whisper</button>
        </div>

        <div class="upload-zone" id="drop-zone">
          <input type="file" id="audio-file" accept="audio/*" style="display:none">
          <div class="upload-icon">📁</div>
          <p><strong>Click to upload</strong> or drag &amp; drop</p>
          <p class="text-sm">MP3, M4A, WAV supported</p>
        </div>

        <div class="form-group mt-16 mb-12" id="lang-select-group">
          <label class="form-label">Languages (comma-separated)</label>
          <input class="form-input" id="langs-input" value="de,en" placeholder="e.g. de,en,fr">
        </div>

        <div class="form-group mb-16">
          <label class="form-label">Title <span class="text-dim">(optional — AI will suggest one)</span></label>
          <input class="form-input" id="trans-title" placeholder="e.g. German Lesson with Petra">
        </div>

        <button class="btn btn-primary w-full" id="start-trans-btn">Upload &amp; Transcribe</button>

        <!-- Active transcript view -->
        <div id="transcript-panel" class="mt-24 hidden">
          <div class="section-header mb-12">
            <h3 id="trans-panel-title">Transcript</h3>
            <div class="flex gap-8" id="trans-panel-actions"></div>
          </div>
          <div class="transcript-block" id="utterances-container" style="max-height:340px;overflow-y:auto"></div>

          <!-- Save as Lesson -->
          <div id="save-lesson-panel" class="card mt-16 hidden">
            <div class="card-title mb-12">💾 Save as Lesson</div>
            <div id="ai-detect-status" class="text-sm text-dim mb-12 hidden">🤖 AI is reading the transcript…</div>
            
            <div class="form-group mb-12">
              <label class="form-label">Lesson Title</label>
              <input class="form-input" id="lesson-title-input" placeholder="AI will suggest…">
            </div>
            
            <div class="form-group mb-12">
              <label class="form-label">Topics</label>
              <textarea class="form-textarea" id="lesson-topics-input" placeholder="AI will suggest…" style="min-height:60px"></textarea>
            </div>

            <div class="form-group mb-12">
              <label class="form-label">Date</label>
              <input class="form-input" type="date" id="lesson-date-input" value="${new Date().toISOString().split('T')[0]}">
            </div>

            <div class="section-header mb-8 mt-16">
              <h4 class="text-sm">📚 Detected References</h4>
            </div>
            <div id="references-container" class="mb-16">
               <p class="text-sm text-dim italic">No books mentioned yet.</p>
            </div>

            <div class="flex gap-8">
              <button class="btn btn-primary" id="confirm-save-lesson-btn">Save Lesson</button>
              <button class="btn btn-ghost" id="cancel-save-lesson-btn">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Recent transcripts -->
        <div class="section-header mt-32 mb-12">
          <h3>📜 Recent Transcripts</h3>
          <button class="btn btn-ghost btn-sm" onclick="window._refreshTranscripts()">↻</button>
        </div>
        <div id="transcripts-list"></div>
      </div>

      <!-- RIGHT: Learn panel -->
      <div class="home-right">
        <div class="page-header" style="padding-bottom:0">
          <div class="flex items-center justify-between">
            <div>
              <h2>📖 Learn</h2>
              <p>Your lessons and AI summaries.</p>
            </div>
            <button class="btn btn-secondary btn-sm" id="manual-lesson-btn">✏️ Log Manual Lesson</button>
          </div>
        </div>

        <!-- Manual lesson form (hidden by default) -->
        <div id="manual-lesson-form" class="card mt-16 hidden" style="border: 1px solid var(--accent);">
          <div class="card-title mb-12">✏️ Log What You Learned</div>
          <div class="form-group mb-12">
            <label class="form-label">Title</label>
            <input class="form-input" id="ml-title" placeholder="e.g. Homework review – Lektion 4">
          </div>
          <div class="form-group mb-12">
            <label class="form-label">Date</label>
            <input class="form-input" type="date" id="ml-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group mb-12">
            <label class="form-label">Topics <span class="text-dim">(optional)</span></label>
            <input class="form-input" id="ml-topics" placeholder="e.g. Relativsätze, Dativ">
          </div>
          <div class="form-group mb-16">
            <label class="form-label">What did you learn / do in this lesson?</label>
            <textarea class="form-textarea" id="ml-notes" rows="6" placeholder="Write in English — describe what you covered, what you struggled with, new words you encountered, homework you did, etc."></textarea>
          </div>
          <div class="flex gap-8">
            <button class="btn btn-primary" id="ml-submit-btn">Save &amp; Summarise with AI</button>
            <button class="btn btn-ghost" id="ml-cancel-btn">Cancel</button>
          </div>
        </div>

        <div class="stats-row mt-16 mb-20" id="stats-row">
          <div class="stat-pill"><span id="stat-lessons">–</span> lessons</div>
          <div class="stat-pill"><span id="stat-vocab">–</span> vocab entries</div>
          <div class="stat-pill"><span id="stat-transcripts">–</span> transcripts</div>
        </div>

        <div id="lessons-panel">
          <div id="lessons-list"></div>
        </div>
      </div>
    </div>`;

    setupUpload();
    setupManualLesson();
    window._refreshTranscripts = loadTranscriptsList;
    loadTranscriptsList();
    loadLessonsList();
    loadStats();

    if (params && /^\d+$/.test(params)) renderLessonDetail(params);
}

// ─── Manual Lesson ────────────────────────────────────────────────────────────

function setupManualLesson() {
    const toggleBtn = document.getElementById('manual-lesson-btn');
    const form = document.getElementById('manual-lesson-form');
    const cancelBtn = document.getElementById('ml-cancel-btn');
    const submitBtn = document.getElementById('ml-submit-btn');
    if (!toggleBtn) return;

    toggleBtn.onclick = () => form.classList.toggle('hidden');
    cancelBtn.onclick = () => form.classList.add('hidden');

    submitBtn.onclick = async () => {
        const notes = document.getElementById('ml-notes').value.trim();
        if (!notes) { toast('Please write what you learned', 'error'); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ AI is summarising…';
        try {
            const res = await api.lessons.createManual({
                title: document.getElementById('ml-title').value || 'Manual Lesson',
                date: document.getElementById('ml-date').value,
                topics: document.getElementById('ml-topics').value,
                manual_notes: notes,
            });
            toast('Lesson saved and summarised! ✓', 'success');
            form.classList.add('hidden');
            // Reset fields
            ['ml-title', 'ml-topics', 'ml-notes'].forEach(id => { document.getElementById(id).value = ''; });
            loadLessonsList();
            loadStats();
            renderLessonDetail(res.id);
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save & Summarise with AI';
        }
    };
}

// ─── Upload ───────────────────────────────────────────────────────────────────

function setupUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('audio-file');
    const modeBtns = document.querySelectorAll('#mode-selector button');
    const startBtn = document.getElementById('start-trans-btn');
    const langGroup = document.getElementById('lang-select-group');
    let currentMode = 'lesson';

    if (!dropZone) return;

    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); };
    dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
    dropZone.ondrop = (e) => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) { fileInput.files = e.dataTransfer.files; showFile(e.dataTransfer.files[0].name); }
    };
    fileInput.onchange = (e) => { if (e.target.files[0]) showFile(e.target.files[0].name); };

    modeBtns.forEach(btn => btn.onclick = () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        langGroup.style.display = currentMode === 'lesson' ? '' : 'none';
    });

    startBtn.onclick = async () => {
        const file = fileInput.files[0];
        if (!file) { toast('Please select an audio file first', 'error'); return; }
        startBtn.disabled = true; startBtn.textContent = 'Uploading…';
        const form = new FormData();
        form.append('file', file);
        form.append('mode', currentMode);
        form.append('title', document.getElementById('trans-title').value);
        form.append('langs', document.getElementById('langs-input').value);
        try {
            const res = await api.transcripts.create(form);
            toast('Uploaded! Transcribing in background…', 'success');
            loadTranscriptsList();
            pollTranscript(res.id);
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            startBtn.disabled = false; startBtn.textContent = 'Upload & Transcribe';
        }
    };
}

function showFile(name) {
    const p = document.querySelector('#drop-zone p:first-of-type');
    if (p) p.innerHTML = `Selected: <strong>${name}</strong>`;
}

// ─── Transcript list & view ───────────────────────────────────────────────────

async function loadTranscriptsList() {
    const el = document.getElementById('transcripts-list');
    if (!el) return;
    showLoading(el, 'Loading…');
    try {
        const list = await api.transcripts.list();
        if (!list.length) { showEmpty(el, '🎙️', 'No transcripts yet.'); return; }
        el.innerHTML = list.map(t => `
          <div class="card mb-8" style="cursor:pointer;padding:12px 16px" onclick="window._viewTranscript(${t.id})">
            <div class="flex items-center justify-between">
              <div>
                <span class="badge ${t.mode === 'lesson' ? 'badge-blue' : 'badge-purple'} mb-4">${t.mode || 'lesson'}</span>
                <div style="font-weight:600">${t.title}</div>
                <div class="text-sm text-muted">
                  ${fmtDate(t.created_at)}${t.duration_seconds ? ' · ' + fmtTime(t.duration_seconds) : ''}
                  ${t.char_count ? ` · ${t.char_count.toLocaleString()} chars` : ''}
                </div>
              </div>
              <div style="font-size:1.2rem">${t.has_text ? '✅' : '⏳'}</div>
            </div>
          </div>`).join('');
    } catch (e) {
        if (el) el.innerHTML = `<p class="text-muted text-sm">Could not load transcripts.</p>`;
    }
}

window._viewTranscript = async (id) => {
    const panel = document.getElementById('transcript-panel');
    const container = document.getElementById('utterances-container');
    const titleEl = document.getElementById('trans-panel-title');
    const actions = document.getElementById('trans-panel-actions');
    if (!panel) return;
    panel.classList.remove('hidden');
    document.getElementById('save-lesson-panel').classList.add('hidden');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const t = await api.transcripts.get(id);
        const charCount = (t.raw_text || '').length;
        titleEl.innerHTML = `${t.title} <span class="text-xs text-dim" style="font-weight:normal;margin-left:8px">(${charCount.toLocaleString()} chars)</span>`;
        actions.innerHTML = `
          <button class="btn btn-secondary btn-sm" onclick="window._openSaveLesson(${t.id})">💾 Save as Lesson</button>
          <button class="btn btn-danger btn-sm" onclick="window._deleteTranscript(${t.id})">🗑️</button>`;
        panel.dataset.transcriptId = id;

        if (!t.raw_text) {
            container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Still transcribing…</p></div>';
            return;
        }
        if (t.raw_text.startsWith('ERROR:')) {
            container.innerHTML = `<div class="card" style="border-color:var(--red);color:var(--red);padding:16px">${t.raw_text}</div>`;
            return;
        }
        if (t.utterances && t.utterances.length) {
            container.innerHTML = t.utterances.map(u => `
              <div class="utterance lang-${u.language || 'unknown'}">
                <div class="utterance-meta">
                  <div class="utterance-speaker">${u.speaker}</div>
                  <div class="utterance-time">${fmtTime(u.start)} – ${fmtTime(u.end)}</div>
                  <div class="utterance-lang">${u.language || ''}</div>
                </div>
                <div class="utterance-text">${u.text}</div>
              </div>`).join('');
        } else {
            container.innerHTML = `<div class="text-sm" style="white-space:pre-wrap;padding:16px">${t.raw_text}</div>`;
        }
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { toast(e.message, 'error'); }
};

window._openSaveLesson = async (transcriptId) => {
    const savePanel = document.getElementById('save-lesson-panel');
    const status = document.getElementById('ai-detect-status');
    const titleIn = document.getElementById('lesson-title-input');
    const topicsIn = document.getElementById('lesson-topics-input');
    const refContainer = document.getElementById('references-container');

    savePanel.classList.remove('hidden');
    status.classList.remove('hidden');
    titleIn.value = ''; topicsIn.value = '';
    refContainer.innerHTML = '<p class="text-sm text-dim italic">🤖 AI is looking for books...</p>';

    let detectedRefs = [];

    try {
        const meta = await api.lessons.detectMetadata(transcriptId);
        if (meta.title) titleIn.value = meta.title;
        if (meta.topics) topicsIn.value = meta.topics;
        
        detectedRefs = meta.references || [];
        if (detectedRefs.length) {
            refContainer.innerHTML = detectedRefs.map(r => `
                <div class="card mb-8" style="padding:8px 12px; background: var(--surface2)">
                  <div class="flex justify-between items-center">
                    <span class="text-sm">📚 <strong>${r.textbook_name}</strong>: ${r.chapter || `Pages ${r.page_start}–${r.page_end}`}</span>
                  </div>
                </div>
            `).join('');
        } else {
            refContainer.innerHTML = '<p class="text-sm text-dim italic">No books mentioned in transcript.</p>';
        }

        if (meta.is_truncated) {
            toast('⚠️ Transcript truncated - references based on first part only.', 'warning');
        } else {
            toast('AI found ' + detectedRefs.length + ' references ✓', 'success');
        }
    } catch (e) {
        console.warn('AI metadata skipped:', e.message);
        refContainer.innerHTML = '<p class="text-sm text-dim italic">Could not detect books automatically.</p>';
    } finally {
        status.classList.add('hidden');
    }

    document.getElementById('confirm-save-lesson-btn').onclick = async () => {
        try {
            const res = await api.lessons.create({
                title: titleIn.value,
                date: document.getElementById('lesson-date-input').value,
                topics: topicsIn.value,
                transcript_id: transcriptId,
                references: detectedRefs
            });
            toast('Lesson saved! Generating summary + flashcards…', 'success');
            savePanel.classList.add('hidden');
            loadLessonsList(); loadStats();
            renderLessonDetail(res.id);
            // Auto-generate summary (which also imports vocab → flashcards)
            try {
                await api.lessons.summarise(res.id);
                toast('Summary ready + vocab added to flashcards ✓', 'success');
                renderLessonDetail(res.id);
                loadStats();
            } catch (e) { /* Summary failed silently — user can retry */ }
        } catch (e) { toast(e.message, 'error'); }
    };
    document.getElementById('cancel-save-lesson-btn').onclick = () => savePanel.classList.add('hidden');
};

function pollTranscript(id) {
    let n = 0;
    const t = setInterval(async () => {
        n++;
        try {
            const res = await api.transcripts.get(id);
            if (res.raw_text && !res.raw_text.startsWith('ERROR')) {
                clearInterval(t);
                loadTranscriptsList();
                await window._viewTranscript(id);
                // Auto-open the save lesson panel for a seamless flow
                window._openSaveLesson(id);
            }
        } catch { clearInterval(t); }
        if (n > 120) clearInterval(t);
    }, 5000);
}

window._deleteTranscript = async (id) => {
    if (!confirm('Delete this transcript?')) return;
    try {
        await api.transcripts.delete(id);
        toast('Deleted', 'success');
        document.getElementById('transcript-panel').classList.add('hidden');
        loadTranscriptsList();
    } catch (e) { toast(e.message, 'error'); }
};

// ─── Lessons ──────────────────────────────────────────────────────────────────

async function loadLessonsList() {
    const el = document.getElementById('lessons-list');
    if (!el) return;
    showLoading(el, 'Loading lessons…');
    try {
        const list = await api.lessons.list();
        if (!list.length) { showEmpty(el, '📖', 'No lessons yet. Upload a transcript and save it as a lesson.'); return; }
        el.innerHTML = list.map(l => `
          <div class="card mb-8" style="cursor:pointer;padding:14px 16px" onclick="window._openLesson(${l.id})">
            <div class="flex justify-between items-start">
              <div>
                <strong>${l.title || 'Untitled Lesson'}</strong>
                <div class="text-sm text-muted mt-4">${l.topics || ''}</div>
                ${(l.references || []).map(r => `<div class="text-xs text-dim mt-4">📚 ${r.textbook_name}</div>`).join('')}
              </div>
              <div class="flex flex-col items-end gap-4" style="flex-shrink:0;margin-left:12px">
                <span class="text-sm text-dim">${fmtDate(l.date || l.created_at)}</span>
                ${l.summary && l.summary.generated_at ? '<span class="badge badge-green">AI ✓</span>' : '<span class="badge badge-amber">No summary</span>'}
              </div>
            </div>
          </div>`).join('');
    } catch (e) {
        const el2 = document.getElementById('lessons-list');
        if (el2) el2.innerHTML = `<p class="text-muted text-sm">Could not load lessons.</p>`;
    }
}

window._openLesson = (id) => renderLessonDetail(id);

async function renderLessonDetail(id) {
    const panel = document.getElementById('lessons-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="flex items-center gap-8 mb-16">
        <button class="btn btn-ghost btn-sm" onclick="window._backToLessons()">← All Lessons</button>
      </div>
      <div id="lesson-detail-content"><div class="loading"><div class="spinner"></div></div></div>`;
    try {
        const l = await api.lessons.get(id);
        let transcript = null;
        if (l.transcript_id) { try { transcript = await api.transcripts.get(l.transcript_id); } catch {} }

        document.getElementById('lesson-detail-content').innerHTML = `
          <div class="flex justify-between items-start mb-8">
            <div>
              <h3 style="margin:0">${l.title || 'Untitled Lesson'}</h3>
              <div class="text-muted text-sm mt-4">${fmtDate(l.date)}${l.topics ? ' · ' + l.topics : ''}</div>
              ${(l.references || []).map(r => `
                <div class="text-sm text-dim mt-4">📚 ${r.textbook_name} (Pages ${r.page_start}${r.page_end && r.page_end !== r.page_start ? '–' + r.page_end : ''})</div>
              `).join('')}
            </div>
            <div class="flex gap-8">
              ${!l.summary.generated_at ? `<button class="btn btn-primary btn-sm" id="summarize-btn">🤖 Generate Summary</button>` : ''}
              <button class="btn btn-danger btn-sm" onclick="window._deleteLesson(${l.id})">🗑️</button>
            </div>
          </div>
          <div id="summary-area">${renderSummary(l.summary)}</div>
          ${transcript ? `
          <div class="mt-20">
            <div class="section-header mb-8"><h4 style="margin:0">📜 Transcript</h4></div>
            <div class="transcript-block" style="max-height:260px;overflow-y:auto">
              ${(transcript.utterances || []).slice(0, 20).map(u => `
                <div class="utterance lang-${u.language || 'unknown'}">
                  <div class="utterance-meta">
                    <div class="utterance-speaker">${u.speaker}</div>
                    <div class="utterance-lang">${u.language || ''}</div>
                  </div>
                  <div class="utterance-text">${u.text}</div>
                </div>`).join('')}
              ${(transcript.utterances || []).length > 20 ? `<p class="text-sm text-dim text-center" style="padding:8px">+ ${transcript.utterances.length - 20} more lines</p>` : ''}
            </div>
          </div>` : ''}`;

        const sumBtn = document.getElementById('summarize-btn');
        if (sumBtn) {
            sumBtn.onclick = async () => {
                sumBtn.disabled = true; sumBtn.textContent = 'Analysing Books…';
                try {
                    await api.lessons.summarise(id);
                    toast('Summary generated!', 'success');
                    renderLessonDetail(id);
                } catch (e) {
                    toast(e.message, 'error');
                    sumBtn.disabled = false; sumBtn.textContent = '🤖 Generate Summary';
                }
            };
        }
    } catch (e) { toast(e.message, 'error'); window._backToLessons(); }
}

function renderSummary(s) {
    if (!s || !s.generated_at) return `<div class="card text-center" style="padding:32px;color:var(--text-muted)"><p>No summary yet. Click "Generate Summary" above.</p></div>`;
    const list = (arr, cls) => arr && arr.length
        ? `<ul class="summary-list">${arr.map(i => `<li class="summary-item ${cls}">${typeof i === 'string' ? i : JSON.stringify(i)}</li>`).join('')}</ul>`
        : '<p class="text-dim text-sm">None noted.</p>';

    const hw = s.homework || {};
    const hwText = (hw && typeof hw === 'object') ? hw.text : (hw || 'None');
    const hwQuote = (hw && typeof hw === 'object') ? hw.verbatim_quote : '';
    const hasHomework = hwText && hwText !== 'None';
    const homeworkHtml = `
      <div class="summary-section mb-16" style="border-left: 3px solid var(--accent); padding-left: 16px;">
        <div class="summary-section-title">🏠 Homework</div>
        ${hasHomework ? `
          <div class="summary-item" style="background: rgba(var(--accent-rgb, 99,102,241), 0.10); border-radius: 8px; padding: 12px 14px;">
            <div style="font-weight: 600; margin-bottom: 6px;">${hwText}</div>
            ${hwQuote ? `
              <div style="margin-top: 8px; padding: 8px 12px; background: rgba(0,0,0,0.18); border-radius: 6px; border-left: 3px solid var(--accent);">
                <div class="text-sm text-dim" style="margin-bottom: 4px; font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase;">Exact quote from transcript</div>
                <div class="text-sm" style="font-style: italic; white-space: pre-wrap;">"${hwQuote}"</div>
              </div>` : ''}
          </div>` : '<p class="text-muted italic text-sm">No homework assigned this lesson.</p>'}
      </div>`;

    return `
      ${homeworkHtml}
      <div class="summary-section mb-16"><div class="summary-section-title">✅ What Went Well</div>${list(s.went_well, 'went-well')}</div>
      <div class="summary-section mb-16"><div class="summary-section-title">❌ Struggles</div>${list(s.struggles, 'struggle')}</div>
      <div class="grid grid-2" style="gap:16px;margin-bottom:16px">
        <div class="card" style="padding:14px"><div class="card-title">📚 New Vocab</div>
          ${s.new_vocab && s.new_vocab.length ? s.new_vocab.map(v => `<div class="mb-4 text-sm"><strong>${v.word}</strong>: ${v.meaning}</div>`).join('') : '<p class="text-dim text-sm">—</p>'}
        </div>
        <div class="card" style="padding:14px"><div class="card-title">⚙️ Grammar</div>
          ${s.grammar && s.grammar.length ? s.grammar.map(g => `<div class="mb-4 text-sm"><strong>${g.point}</strong>: ${g.note}</div>`).join('') : '<p class="text-dim text-sm">—</p>'}
        </div>
      </div>
      ${s.next_steps && s.next_steps.length ? `<div class="summary-section"><div class="summary-section-title">🎯 Next Steps</div>${list(s.next_steps, 'next-step')}</div>` : ''}`;
}

window._backToLessons = () => {
    const panel = document.getElementById('lessons-panel');
    if (panel) { panel.innerHTML = '<div id="lessons-list"></div>'; loadLessonsList(); }
};

window._deleteLesson = async (id) => {
    if (!confirm('Delete this lesson?')) return;
    try {
        await api.lessons.delete(id);
        toast('Lesson deleted', 'success');
        window._backToLessons(); loadStats();
    } catch (e) { toast(e.message, 'error'); }
};

// ─── Stats ────────────────────────────────────────────────────────────────────

async function loadStats() {
    try {
        const s = await api.teacher.stats();
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('stat-lessons', s.lesson_count);
        set('stat-vocab', s.vocab_count);
        set('stat-transcripts', s.transcript_count);
    } catch {}
}
