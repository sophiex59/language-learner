import { api } from '../api.js';
import { toast, fmtTime, fmtDate, showLoading, showEmpty } from '../utils.js';

const SPECIAL_CHARS = ['ä', 'ö', 'ü', 'Ä', 'Ö', 'Ü', 'ß', 'é', 'è', 'ê', 'à', 'â', 'î', 'ô', 'û', 'ñ', 'ó', 'ú', 'í', 'á'];

export async function renderTranslation(container) {
    container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2>🔤 Translation</h2>
        <p>Translate words and phrases — everything is saved to your vocab log automatically.</p>
      </div>

      <div class="grid grid-2" style="gap:24px">
        <!-- Translator panel -->
        <div class="card">
          <div class="form-row" style="margin-bottom:14px">
            <div class="form-group">
              <label class="form-label">From</label>
              <select class="form-select" id="src-lang">
                <option value="de" selected>🇩🇪 German</option>
                <option value="en">🇬🇧 English</option>
                <option value="fr">🇫🇷 French</option>
                <option value="es">🇪🇸 Spanish</option>
                <option value="it">🇮🇹 Italian</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">To</label>
              <select class="form-select" id="tgt-lang">
                <option value="en" selected>🇬🇧 English</option>
                <option value="de">🇩🇪 German</option>
                <option value="fr">🇫🇷 French</option>
                <option value="es">🇪🇸 Spanish</option>
                <option value="it">🇮🇹 Italian</option>
              </select>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:10px">
            <label class="form-label">Word or phrase</label>
            <div style="position:relative">
              <textarea class="form-textarea" id="translate-input" placeholder="Type here…" style="min-height:80px;padding-right:48px"></textarea>
            </div>
          </div>

          <!-- Special character pad -->
          <div class="char-pad">
            ${SPECIAL_CHARS.map(c => `<button class="char-btn" onclick="insertChar('${c}')">${c}</button>`).join('')}
          </div>

          <div class="form-group" style="margin-top:12px">
            <label class="form-label">Context (optional)</label>
            <input class="form-input" id="translate-context" placeholder="e.g. from Lektion 3, discussing travel">
          </div>

          <div class="flex gap-8 mt-12">
            <button class="btn btn-primary flex-1" id="translate-btn">Translate</button>
            <button class="btn btn-secondary" id="clear-btn">Clear</button>
          </div>

          <!-- Result -->
          <div id="translation-result" class="hidden" style="margin-top:16px">
            <hr class="divider">
            <div class="card-title">Translation</div>
            <div id="translation-text" style="font-size:1.1rem;font-weight:600;margin-bottom:10px"></div>
            <div id="translation-notes" class="text-sm text-muted" style="margin-bottom:8px"></div>
            <div>
              <div class="card-title">Example</div>
              <div id="translation-example" class="text-sm" style="font-style:italic;color:var(--accent2)"></div>
            </div>
          </div>
        </div>

        <!-- Vocab log -->
        <div>
          <div class="section-header">
            <h3>📖 Vocab Log</h3>
            <button class="btn btn-secondary btn-sm" id="study-list-btn">✨ Study List</button>
          </div>
          <div id="vocab-list"></div>
        </div>
      </div>

      <!-- Study list modal -->
      <div id="study-list-modal" class="hidden" style="margin-top:24px">
        <div class="section-header">
          <h3>📚 Thematic Study List</h3>
          <button class="btn btn-ghost btn-sm" id="close-study-btn">✕ Close</button>
        </div>
        <div id="study-list-content" class="report-content card"></div>
      </div>
    </div>`;

    loadVocabList();

    document.getElementById('translate-btn').onclick = doTranslate;
    document.getElementById('clear-btn').onclick = () => {
        document.getElementById('translate-input').value = '';
        document.getElementById('translation-result').classList.add('hidden');
    };
    document.getElementById('translate-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.metaKey) doTranslate();
    });
    document.getElementById('study-list-btn').onclick = loadStudyList;
    document.getElementById('close-study-btn').onclick = () => {
        document.getElementById('study-list-modal').classList.add('hidden');
    };
}

window.insertChar = (char) => {
    const ta = document.getElementById('translate-input');
    const pos = ta.selectionStart;
    ta.value = ta.value.slice(0, pos) + char + ta.value.slice(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = pos + 1;
    ta.focus();
};

async function doTranslate() {
    const text = document.getElementById('translate-input').value.trim();
    if (!text) return;
    const btn = document.getElementById('translate-btn');
    btn.disabled = true; btn.textContent = 'Translating…';

    try {
        const result = await api.vocab.translate({
            text,
            source_lang: document.getElementById('src-lang').value,
            target_lang: document.getElementById('tgt-lang').value,
            context: document.getElementById('translate-context').value,
            save: true,
        });

        if (!result.translation) {
            throw new Error("AI could not translate this text. Please try again.");
        }

        document.getElementById('translation-text').textContent = result.translation;
        document.getElementById('translation-notes').textContent = result.notes || '';
        document.getElementById('translation-example').textContent = result.example || '';
        document.getElementById('translation-result').classList.remove('hidden');
        loadVocabList();
        toast('Saved to vocab log ✓', 'success');
    } catch (e) {
        toast('Translation failed: ' + e.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Translate';
    }
}

async function loadVocabList() {
    const el = document.getElementById('vocab-list');
    showLoading(el, 'Loading vocab…');
    try {
        const entries = await api.vocab.list();
        if (!entries.length) { showEmpty(el, '📖', 'No vocab entries yet. Start translating!'); return; }
        el.innerHTML = `
      <div style="overflow-x:auto">
        <table class="vocab-table">
          <thead><tr>
            <th>Word / Phrase</th><th>Translation</th><th>Date</th><th></th>
          </tr></thead>
          <tbody>
            ${entries.map(e => `
              <tr>
                <td><strong>${e.source_text}</strong>
                  ${e.context_sentence ? `<div class="text-sm text-muted">${e.context_sentence}</div>` : ''}
                </td>
                <td>${e.translated_text || ''}
                  ${e.example_sentence ? `<div class="text-sm" style="font-style:italic;color:var(--accent2)">${e.example_sentence}</div>` : ''}
                </td>
                <td class="text-sm text-muted">${fmtDate(e.created_at)}</td>
                <td><button class="btn-icon btn-ghost" onclick="deleteVocab(${e.id})" title="Delete">🗑️</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    } catch (e) {
        el.innerHTML = `<div class="text-muted text-sm">Error loading vocab</div>`;
    }
}

window.deleteVocab = async (id) => {
    if (!confirm('Delete this entry?')) return;
    try {
        await api.vocab.delete(id);
        loadVocabList();
        toast('Deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
};

async function loadStudyList() {
    const modal = document.getElementById('study-list-modal');
    const content = document.getElementById('study-list-content');
    modal.classList.remove('hidden');
    content.innerHTML = `<div class="loading"><div class="spinner"></div><p>Gemini is organising your vocab…</p></div>`;
    try {
        const { study_list } = await api.vocab.studyList();
        const { md } = await import('../utils.js');
        content.innerHTML = md(study_list);
    } catch (e) {
        content.innerHTML = `<p class="text-muted">Error: ${e.message}</p>`;
    }
}
