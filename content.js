// Les Casseroles — content script (colle les modules : text, matcher, data, sites, copy, context, ui-render, ui, highlighter).
(async () => {
    const { data, highlighter, sites } = globalThis.Casseroles;
    const { state } = data;
    const host = location.hostname;
    let booted = false;
    let site = { excluded: false, reason: 'active' };
    let lists = { sitesAllowed: [], sitesExcluded: [] };

    // Sur un site exclu on ne charge RIEN (ni données, ni observateur) : aucun coût sur un jeu ou un lecteur vidéo.
    const apply = async () => {
        state.excluded = site.excluded;
        if (site.excluded) { if (booted) highlighter.disable(); return; }
        if (!booted) { await data.loadPoliticians(); highlighter.init(); booted = true; }
        else if (state.enabled) highlighter.enable();
    };

    const stats = () => ({
        count: booted ? highlighter.count() : 0, total: state.map.size, firstOnly: state.firstOnly, humor: state.humor,
        verifiedAt: state.meta && state.meta.verified_at, host: sites.normalizeHost(host), excluded: site.excluded, reason: site.reason,
    });

    // Les messages (popup) sont écoutés tout de suite : on ne les rate pas pendant le chargement des données.
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg.action === 'toggle') {
            state.enabled = msg.enabled;
            chrome.storage.local.set({ enabled: state.enabled });
            if (booted) { if (state.enabled) highlighter.enable(); else highlighter.disable(); }
        }
        if (msg.action === 'setFirstOnly') {
            state.firstOnly = msg.firstOnly;
            chrome.storage.local.set({ firstOnly: state.firstOnly });
            if (booted) { highlighter.disable(); if (data.isActive()) highlighter.enable(); }
        }
        if (msg.action === 'setHumor') {
            state.humor = msg.humor === 'serious' ? 'serious' : 'funny';
            chrome.storage.local.set({ humor: state.humor });
        }
        if (msg.action === 'setSite') {                          // 'exclude' | 'allow'
            lists = sites.update(lists, host, msg.mode);
            chrome.storage.local.set(lists);
            site = sites.decide(host, lists, document, window);
            apply().then(() => sendResponse(stats()));
            return true;
        }
        if (msg.action === 'getStats') { sendResponse(stats()); return true; }
    });

    const stored = await chrome.storage.local.get(['enabled', 'firstOnly', 'humor', 'sitesAllowed', 'sitesExcluded']);
    state.enabled = stored.enabled !== false;
    state.firstOnly = stored.firstOnly === true;
    state.humor = stored.humor === 'serious' ? 'serious' : 'funny';
    lists = { sitesAllowed: stored.sitesAllowed || [], sitesExcluded: stored.sitesExcluded || [] };
    site = sites.decide(host, lists, document, window);
    await apply();
})();
