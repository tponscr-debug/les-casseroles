// Les Casseroles — content script (colle les modules : text, matcher, data, copy, ui-render, ui, highlighter).
(async () => {
    const { data, highlighter } = globalThis.Casseroles;
    const { state } = data;

    const stored = await chrome.storage.local.get(['enabled', 'firstOnly', 'humor']);
    state.enabled = stored.enabled !== false;
    state.firstOnly = stored.firstOnly === true;
    state.humor = stored.humor === 'serious' ? 'serious' : 'funny';

    await data.loadPoliticians();
    highlighter.init();

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg.action === 'toggle') {
            state.enabled = msg.enabled;
            chrome.storage.local.set({ enabled: state.enabled });
            if (state.enabled) highlighter.enable(); else highlighter.disable();
        }
        if (msg.action === 'setFirstOnly') {
            state.firstOnly = msg.firstOnly;
            chrome.storage.local.set({ firstOnly: state.firstOnly });
            highlighter.disable();
            if (state.enabled) highlighter.enable();
        }
        if (msg.action === 'setHumor') {
            state.humor = msg.humor === 'serious' ? 'serious' : 'funny';
            chrome.storage.local.set({ humor: state.humor });
        }
        if (msg.action === 'getStats') {
            sendResponse({ count: highlighter.count(), total: state.map.size, firstOnly: state.firstOnly, humor: state.humor,
                           verifiedAt: state.meta && state.meta.verified_at });
            return true;
        }
    });
})();
