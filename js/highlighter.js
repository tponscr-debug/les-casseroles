// Les Casseroles — surlignage des noms dans la page.
// Perf : une regex unique ; on ne scanne que les nœuds AJOUTÉS ; on ignore nos propres mutations.
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});
    const { state } = NS.data;
    const { normalize } = NS.text;
    const { buildMatcher, findMatches } = NS.matcher;
    const ui = NS.ui;
    const ctx = NS.context;

    const OURS = '#casseroles-host, .casseroles-rough-highlight';
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);
    const DEBOUNCE_MS = 400;

    let regex = null, observer = null, timer = null, watchdog = null;
    const pending = new Set();   // racines ajoutées au DOM depuis le dernier passage
    const seen = new Set();      // mode "une seule fois par page"

    const rebuild = () => { regex = buildMatcher([...state.map.keys()]); };
    const countHighlights = () => document.querySelectorAll('.casseroles-rough-highlight').length;
    const report = () => {
        if (!ctx.check()) return;
        try { chrome.runtime.sendMessage({ action: 'setBadge', count: countHighlights() }).catch(() => {}); } catch { ctx.check(); }
    };

    const isOurs = (node) => {
        const el = node.nodeType === 1 ? node : node.parentElement;
        return !!(el && el.closest && el.closest(OURS));
    };

    const makeSpan = (matched) => {
        const span = document.createElement('span');
        span.className = 'casseroles-rough-highlight';
        span.textContent = matched;
        span.dataset.name = matched;
        span.tabIndex = 0;
        span.setAttribute('role', 'button');
        span.setAttribute('aria-haspopup', 'dialog');
        span.addEventListener('mouseenter', (e) => ui.showFloat(e.currentTarget, matched));
        span.addEventListener('focus', (e) => ui.showFloat(e.currentTarget, matched));
        span.addEventListener('mouseleave', () => ui.hideFloat());
        span.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ui.openModal(matched); } });
        span.addEventListener('click', (e) => {
            if (span.closest('a')) return;          // nom dans un lien : le lien reste cliquable, la bulle ouvre la fiche
            e.stopPropagation();
            ui.openModal(matched);
        });
        return span;
    };

    const processTextNode = (node) => {
        const text = node.nodeValue;
        if (!regex || !text || text.trim().length < 4) return;
        let matches = findMatches(regex, text);
        if (matches.length === 0) return;

        const parent = node.parentElement;
        if (!parent || SKIP.has(parent.nodeName) || parent.isContentEditable || isOurs(node)) return;

        if (state.firstOnly) {
            matches = matches.filter(({ start, end }) => {
                const key = normalize(text.slice(start, end));
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            if (matches.length === 0) return;
        }

        const frag = document.createDocumentFragment();
        let last = 0;
        for (const { start, end } of matches) {
            if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
            frag.appendChild(makeSpan(text.slice(start, end)));
            last = end;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
    };

    const scan = (root) => {
        if (!state.enabled || !regex || !root || !root.isConnected || !ctx.check()) return;
        if (root.nodeType === Node.TEXT_NODE) return processTextNode(root);
        if (root.nodeType !== Node.ELEMENT_NODE || isOurs(root)) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => (n.parentNode && SKIP.has(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        const nodes = [];                       // snapshot avant de modifier le DOM
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(processTextNode);
    };

    const flush = () => {
        timer = null;
        if (!ctx.check()) return;
        const roots = [...pending];
        pending.clear();
        roots.forEach(scan);
        if (observer) observer.takeRecords();   // jette les mutations que NOUS venons de provoquer
        report();
    };

    const onMutations = (mutations) => {
        if (!state.enabled || !ctx.check()) return;
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if ((n.nodeType === 1 || n.nodeType === 3) && !isOurs(n)) pending.add(n);
            }
        }
        if (pending.size && !timer) timer = setTimeout(flush, DEBOUNCE_MS);
    };

    const enable = () => {
        if (!document.body || !ctx.check()) return;
        scan(document.body);
        if (observer) observer.takeRecords();
        report();
    };

    const disable = () => {
        clearTimeout(timer); timer = null; pending.clear(); seen.clear();
        document.querySelectorAll('.casseroles-rough-highlight').forEach((span) => span.replaceWith(document.createTextNode(span.textContent)));
        ui.hideFloat(true);
        ui.closeModal();
        report();
    };

    // Contexte invalidé (extension rechargée) : on retire nos surlignages et nos observateurs, sans AUCUN appel chrome.*.
    const teardown = () => {
        clearTimeout(timer); timer = null; clearInterval(watchdog); watchdog = null;
        pending.clear(); seen.clear();
        if (observer) { observer.disconnect(); observer = null; }
        document.querySelectorAll('.casseroles-rough-highlight').forEach((span) => span.replaceWith(document.createTextNode(span.textContent)));
    };
    ctx.onDead(teardown);

    const init = () => {
        if (!ctx.check()) return;
        watchdog = setInterval(ctx.check, 3000);       // repère un orphelin même sur une page immobile
        rebuild();
        observer = new MutationObserver(onMutations);
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
        if (state.enabled) enable();
    };

    NS.highlighter = { init, enable, disable, count: countHighlights, rebuild };
})();
