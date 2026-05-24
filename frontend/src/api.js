// Use relative URLs when served by FastAPI; fall back to localhost only for file:// dev
const API = window.location.protocol === 'file:' ? 'http://localhost:8000' : '';

async function request(method, path, body = null, isForm = false) {
    const opts = { method, headers: {} };
    if (body) {
        if (isForm) {
            opts.body = body; // FormData
        } else {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
    }
    const res = await fetch(API + path, opts);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Request failed');
    }
    return res.json();
}

export const api = {
    // Transcripts
    transcripts: {
        list: () => request('GET', '/transcripts/'),
        get: (id) => request('GET', `/transcripts/${id}`),
        create: (form) => request('POST', '/transcripts/', form, true),
        patch: (id, body) => request('PATCH', `/transcripts/${id}`, body),
        delete: (id) => request('DELETE', `/transcripts/${id}`),
        summariseEnglish: (id, ctx) => request('POST', `/transcripts/${id}/summarise-english`, { context: ctx }),
    },
    // Lessons
    lessons: {
        list: () => request('GET', '/lessons/'),
        get: (id) => request('GET', `/lessons/${id}`),
        create: (body) => request('POST', '/lessons/', body),
        createManual: (body) => request('POST', '/lessons/manual', body),
        patch: (id, body) => request('PATCH', `/lessons/${id}`, body),
        delete: (id) => request('DELETE', `/lessons/${id}`),
        summarise: (id) => request('POST', `/lessons/${id}/summarise`),
        detectMetadata: (transcriptId) => request('GET', `/lessons/detect-metadata/${transcriptId}`),
    },
    // Vocab / Translation
    vocab: {
        translate: (body) => request('POST', '/vocab/translate', body),
        list: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return request('GET', `/vocab/${q ? '?' + q : ''}`);
        },
        add: (body) => request('POST', '/vocab/', body),
        patch: (id, body) => request('PATCH', `/vocab/${id}`, body),
        delete: (id) => request('DELETE', `/vocab/${id}`),
        studyList: () => request('GET', '/vocab/study-list'),
        due: (lessonId) => request('GET', `/vocab/due${lessonId ? '?lesson_id=' + lessonId : ''}`),
        review: (id, rating) => request('POST', `/vocab/review/${id}`, { rating }),
        stats: () => request('GET', '/vocab/stats'),
    },
    // Textbooks
    textbooks: {
        scan: () => request('POST', '/textbooks/scan'),
        list: () => request('GET', '/textbooks/'),
        get: (id) => request('GET', `/textbooks/${id}`),
        patch: (id, body) => request('PATCH', `/textbooks/${id}`, body),
        search: (id, q) => request('GET', `/textbooks/${id}/search?q=${encodeURIComponent(q)}`),
        listAudio: (id) => request('GET', `/textbooks/${id}/audio`),
        linkAudio: (id, body) => request('POST', `/textbooks/${id}/audio`, body),
        listAudioFiles: () => request('GET', '/textbooks/audio/files'),
        thumbnailUrl: (tbId, pageNum) => `${API}/textbooks/${tbId}/pages/${pageNum}/thumbnail`,
    },
    // AI Teacher
    teacher: {
        stats: () => request('GET', '/ai-teacher/stats'),
        report: () => request('GET', '/ai-teacher/report'),
        reports: () => request('GET', '/ai-teacher/reports'),
        getReport: (id) => request('GET', `/ai-teacher/reports/${id}`),
        notes: {
            list: () => request('GET', '/ai-teacher/notes'),
            create: (body) => request('POST', '/ai-teacher/notes', body),
            patch: (id, body) => request('PATCH', `/ai-teacher/notes/${id}`, body),
            delete: (id) => request('DELETE', `/ai-teacher/notes/${id}`),
        },
    },
};
