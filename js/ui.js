// Les Casseroles — interface : bulle « ticket » + fiche « L'Addition », isolées dans un Shadow DOM.
// Le CSS du site hôte ne peut pas casser l'UI, et nos styles ne fuient pas dans la page.
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});
    const { state } = NS.data;
    const { renderModal } = NS.render;
    const { bubble: bubbleText } = NS.copy;

    const REPO = 'https://github.com/tponscr-debug/les-casseroles';
    let host = null, root = null, bubble = null, stub = null, modal = null, lastFocus = null;

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
        modal.setAttribute('aria-label', 'Dossier');

        // Enveloppe (ombre portée) + ticket (bord dentelé) : le masque d'un élément coupe sa propre ombre.
        bubble = Object.assign(document.createElement('div'), { id: 'casseroles-float-bubble' });
        bubble.setAttribute('role', 'button');
        bubble.tabIndex = 0;
        stub = Object.assign(document.createElement('span'), { className: 'stub' });
        bubble.appendChild(stub);

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
        stub.textContent = bubbleText(state.humor, name);
        bubble.style.display = 'block';
        const bw = bubble.offsetWidth;
        const rect = element.getBoundingClientRect();
        const left = Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, window.innerWidth - bw - 8));
        bubble.style.left = `${left}px`;
        bubble.style.top = `${Math.max(8, rect.top - 52)}px`;
    };

    const hideFloat = (force = false) => {
        if (!bubble) return;
        if (force) { bubble.style.display = 'none'; return; }
        setTimeout(() => { if (bubble && !bubble.matches(':hover')) bubble.style.display = 'none'; }, 300);
    };

    const isOpen = () => !!modal && modal.classList.contains('open');

    const closeModal = () => {
        if (!isOpen()) return;
        modal.classList.remove('open');
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
        modal.innerHTML = `<div class="receipt">${renderModal(name, entry, { humor: state.humor, meta: state.meta, reportUrl })}</div>`;
        modal.classList.remove('open');
        void modal.offsetWidth;                   // relance l'animation d'impression
        modal.classList.add('open');
        const close = root.getElementById('casseroles-close-btn');
        close.addEventListener('click', closeModal);
        close.focus();
    };

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    document.addEventListener('click', (e) => {
        const path = e.composedPath();
        if (host && path.includes(host)) return;
        if (path.some((n) => n.classList && n.classList.contains('casseroles-rough-highlight'))) return;
        hideFloat(true);
        closeModal();
    });

    NS.ui = { showFloat, hideFloat, openModal, closeModal, isOpen };
})();
