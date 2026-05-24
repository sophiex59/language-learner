import { api } from '../api.js';
import { toast, showLoading, showEmpty } from '../utils.js';

export async function renderTextbooks(container, textbookId = null) {
    if (textbookId) {
        renderTextbookView(container, textbookId);
        return;
    }

    container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="flex items-center justify-between">
          <div>
            <h2>📚 Textbooks</h2>
            <p>Your library of PDFs and audio materials.</p>
          </div>
          <div class="flex gap-8">
            <button class="btn btn-secondary" id="scan-tb-btn">Scan Directory</button>
          </div>
        </div>
      </div>

      <div class="card mb-32" style="background: var(--surface2);">
        <p class="text-sm">💡 <strong>Tip:</strong> Drop your PDF files into <code>backend/data/textbooks/</code> and click "Scan Directory".</p>
      </div>

      <div id="textbooks-list"></div>
    </div>`;

    document.getElementById('scan-tb-btn').onclick = async () => {
        const btn = document.getElementById('scan-tb-btn');
        btn.disabled = true;
        btn.textContent = 'Scanning...';
        try {
            const res = await api.textbooks.scan();
            toast(`Scan complete! Added ${res.count} books.`, 'success');
            loadTextbooksList();
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Scan Directory';
        }
    };

    loadTextbooksList();
}

async function loadTextbooksList() {
    const container = document.getElementById('textbooks-list');
    showLoading(container, 'Loading library...');
    try {
        const textbooks = await api.textbooks.list();
        if (!textbooks.length) {
            showEmpty(container, '📚', 'No textbooks found yet. Drop PDFs into the data/textbooks folder.');
            return;
        }

        container.innerHTML = `
      <div class="grid grid-3">
        ${textbooks.map(t => `
          <div class="card" style="cursor: pointer;" onclick="window.navigateTo('textbooks', ${t.id})">
            <div class="flex items-start gap-12">
              <div style="font-size: 2rem;">📘</div>
              <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px;">${t.title}</div>
                <div class="text-sm text-dim">${t.page_count} pages • ${t.language.toUpperCase()}</div>
                ${t.nickname ? `<div class="badge badge-blue mt-8" style="margin-top: 8px;">🏷️ ${t.nickname}</div>` : ''}
              </div>
              <div class="status-indicator">
                ${t.indexed ? '✅' : '⏳'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function renderTextbookView(container, id) {
    showLoading(container, 'Opening textbook...');
    try {
        const tb = await api.textbooks.get(id);

        container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <button class="btn btn-ghost mb-20" onclick="window.navigateTo('textbooks')">← Back to Library</button>
          <div class="flex items-center justify-between">
            <div>
              <h2 style="margin:0">${tb.title}</h2>
              <div class="flex items-center gap-8 mt-8">
                <span class="text-sm text-dim">Nickname:</span>
                <input class="form-input" id="tb-nickname-input" value="${tb.nickname || ''}" placeholder="e.g. Kursbuch" style="width: 140px; padding: 4px 8px; height: auto;">
                <button class="btn btn-primary btn-sm" id="save-nickname-btn">Save</button>
              </div>
            </div>
            <div class="flex gap-8">
              <button class="btn btn-secondary btn-sm" id="reindex-btn">Re-index</button>
            </div>
          </div>
        </div>

        <div class="grid grid-3" style="gap: 24px; align-items: start;">
          <div style="grid-column: span 2;">
            <div class="card mb-24">
              <div class="form-group">
                <label class="form-label">Search in pages</label>
                <div class="flex gap-8">
                  <input class="form-input" id="search-input" placeholder="Enter word or phrase...">
                  <button class="btn btn-primary" id="search-btn">Search</button>
                </div>
              </div>
            </div>

            <div id="search-results-area"></div>

            <div class="section-header mt-32">
              <h3>📄 Browse Pages</h3>
            </div>
            <div class="pages-grid" id="pages-container"></div>
          </div>

          <div>
            <div class="section-header">
              <h3>🎵 Audio Material</h3>
            </div>
            <div id="tb-audio-list"></div>
            
            <button class="btn btn-secondary btn-sm w-100 mt-12" id="link-audio-btn" style="width: 100%;">Link Audio Files</button>
          </div>
        </div>
      </div>`;

        document.getElementById('search-btn').onclick = () => doSearch(id);
        document.getElementById('search-input').onkeydown = (e) => e.key === 'Enter' && doSearch(id);
        document.getElementById('reindex-btn').onclick = async () => {
            toast('Re-indexing textbook...', 'info');
            await api.textbooks.reindex(id);
            renderTextbookView(container, id);
        };

        document.getElementById('save-nickname-btn').onclick = async () => {
            const nickname = document.getElementById('tb-nickname-input').value.trim();
            try {
                await api.textbooks.patch(id, { nickname });
                toast('Nickname updated!', 'success');
            } catch (e) {
                toast(e.message, 'error');
            }
        };

        loadPages(id, tb.page_count);
        loadAudio(id);

    } catch (e) {
        toast(e.message, 'error');
    }
}

function loadPages(id, count) {
    const container = document.getElementById('pages-container');
    // Load first 20 pages
    const limit = Math.min(count, 50);
    container.innerHTML = Array.from({ length: limit }, (_, i) => i + 1).map(p => `
    <div class="page-thumb" onclick="window.viewPage(${id}, ${p})">
      <img src="${api.textbooks.thumbnailUrl(id, p)}" loading="lazy">
      <div class="page-num">Page ${p}</div>
    </div>
  `).join('');
}

async function doSearch(id) {
    const q = document.getElementById('search-input').value.trim();
    if (!q) return;
    const resultsArea = document.getElementById('search-results-area');
    resultsArea.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const { results } = await api.textbooks.search(id, q);
        if (!results.length) {
            resultsArea.innerHTML = '<div class="card p-20 text-muted">No matches found.</div>';
            return;
        }
        resultsArea.innerHTML = results.map(r => `
      <div class="card mb-12 flex gap-12 items-center" style="margin-bottom: 12px; cursor: pointer;" onclick="window.viewPage(${id}, ${r.page_number})">
        <img src="${api.textbooks.thumbnailUrl(id, r.page_number)}" style="width: 60px; height: 80px; object-fit: cover; border-radius: 4px;">
        <div>
          <div class="text-sm font-bold mb-4">Page ${r.page_number}</div>
          <div class="text-sm text-muted">${r.snippet}</div>
        </div>
      </div>
    `).join('');
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function loadAudio(id) {
    const el = document.getElementById('tb-audio-list');
    try {
        const audio = await api.textbooks.listAudio(id);
        if (!audio.length) {
            el.innerHTML = '<p class="text-sm text-dim italic">No audio linked.</p>';
            return;
        }
        el.innerHTML = audio.map(a => `
      <div class="card mb-8 p-12" style="background: var(--surface2); margin-bottom: 8px; padding: 12px;">
        <div class="flex items-center justify-between gap-12">
          <div class="text-sm truncate" style="flex: 1;">
            <strong>${a.chapter || 'Audio'}</strong><br>
            <span class="text-dim">${a.filename}</span>
          </div>
          <button class="btn btn-icon btn-sm" onclick="playAudio('${a.filename}')">▶️</button>
        </div>
      </div>
    `).join('');
    } catch (e) { }
}

window.playAudio = (filename) => {
    const url = `http://localhost:8000/static/textbook_audio/${filename}`;
    const audio = new Audio(url);
    audio.play();
    toast('Playing audio...', 'info');
};

window.viewPage = (id, num) => {
    window.open(`${api.textbooks.thumbnailUrl(id, num)}`, '_blank');
};
