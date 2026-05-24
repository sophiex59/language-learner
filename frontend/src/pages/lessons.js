import { api } from '../api.js';
import { toast, fmtDate, showLoading, showEmpty, md, el } from '../utils.js';

export async function renderLessons(container, lessonId = null) {
  if (lessonId === 'new') {
    renderNewLessonForm(container);
    return;
  }

  if (lessonId) {
    renderLessonDetail(container, lessonId);
    return;
  }

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="flex items-center justify-between">
          <div>
            <h2>🏫 Lessons</h2>
            <p>Track your learning progress, summaries, and history.</p>
          </div>
          <button class="btn btn-primary" onclick="window.navigateTo('lessons', 'new')">Create Lesson</button>
        </div>
      </div>

      <div id="lessons-list"></div>
    </div>`;

  loadLessonsList();
}

async function loadLessonsList() {
  const container = document.getElementById('lessons-list');
  showLoading(container, 'Loading lessons...');
  try {
    const list = await api.lessons.list();
    if (!list.length) {
      showEmpty(container, '📖', 'No lessons recorded yet. Connect a transcript to get started.');
      return;
    }

    container.innerHTML = `
      <div class="grid grid-2">
        ${list.map(l => `
          <div class="card" style="cursor: pointer;" onclick="window.navigateTo('lessons', ${l.id})">
            <div class="flex justify-between mb-12">
              <span class="text-sm text-dim">${fmtDate(l.date || l.created_at)}</span>
              ${l.summary.generated_at ? '<span class="badge badge-green">AI Summarised</span>' : '<span class="badge badge-amber">No Summary</span>'}
            </div>
            <h3 style="margin: 0 0 8px 0;">${l.title || 'Untitled Lesson'}</h3>
            <p class="text-sm text-muted mb-12">${l.topics || 'No topics specified'}</p>
            <div class="text-sm" style="color: var(--accent);">View details →</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function renderNewLessonForm(container) {
  const urlParams = new URLSearchParams(window.location.search);
  const transcriptId = urlParams.get('transcript_id');

  let textbooks = [], transcripts = [];
  try {
    textbooks = await api.textbooks.list();
    transcripts = await api.transcripts.list();
  } catch (e) { }

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <button class="btn btn-ghost mb-20" onclick="window.navigateTo('lessons')">← Back to Lessons</button>
        <h2>New Lesson</h2>
      </div>

      <div class="card" style="max-width: 600px;">
        <div class="form-group mb-20">
          <label class="form-label">Connect Transcript</label>
          <select class="form-select" id="new-lesson-transcript">
            <option value="">Select a transcript...</option>
            ${transcripts.map(t => `<option value="${t.id}" ${t.id == transcriptId ? 'selected' : ''}>${t.title} (${fmtDate(t.created_at)})</option>`).join('')}
          </select>
          <div id="detection-status" class="text-sm mt-8 hidden">🤖 AI is detecting metadata...</div>
        </div>

        <div class="form-group mb-20">
          <label class="form-label">Lesson Title</label>
          <input class="form-input" id="new-lesson-title" placeholder="e.g. Lektion 3: Travel & Vocabulary">
        </div>
        
        <div class="form-row mb-20">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input class="form-input" type="date" id="new-lesson-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label class="form-label">Textbook</label>
            <select class="form-select" id="new-lesson-textbook">
              <option value="">None</option>
              ${textbooks.map(t => `<option value="${t.id}">${t.title}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row mb-20">
          <div class="form-group">
            <label class="form-label">Page Start</label>
            <input class="form-input" type="number" id="new-lesson-page-start">
          </div>
          <div class="form-group">
            <label class="form-label">Page End</label>
            <input class="form-input" type="number" id="new-lesson-page-end">
          </div>
        </div>

        <div class="form-group mb-20">
          <label class="form-label">Topics Covered</label>
          <textarea class="form-textarea" id="new-lesson-topics" placeholder="Grammar points, specific vocab focus..."></textarea>
        </div>

        <div class="flex gap-12">
          <button class="btn btn-primary" id="save-lesson-btn">Create Lesson</button>
          <button class="btn btn-secondary" onclick="window.navigateTo('lessons')">Cancel</button>
        </div>
      </div>
    </div>`;

  const transSelect = document.getElementById('new-lesson-transcript');
  const autoDetect = async (tid) => {
    if (!tid) return;
    const status = document.getElementById('detection-status');
    status.classList.remove('hidden');
    try {
      const meta = await api.lessons.detectMetadata(tid);
      if (meta.title) document.getElementById('new-lesson-title').value = meta.title;
      if (meta.topics) document.getElementById('new-lesson-topics').value = meta.topics;
      if (meta.textbook_id) document.getElementById('new-lesson-textbook').value = meta.textbook_id;
      if (meta.page_start) document.getElementById('new-lesson-page-start').value = meta.page_start;
      if (meta.page_end) document.getElementById('new-lesson-page-end').value = meta.page_end;
      toast('AI detected lesson details ✓', 'success');
    } catch (e) {
      console.error('Metadata detection failed', e);
    } finally {
      status.classList.add('hidden');
    }
  };

  transSelect.onchange = (e) => autoDetect(e.target.value);
  if (transcriptId) autoDetect(transcriptId);

  document.getElementById('save-lesson-btn').onclick = async () => {
    const data = {
      title: document.getElementById('new-lesson-title').value,
      date: document.getElementById('new-lesson-date').value,
      topics: document.getElementById('new-lesson-topics').value,
      textbook_id: document.getElementById('new-lesson-textbook').value || null,
      textbook_page_start: document.getElementById('new-lesson-page-start').value || null,
      textbook_page_end: document.getElementById('new-lesson-page-end').value || null,
      transcript_id: transcriptId || null
    };

    try {
      const res = await api.lessons.create(data);
      toast('Lesson created!', 'success');
      window.navigateTo('lessons', res.id);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
}

async function renderLessonDetail(container, id) {
  showLoading(container, 'Loading lesson details...');
  try {
    const l = await api.lessons.get(id);
    let transcript = null;
    if (l.transcript_id) {
      try { transcript = await api.transcripts.get(l.transcript_id); } catch (e) { }
    }

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <div class="flex items-center justify-between">
            <button class="btn btn-ghost" onclick="window.navigateTo('lessons')">← Back</button>
            <div class="flex gap-8">
              <button class="btn btn-secondary btn-sm" id="edit-lesson-btn">Edit</button>
              <button class="btn btn-danger btn-sm" id="delete-lesson-btn">Delete</button>
            </div>
          </div>
          <h2 class="mt-20">${l.title || 'Untitled Lesson'}</h2>
          <div class="text-muted">${fmtDate(l.date)}</div>
        </div>

        <div class="grid grid-3" style="gap: 24px; align-items: start;">
          <div style="grid-column: span 2;">
            <div class="section-header">
              <h3>🤖 AI Summary</h3>
              ${l.summary.generated_at ? '' : `<button class="btn btn-primary btn-sm" id="summarize-btn">Generate AI Summary</button>`}
            </div>
            
            <div id="summary-content">
              ${renderSummary(l.summary)}
            </div>

            <div class="mt-32">
              <div class="section-header">
                <h3>📜 Transcript Reference</h3>
                ${transcript ? `<button class="btn btn-ghost btn-sm" onclick="window.viewTranscript(${transcript.id})">Open Full →</button>` : ''}
              </div>
              <div class="card" style="max-height: 400px; overflow-y: auto;">
                <div id="transcript-excerpt">
                  ${transcript ? transcript.utterances.slice(0, 15).map(u => `
                    <div class="text-sm mb-8">
                      <span style="color: var(--accent); font-weight: 600;">${u.speaker}:</span> ${u.text}
                    </div>
                  `).join('') : '<p class="text-muted italic">No transcript linked to this lesson.</p>'}
                </div>
                ${transcript && transcript.utterances.length > 15 ? `
                  <div id="transcript-full" class="hidden">
                    ${transcript.utterances.slice(15).map(u => `
                      <div class="text-sm mb-8">
                        <span style="color: var(--accent); font-weight: 600;">${u.speaker}:</span> ${u.text}
                      </div>
                    `).join('')}
                  </div>
                  <div class="text-center mt-12">
                    <button class="btn btn-ghost btn-sm" id="show-full-transcript-btn">Show all ${transcript.utterances.length} lines</button>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <div>
            <div class="card mb-24">
              <div class="card-title">Metadata</div>
              <div class="mb-12">
                <div class="text-sm text-dim">Topics</div>
                <div class="text-sm">${l.topics || '—'}</div>
              </div>
              <div class="mb-12">
                <div class="text-sm text-dim">Textbook</div>
                <div class="text-sm">${l.references && l.references.length ? l.references.map(r => r.textbook_name).join(', ') : 'None linked'}</div>
              </div>
              ${l.summary.homework && l.summary.homework.text !== 'None' ? `
                <div class="mb-12">
                  <div class="text-sm text-dim">🏠 Homework</div>
                  <div class="text-sm" style="color: var(--accent); font-weight: 600;">${l.summary.homework.text}</div>
                </div>
              ` : ''}
            </div>

            <div class="card">
              <div class="card-title">AI Teacher Recommendations</div>
              <div class="text-sm" id="reco-area">
                ${l.summary.next_steps.length ? l.summary.next_steps.map(s => `<div class="summary-item next-step mb-8" style="margin-bottom: 8px;">${s}</div>`).join('') : '<p class="text-muted italic">Generate summary to see recommendations.</p>'}
              </div>
            </div>
          </div>
        </div>
      </div>`;

    if (document.getElementById('show-full-transcript-btn')) {
      document.getElementById('show-full-transcript-btn').onclick = (e) => {
        document.getElementById('transcript-full').classList.remove('hidden');
        e.target.remove();
      };
    }

    if (document.getElementById('summarize-btn')) {
      document.getElementById('summarize-btn').onclick = async () => {
        const btn = document.getElementById('summarize-btn');
        btn.disabled = true;
        btn.textContent = 'Analysing...';
        try {
          const res = await api.lessons.summarise(id);
          toast('AI Summary generated!', 'success');
          renderLessonDetail(container, id);
        } catch (e) {
          toast(e.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Generate AI Summary';
        }
      };
    }

    document.getElementById('delete-lesson-btn').onclick = async () => {
      if (!confirm('Delete this lesson?')) return;
      try {
        await api.lessons.delete(id);
        toast('Lesson deleted', 'success');
        window.navigateTo('lessons');
      } catch (e) { toast(e.message, 'error'); }
    };
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderSummary(s) {
  if (!s.generated_at) {
    return `<div class="card text-center p-40 text-muted">
      <p>No summary has been generated for this lesson yet.</p>
      <p class="text-sm">Connect a transcript and click "Generate AI Summary" above.</p>
    </div>`;
  }

  return `
    ${renderHomework(s.homework)}
    <div class="summary-section mt-20">
      <div class="summary-section-title">✅ What Went Well</div>
      <div class="summary-list">
        ${s.went_well.map(i => `<div class="summary-item went-well">${i}</div>`).join('')}
      </div>
    </div>
    <div class="summary-section mt-20">
      <div class="summary-section-title">❌ Struggles & Errors</div>
      <div class="summary-list">
        ${s.struggles.map(i => `<div class="summary-item struggle">${i}</div>`).join('')}
      </div>
    </div>
    <div class="grid grid-2 mt-20" style="gap: 16px;">
      <div class="card" style="padding: 16px;">
        <div class="card-title">📚 New Vocabulary</div>
        <div class="text-sm">
          ${s.new_vocab.map(v => `<div class="mb-4"><strong>${v.word}</strong>: ${v.meaning}</div>`).join('') || '—'}
        </div>
      </div>
      <div class="card" style="padding: 16px;">
        <div class="card-title">⚙️ Grammar</div>
        <div class="text-sm">
          ${s.grammar.map(g => `<div class="mb-4"><strong>${g.point}</strong>: ${g.note}</div>`).join('') || '—'}
        </div>
      </div>
    </div>
  `;
}

function renderHomework(hw) {
  const text = (hw && typeof hw === 'object') ? hw.text : (hw || 'None');
  const quote = (hw && typeof hw === 'object') ? hw.verbatim_quote : '';
  const hasHomework = text && text !== 'None';

  return `
    <div class="summary-section" style="border-left: 3px solid var(--accent); padding-left: 16px;">
      <div class="summary-section-title">🏠 Homework</div>
      ${hasHomework ? `
        <div class="summary-item" style="background: rgba(var(--accent-rgb, 99,102,241), 0.10); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px;">
          <div style="font-weight: 600; margin-bottom: 6px;">${text}</div>
          ${quote ? `
            <div style="margin-top: 8px; padding: 8px 12px; background: rgba(0,0,0,0.18); border-radius: 6px; border-left: 3px solid var(--accent);">
              <div class="text-sm text-dim" style="margin-bottom: 4px; font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase;">Exact quote from transcript</div>
              <div class="text-sm" style="font-style: italic; white-space: pre-wrap;">"${quote}"</div>
            </div>
          ` : ''}
        </div>
      ` : `<p class="text-muted italic text-sm">No homework assigned this lesson.</p>`}
    </div>
  `;
}
