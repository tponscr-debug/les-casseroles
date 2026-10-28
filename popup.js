// Les Casseroles — popup « mini-ticket ». Micro-textes : js/copy.js (mode drôle / sérieux).

const NS = globalThis.Casseroles;
const $ = (id) => document.getElementById(id);
const el = {
    toggleBtn: $('toggle-btn'), toggleLabel: $('toggle-label'), pageText: $('page-text'), pageDot: $('page-dot'),
    statPage: $('stat-page'), statTotal: $('stat-politicians'), firstOnly: $('first-only'), serious: $('serious-mode'),
    siteState: $('site-state'), siteWhy: $('site-why'), siteBtn: $('site-btn'), lblSite: $('lbl-site'),
    freshness: $('freshness'), brand: $('brand'), sub: $('sub'), lblPage: $('lbl-page'), lblTotal: $('lbl-total'), thanks: $('thanks'),
};
const state = { enabled: true, humor: 'funny', pageCount: null, reachable: null, site: null };

const animateCounter = (node, target, duration = 700) => {
    if (!target) { node.textContent = '0'; return; }
    const start = performance.now();
    const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        node.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
};

// Un onglet sans script de contenu (page chrome://, nouvel onglet, Web Store…) répond par une erreur de connexion :
// c'est normal, on la lit pour qu'elle ne remonte pas comme « Unchecked runtime.lastError ».
const sendToTab = (msg, cb = () => {}) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, msg, (res) => { void chrome.runtime.lastError; cb(res); });
});

// Tout le texte visible dépend du mode : une seule fonction le recalcule.
const render = () => {
    const C = NS.copy.get(state.humor), P = C.popup;
    el.brand.textContent = C.brand;
    el.sub.textContent = C.sub;
    el.lblPage.textContent = P.pageLabel;
    el.lblTotal.textContent = P.totalLabel;
    el.thanks.textContent = P.thanks;
    el.toggleBtn.className = `toggle-btn ${state.enabled ? 'on' : 'off'}`;
    el.toggleLabel.textContent = state.enabled ? P.on : P.off;
    // Bloc « ce site » : exclu d'office (jeu, streaming…), par l'utilisateur, ou actif.
    const S = state.site;
    el.siteBtn.hidden = !S;
    if (S) {
        el.lblSite.textContent = P.siteLabel;
        el.siteState.textContent = S.excluded ? P.siteOff : P.siteOn;
        el.siteWhy.textContent = S.excluded ? `${S.host} · ${P.why[S.reason] || ''}` : S.host;
        el.siteBtn.textContent = S.excluded ? P.btnAllow : P.btnExclude;
    }
    if (!state.enabled) { el.pageText.textContent = P.off_text; el.pageDot.classList.add('inactive'); return; }
    if (S && S.excluded) { el.pageText.textContent = P.excluded; el.pageDot.classList.add('inactive'); return; }
    if (state.reachable === false) el.pageText.textContent = P.inactive;
    else if (state.pageCount === null) el.pageText.textContent = P.idle;
    else el.pageText.textContent = state.pageCount > 0 ? P.count(state.pageCount) : P.none;
    el.pageDot.classList.toggle('inactive', !(state.pageCount > 0));
};

chrome.storage.local.get(['enabled', 'firstOnly', 'humor'], (r) => {
    state.enabled = r.enabled !== false;
    state.humor = r.humor === 'serious' ? 'serious' : 'funny';
    el.firstOnly.checked = r.firstOnly === true;
    el.serious.checked = state.humor === 'serious';
    render();
});

sendToTab({ action: 'getStats' }, (res) => {
    if (chrome.runtime.lastError || !res) { state.reachable = false; el.statPage.textContent = '—'; return render(); }
    state.reachable = true;
    state.pageCount = res.count;
    state.site = { host: res.host, excluded: res.excluded, reason: res.reason };
    animateCounter(el.statTotal, res.total, 600);
    animateCounter(el.statPage, res.count, 800);
    if (res.verifiedAt) el.freshness.textContent = `Données vérifiées le ${new Date(res.verifiedAt).toLocaleDateString('fr-FR')}`;
    render();
});

el.toggleBtn.addEventListener('click', () => {
    state.enabled = !state.enabled;
    chrome.storage.local.set({ enabled: state.enabled });
    sendToTab({ action: 'toggle', enabled: state.enabled });
    if (!state.enabled) animateCounter(el.statPage, 0, 400);
    render();
});

el.firstOnly.addEventListener('change', () => {
    chrome.storage.local.set({ firstOnly: el.firstOnly.checked });
    sendToTab({ action: 'setFirstOnly', firstOnly: el.firstOnly.checked });
});

el.serious.addEventListener('change', () => {
    state.humor = el.serious.checked ? 'serious' : 'funny';
    chrome.storage.local.set({ humor: state.humor });
    sendToTab({ action: 'setHumor', humor: state.humor });
    render();
});

el.siteBtn.addEventListener('click', () => {
    if (!state.site) return;
    sendToTab({ action: 'setSite', mode: state.site.excluded ? 'allow' : 'exclude' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        state.site = { host: res.host, excluded: res.excluded, reason: res.reason };
        state.pageCount = res.count;
        animateCounter(el.statPage, res.count, 500);
        render();
    });
});
