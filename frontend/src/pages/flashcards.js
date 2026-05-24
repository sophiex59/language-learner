import { api } from '../api.js';
import { toast, fmtDate, showLoading, showEmpty } from '../utils.js';

export async function renderFlashcards(container) {
    container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="flex items-center justify-between">
          <div>
            <h2>🃏 Flashcards</h2>
            <p>Spaced repetition for your German vocabulary.</p>
          </div>
          <div class="flex gap-8" id="fc-header-actions"></div>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-3 mb-24" style="gap:12px;margin-bottom:20px" id="fc-stats-bar"></div>

      <!-- Filter -->
      <div class="flex gap-12 mb-20" style="margin-bottom:16px;align-items:center">
        <label class="form-label" style="margin:0">Study:</label>
        <select class="form-select" id="fc-lesson-filter" style="width:auto">
          <option value="">All vocab (due today)</option>
        </select>
        <button class="btn btn-primary" id="fc-start-btn">Start Session</button>
      </div>

      <!-- Card area -->
      <div id="fc-area">
        <div class="card text-center" style="padding:48px;color:var(--text-muted)">
          <div style="font-size:3rem;margin-bottom:12px">🃏</div>
          <p>Choose a set above and click <strong>Start Session</strong>.</p>
        </div>
      </div>

      <!-- All cards table -->
      <div class="section-header mt-32 mb-12" style="margin-top:28px;margin-bottom:12px">
        <h3>📋 All Cards</h3>
      </div>
      <div id="fc-all-list"></div>
    </div>`;

    loadStats();
    loadLessonsFilter();
    loadAllCards();

    document.getElementById('fc-start-btn').onclick = startSession;
}

async function loadStats() {
    const bar = document.getElementById('fc-stats-bar');
    try {
        const s = await api.vocab.stats();
        bar.innerHTML = [
            ['🔥', s.due_today, 'Due Today'],
            ['📚', s.total, 'Total Cards'],
        ].map(([icon, val, label]) => `
            <div class="card text-center" style="padding:16px">
              <div style="font-size:1.6rem">${icon}</div>
              <div style="font-size:1.8rem;font-weight:700;margin:4px 0">${val}</div>
              <div class="text-sm text-dim">${label}</div>
            </div>
        `).join('');
    } catch {}
}

async function loadLessonsFilter() {
    const sel = document.getElementById('fc-lesson-filter');
    try {
        const lessons = await api.lessons.list();
        lessons.forEach(l => {
            if (!l.summary || !l.summary.generated_at) return;
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = l.title || `Lesson ${l.id}`;
            sel.appendChild(opt);
        });
    } catch {}
}

async function loadAllCards() {
    const el = document.getElementById('fc-all-list');
    showLoading(el, 'Loading cards…');
    try {
        const { cards } = await api.vocab.due();
        const all = await api.vocab.list();
        if (!all.length) { showEmpty(el, '🃏', 'No vocab saved yet. Translate words or generate a lesson summary.'); return; }
        el.innerHTML = `
          <div class="card" style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:1px solid var(--border)">
                  <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-size:.8rem">WORD</th>
                  <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-size:.8rem">MEANING</th>
                  <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-size:.8rem">DUE</th>
                  <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-size:.8rem">REVIEWS</th>
                </tr>
              </thead>
              <tbody>
                ${all.map(c => `
                  <tr style="border-bottom:1px solid var(--border-subtle)">
                    <td style="padding:8px 12px;font-weight:600">${c.source_text}</td>
                    <td style="padding:8px 12px;color:var(--text-muted)">${c.translated_text || '—'}</td>
                    <td style="padding:8px 12px;font-size:.85rem">${c.srs_due_date ? fmtDate(c.srs_due_date) : 'Now'}</td>
                    <td style="padding:8px 12px;font-size:.85rem">${c.srs_reviews || 0}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
    } catch (e) { el.innerHTML = `<p class="text-muted">${e.message}</p>`; }
}

// ─── Study Session ─────────────────────────────────────────────────────────────

let _cards = [];
let _cardIdx = 0;
let _flipped = false;

async function startSession() {
    const lessonId = document.getElementById('fc-lesson-filter').value || null;
    const area = document.getElementById('fc-area');

    area.innerHTML = '<div class="loading" style="justify-content:center"><div class="spinner"></div></div>';

    try {
        const { cards } = await api.vocab.due(lessonId);
        if (!cards.length) {
            area.innerHTML = `
              <div class="card text-center" style="padding:40px">
                <div style="font-size:3rem">🎉</div>
                <h3>All done for today!</h3>
                <p class="text-muted">No cards due. Come back tomorrow.</p>
              </div>`;
            return;
        }
        _cards = cards;
        _cardIdx = 0;
        _flipped = false;
        renderCard(area);
    } catch (e) {
        toast(e.message, 'error');
        area.innerHTML = '';
    }
}

function renderCard(area) {
    if (_cardIdx >= _cards.length) {
        area.innerHTML = `
          <div class="card text-center" style="padding:48px">
            <div style="font-size:3rem">✅</div>
            <h3>Session complete!</h3>
            <p class="text-muted">You reviewed ${_cards.length} card${_cards.length !== 1 ? 's' : ''}.</p>
            <button class="btn btn-primary mt-16" style="margin-top:16px" onclick="window._restartCards()">Review Again</button>
          </div>`;
        loadStats();
        loadAllCards();
        return;
    }

    const card = _cards[_cardIdx];
    area.innerHTML = `
      <div style="max-width:520px;margin:0 auto">
        <div class="text-sm text-dim mb-12" style="text-align:center;margin-bottom:12px">Card ${_cardIdx + 1} of ${_cards.length}</div>
        
        <div class="card flashcard" id="fc-card" style="min-height:220px;cursor:pointer;text-align:center;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:32px;transition:all .2s" onclick="window._flipCard()">
          <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">German</div>
          <div style="font-size:2.2rem;font-weight:700">${card.source_text}</div>
          ${card.context_sentence ? `<div class="text-sm text-dim" style="font-style:italic">"${card.context_sentence}"</div>` : ''}
          <div class="text-sm text-dim mt-8" style="margin-top:8px">👆 Tap to reveal</div>
        </div>

        <div id="fc-answer" class="hidden" style="margin-top:16px">
          <div class="card" style="text-align:center;padding:20px;background:var(--surface2)">
            <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">Meaning</div>
            <div style="font-size:1.5rem;font-weight:600;margin:8px 0">${card.translated_text || '—'}</div>
            ${card.example_sentence ? `<div class="text-sm text-dim" style="font-style:italic">"${card.example_sentence}"</div>` : ''}
            ${card.notes ? `<div class="text-sm mt-8" style="margin-top:8px;color:var(--accent2)">${card.notes}</div>` : ''}
          </div>

          <div class="flex gap-8 mt-16" style="margin-top:16px;justify-content:center">
            <button class="btn btn-sm" style="background:#ef4444;color:#fff;min-width:80px" onclick="window._rateCard(1)">😰 Again</button>
            <button class="btn btn-sm" style="background:#f59e0b;color:#fff;min-width:80px" onclick="window._rateCard(2)">🤨 Hard</button>
            <button class="btn btn-sm" style="background:#3b82f6;color:#fff;min-width:80px" onclick="window._rateCard(3)">👍 Good</button>
            <button class="btn btn-sm" style="background:#22c55e;color:#fff;min-width:80px" onclick="window._rateCard(4)">⚡ Easy</button>
          </div>
        </div>
      </div>`;
}

window._flipCard = () => {
    if (_flipped) return;
    _flipped = true;
    const answer = document.getElementById('fc-answer');
    const card = document.getElementById('fc-card');
    if (answer) answer.classList.remove('hidden');
    if (card) card.querySelector('.text-dim:last-child').style.display = 'none';
};

window._rateCard = async (rating) => {
    const card = _cards[_cardIdx];
    try {
        await api.vocab.review(card.id, rating);
    } catch {}
    _cardIdx++;
    _flipped = false;
    renderCard(document.getElementById('fc-area'));
};

window._restartCards = () => {
    _cardIdx = 0;
    _flipped = false;
    renderCard(document.getElementById('fc-area'));
};
