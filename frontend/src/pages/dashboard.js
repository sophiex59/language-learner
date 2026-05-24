import { api } from '../api.js';
import { toast, fmtDate, md, showLoading, showEmpty } from '../utils.js';

export async function renderDashboard(container) {
    container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2>🎓 AI Teacher Dashboard</h2>
        <p>Your personal German language learning overview</p>
      </div>

      <div class="grid grid-4" id="stats-grid">
        <div class="stat-card"><div class="spinner" style="width:20px;height:20px;margin:0"></div></div>
      </div>

      <div class="grid grid-2 mt-32">
        <div>
          <div class="section-header">
            <h3>📋 Recent Lessons</h3>
            <button class="btn btn-secondary btn-sm" id="new-lesson-btn">+ New Lesson</button>
          </div>
          <div id="recent-lessons-list"><div class="loading"><div class="spinner"></div></div></div>
        </div>
        <div>
          <div class="section-header">
            <h3>📝 Teacher Notes</h3>
            <button class="btn btn-secondary btn-sm" id="add-note-btn">+ Add Note</button>
          </div>
          <div id="notes-list"><div class="loading"><div class="spinner"></div></div></div>
        </div>
      </div>

      <div class="mt-32">
        <div class="section-header">
          <h3>🤖 AI Progress Report</h3>
          <button class="btn btn-primary btn-sm" id="gen-report-btn">Generate Report</button>
        </div>
        <div id="report-area">
          <div class="card" style="text-align:center;padding:40px;color:var(--text-muted)">
            <p>Click "Generate Report" to get Gemini's full analysis of your progress.</p>
          </div>
        </div>
      </div>
    </div>`;

    loadStats();
    loadRecentLessons();
    loadNotes();

    document.getElementById('gen-report-btn').onclick = generateReport;
    document.getElementById('add-note-btn').onclick = () => showAddNoteForm();
    document.getElementById('new-lesson-btn').onclick = () => {
        window.navigateTo('lessons');
    };
}

async function loadStats() {
    const grid = document.getElementById('stats-grid');
    try {
        const s = await api.teacher.stats();
        grid.innerHTML = `
      <div class="stat-card"><div class="stat-icon">📚</div><div class="stat-value">${s.lesson_count}</div><div class="stat-label">Lessons recorded</div></div>
      <div class="stat-card"><div class="stat-icon">🔤</div><div class="stat-value">${s.vocab_count}</div><div class="stat-label">Vocab entries</div></div>
      <div class="stat-card"><div class="stat-icon">🎙️</div><div class="stat-value">${s.transcript_count}</div><div class="stat-label">Transcripts</div></div>
      <div class="stat-card"><div class="stat-icon">🗒️</div><div class="stat-value">${s.note_count}</div><div class="stat-label">Teacher notes</div></div>`;
    } catch (e) {
        grid.innerHTML = `<div class="text-muted text-sm">Could not load stats</div>`;
    }
}

async function loadRecentLessons() {
    const el = document.getElementById('recent-lessons-list');
    try {
        const lessons = await api.lessons.list();
        if (!lessons.length) { showEmpty(el, '📖', 'No lessons yet'); return; }
        el.innerHTML = lessons.slice(0, 5).map(l => `
      <div class="card" style="margin-bottom:10px;padding:14px 18px;cursor:pointer" onclick="window.navigateTo('lessons','${l.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <strong>${l.title || 'Untitled Lesson'}</strong>
            <div class="text-sm text-muted mt-12">${l.topics || 'No topics listed'}</div>
          </div>
          <div class="text-sm text-muted" style="flex-shrink:0;margin-left:12px">${fmtDate(l.date || l.created_at)}</div>
        </div>
        ${l.summary.generated_at ? '<div class="badge badge-green" style="margin-top:8px">✓ AI summary</div>' : '<div class="badge badge-amber" style="margin-top:8px">No summary yet</div>'}
      </div>`).join('');
    } catch (e) {
        el.innerHTML = `<div class="text-muted text-sm">Could not load lessons</div>`;
    }
}

async function loadNotes() {
    const el = document.getElementById('notes-list');
    try {
        const notes = await api.teacher.notes.list();
        if (!notes.length) { showEmpty(el, '🗒️', 'No teacher notes yet'); return; }
        el.innerHTML = notes.map(n => `
      <div class="card" style="margin-bottom:10px;padding:14px 18px" id="note-${n.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <span class="badge badge-${catColor(n.category)}" style="margin-bottom:6px">${n.category}</span>
            <div class="text-sm" style="white-space:pre-wrap">${n.content}</div>
          </div>
          <button class="btn-icon btn-ghost btn-sm" onclick="deleteNote(${n.id})" title="Delete">🗑️</button>
        </div>
        <div class="text-sm text-muted" style="margin-top:8px">${fmtDate(n.updated_at)}</div>
      </div>`).join('');
    } catch (e) {
        el.innerHTML = `<div class="text-muted text-sm">Could not load notes</div>`;
    }
}

function catColor(cat) {
    return { general: 'blue', goals: 'purple', struggles: 'red', progress: 'green' }[cat] || 'blue';
}

function showAddNoteForm() {
    const existing = document.getElementById('add-note-form');
    if (existing) { existing.remove(); return; }
    const form = document.createElement('div');
    form.id = 'add-note-form';
    form.className = 'card mt-12';
    form.style.padding = '16px';
    form.innerHTML = `
    <div class="form-row" style="margin-bottom:10px">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="note-cat">
          <option value="general">General</option><option value="goals">Goals</option>
          <option value="struggles">Struggles</option><option value="progress">Progress</option>
        </select>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:10px">
      <textarea class="form-textarea" id="note-content" placeholder="Write a note..." style="min-height:80px"></textarea>
    </div>
    <div class="flex gap-8">
      <button class="btn btn-primary btn-sm" id="save-note-btn">Save Note</button>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('add-note-form').remove()">Cancel</button>
    </div>`;
    document.getElementById('notes-list').before(form);
    document.getElementById('save-note-btn').onclick = async () => {
        const content = document.getElementById('note-content').value.trim();
        const category = document.getElementById('note-cat').value;
        if (!content) return;
        try {
            await api.teacher.notes.create({ content, category, ai_generated: false });
            form.remove();
            loadNotes();
            toast('Note saved', 'success');
        } catch (e) { toast(e.message, 'error'); }
    };
}

window.deleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    try {
        await api.teacher.notes.delete(id);
        loadNotes();
        toast('Note deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
};

async function generateReport() {
    const area = document.getElementById('report-area');
    const btn = document.getElementById('gen-report-btn');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    area.innerHTML = `<div class="loading"><div class="spinner"></div><p>Gemini is analysing your progress…</p></div>`;
    try {
        const { report } = await api.teacher.report();
        area.innerHTML = `<div class="report-content">${md(report)}</div>`;
    } catch (e) {
        area.innerHTML = `<div class="card"><p class="text-muted">Error: ${e.message}</p></div>`;
        toast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Report';
    }
}
