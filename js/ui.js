// Les Casseroles — interface : bulle + modale, isolées dans un Shadow DOM.
// Le CSS du site hôte ne peut plus casser l'UI, et nos styles ne fuient plus dans la page.
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});
    const { state } = NS.data;
    const { renderModal } = NS.render;

    const REPO = 'https://github.com/tponscr-debug/les-casseroles';
    let host = null, root = null, bubble = null, modal = null, lastFocus = null;

    const ensureHost = () => {
        if (host) return;
        host = document.createElement('div');
        host.id = 'casseroles-host';
        host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;';
        root = host.attachShadow({ mode: 'open' });
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = chrome.runtime.getURL('ui.css');
        modal = Object.assign(document.createElement('div'), { id: 'casseroles-modal' });
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-label', 'Casseroles');
        bubble = Object.assign(document.createElement('div'), { id: 'casseroles-float-bubble', textContent: '🍳 Voir les casseroles' });
        bubble.setAttribute('role', 'button');
        bubble.tabIndex = 0;
        root.append(css, bubble, modal);
        (document.body || document.documentElement).appendChild(host);

        const open = () => bubble.dataset.name && openModal(bubble.dataset.name);
        bubble.addEventListener('click', (e) => { e.stopPropagation(); open(); });
        bubble.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    };

    const showFloat = (element, name) => {
        if (!state.enabled) return;
        ensureHost();
        bubble.dataset.name = name;
        bubble.style.display = 'block';
        const bw = bubble.offsetWidth;
        const rect = element.getBoundingClientRect();
        const left = Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, window.innerWidth - bw - 8));
        bubble.style.left = `${left}px`;
        bubble.style.top = `${Math.max(8, rect.top - 48)}px`;
    };

    const hideFloat = (force = false) => {
        if (!bubble) return;
        if (force) { bubble.style.display = 'none'; return; }
        setTimeout(() => { if (bubble && !bubble.matches(':hover')) bubble.style.display = 'none'; }, 300);
    };

    const closeModal = () => {
        if (!modal || modal.style.display === 'none' || !modal.style.display) return;
        modal.style.opacity = '0';
        modal.style.transform = 'translate(-50%, -50%) scale(0.95)';
        setTimeout(() => { if (modal) modal.style.display = 'none'; }, 200);
        hideFloat(true);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    };

    const openModal = (name) => {
        const entry = state.map.get(NS.text.normalize(name));
        if (!entry) return;
        ensureHost();
        lastFocus = document.activeElement;
        const reportUrl = `${REPO}/issues/new?title=${encodeURIComponent(`Signalement : ${name}`)}` +
            `&body=${encodeURIComponent('Décrivez l\'erreur ou l\'omission, avec un lien vers une source (décision de justice, article).')}`;
        modal.innerHTML = renderModal(name, entry, { potUrl: chrome.runtime.getURL('casserole_v3.png'), meta: state.meta, reportUrl });
        modal.style.display = 'flex';
        modal.style.opacity = '0';
        modal.style.transform = 'translate(-50%, -50%) scale(0.95)';
        requestAnimationFrame(() => { modal.style.opacity = '1'; modal.style.transform = 'translate(-50%, -50%) scale(1)'; });
        const close = root.getElementById('casseroles-close-btn');
        close.addEventListener('click', closeModal);
        close.focus();
    };

    // Échap ferme ; clic hors UI ferme.
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    document.addEventListener('click', (e) => {
        const path = e.composedPath();
        if (host && path.includes(host)) return;
        if (path.some((n) => n.classList && n.classList.contains('casseroles-rough-highlight'))) return;
        hideFloat(true);
        closeModal();
    });

    NS.ui = { showFloat, hideFloat, openModal, closeModal, isOpen: () => !!modal && modal.style.display === 'flex' };
})();
