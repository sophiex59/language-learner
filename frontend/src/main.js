import { renderHome } from './pages/home.js';
import { renderTranslation } from './pages/translation.js';
import { renderTextbooks } from './pages/textbooks.js';
import { renderProgress } from './pages/progress.js';
import { renderFlashcards } from './pages/flashcards.js';

const routes = {
    home: renderHome,
    translate: renderTranslation,
    textbooks: renderTextbooks,
    progress: renderProgress,
    flashcards: renderFlashcards,
};

const mainRoot = document.getElementById('main-root');
const navItems = document.querySelectorAll('.nav-item');

window.navigateTo = async (page, params = null) => {
    navItems.forEach(item => item.classList.toggle('active', item.dataset.page === page));
    const renderFn = routes[page];
    if (!renderFn) { window.navigateTo('home'); return; }
    mainRoot.innerHTML = '';
    await renderFn(mainRoot, params);
    window.location.hash = page + (params ? `/${params}` : '');
};

const handleRoute = () => {
    const raw = window.location.hash.slice(1);
    if (!raw) { window.navigateTo('home'); return; }
    const slashIdx = raw.indexOf('/');
    const page   = slashIdx === -1 ? raw : raw.slice(0, slashIdx);
    const params = slashIdx === -1 ? null : raw.slice(slashIdx + 1);
    routes[page] ? window.navigateTo(page, params) : window.navigateTo('home');
};

navItems.forEach(item => { item.onclick = () => window.navigateTo(item.dataset.page); });
window.onhashchange = handleRoute;
window.onload = handleRoute;
