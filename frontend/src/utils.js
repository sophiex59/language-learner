// Toast notification helper
export function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

// Format seconds -> mm:ss
export function fmtTime(secs) {
    if (!secs) return '';
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Format ISO date -> readable
export function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Simple markdown-to-HTML (bold, headings, lists, line breaks)
export function md(text) {
    if (!text) return '';
    return text
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
}

// Create DOM element with optional attributes/children
export function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v);
    }
    children.forEach(c => {
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else if (c) e.appendChild(c);
    });
    return e;
}

// Loading state helper
export function showLoading(container, msg = 'Loading...') {
    container.innerHTML = `<div class="loading"><div class="spinner"></div><p>${msg}</p></div>`;
}

export function showEmpty(container, icon, msg) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${msg}</p></div>`;
}

// Language display helpers
export const LANG_NAMES = { de: 'German', en: 'English', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', ru: 'Russian', ar: 'Arabic', pl: 'Polish', sv: 'Swedish' };
export const LANG_FLAGS = { de: '🇩🇪', en: '🇬🇧', fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹', pt: '🇵🇹', nl: '🇳🇱', ja: '🇯🇵', zh: '🇨🇳', ko: '🇰🇷', ru: '🇷🇺', ar: '🇸🇦' };
