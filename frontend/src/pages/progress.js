import { api } from '../api.js';
import { toast, fmtDate, md } from '../utils.js';

export async function renderProgress(container) {
    container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="flex items-center justify-between">
          <div>
            <h2>📊 My Progress</h2>
            <p>AI assessment based on all your lessons and goals.</p>
          </div>
          <button class="btn btn-primary" id="generate-report-btn">✨ Generate Report</button>
        </div>
      </div>

      <div class="grid grid-4 mb-24" id="stats-bar" style="gap:12px;margin-bottom:20px"></div>

      <div class="grid grid-2" style="gap:24px;align-items:start">
        <!-- Report area -->
        <div style="grid-column: span 2" id="report-area">
          <div class="card text-center" style="padding:48px;color:var(--text-muted)">
            <div style="font-size:3rem;margin-bottom:12px">📈</div>
            <p>Click <strong>Generate Report</strong> for an AI assessment against your goals.</p>
            <p class="text-sm mt-8" style="margin-top:8px">Reads all lesson summaries + your <code>GOALS.md</code> file.</p>
          </div>
        </div>
      </div>

      <!-- Past reports -->
      <div class="section-header mt-32 mb-12" style="margin-top:28px;margin-bottom:12px">
        <h3>🕐 Past Reports</h3>
      </div>
      <div id="reports-history"></div>
    </div>`;

    loadStats();
    loadReportHistory();
    document.getElementById('generate-report-btn').onclick = generateReport;
}

async function loadStats() {
    const bar = document.getElementById('stats-bar');
    if (!bar) return;
    try {
        const s = await api.teacher.stats();
        const v = await api.vocab.stats();
        bar.innerHTML = [
            ['📖', s.lesson_count, 'Lessons'],
            ['📝', s.transcript_count, 'Transcripts'],
            ['🃏', v.due_today, 'Cards Due'],
            ['🔤', s.vocab_count, 'Vocab Entries'],
        ].map(([icon, val, label]) => `
            <div class="card text-center" style="padding:16px">
              <div style="font-size:1.6rem">${icon}</div>
              <div style="font-size:1.8rem;font-weight:700;margin:4px 0">${val}</div>
              <div class="text-sm text-dim">${label}</div>
            </div>
        `).join('');
    } catch {}
}

async function loadReportHistory() {
    const el = document.getElementById('reports-history');
    if (!el) return;
    try {
        const reports = await api.teacher.reports();
        if (!reports.length) {
            el.innerHTML = '<p class="text-muted text-sm">No reports generated yet.</p>';
            return;
        }
        el.innerHTML = reports.map(r => `
            <div class="card mb-8" style="cursor:pointer;padding:12px 16px" onclick="window._viewReport(${r.id})">
              <div class="flex justify-between items-center">
                <div>
                  <div class="text-sm font-bold">${fmtDate(r.created_at)}</div>
                  <div class="text-sm text-muted" style="margin-top:4px">${r.preview.replace(/[#*]/g, '').slice(0, 120)}…</div>
                </div>
                <span class="text-dim" style="font-size:1.2rem">›</span>
              </div>
            </div>`).join('');
    } catch {}
}

window._viewReport = async (id) => {
    const area = document.getElementById('report-area');
    if (!area) return;
    area.innerHTML = '<div class="loading" style="justify-content:center"><div class="spinner"></div></div>';
    try {
        const res = await api.teacher.getReport(id);
        renderReportContent(area, res);
    } catch (e) { toast(e.message, 'error'); }
};

async function generateReport() {
    const area = document.getElementById('report-area');
    const btn = document.getElementById('generate-report-btn');
    if (!area || !btn) return;

    btn.disabled = true;
    btn.textContent = '⏳ Analysing…';
    area.innerHTML = `
      <div class="card text-center" style="padding:48px">
        <div class="loading" style="justify-content:center"><div class="spinner"></div></div>
        <p class="text-muted mt-16" style="margin-top:16px">Reading lessons and goals…<br>
        <span class="text-sm">This may take 15–30 seconds.</span></p>
      </div>`;

    try {
        const res = await api.teacher.report();
        renderReportContent(area, res);
        loadReportHistory(); // Refresh past reports list
    } catch (e) {
        area.innerHTML = `<div class="card" style="padding:24px;border-color:var(--red);color:var(--red)">Error: ${e.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '✨ Generate Report';
    }
}

function renderReportContent(area, res) {
    const reportDate = fmtDate(res.generated_at);
    area.innerHTML = `
      <div class="flex justify-between items-center mb-12" style="margin-bottom:12px">
        <div class="text-sm text-dim">Generated ${reportDate}</div>
        <button class="btn btn-ghost btn-sm" onclick="window._generateNewReport()">↻ New Report</button>
      </div>
      <div class="card report-content" style="padding:24px 28px;line-height:1.75">
        ${md(res.report)}
      </div>`;
    window._generateNewReport = generateReport;
}
