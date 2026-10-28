// Les Casseroles — exclusion par site : jeux, streaming, outils… où surligner est inutile et coûteux.
// Ordre de décision : l'utilisateur gagne toujours (réactiver > exclure) ; sinon liste par défaut ; sinon détection d'un jeu.
// Fonctions pures (le document est passé en paramètre) : testables sous Node.
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});

    // Un domaine couvre aussi ses sous-domaines (netflix.com -> www.netflix.com).
    const DEFAULT_EXCLUDED = [
        // vidéo / streaming / audio
        'netflix.com', 'primevideo.com', 'disneyplus.com', 'max.com', 'hbomax.com', 'mycanal.fr', 'canalplus.com',
        'twitch.tv', 'crunchyroll.com', 'tv.apple.com', 'paramountplus.com', 'molotov.tv', 'youtube.com', 'youtu.be',
        'dailymotion.com', 'vimeo.com', 'spotify.com', 'deezer.com',
        // jeux en ligne
        'itch.io', 'poki.com', 'crazygames.com', 'y8.com', 'miniclip.com', 'roblox.com', 'geforcenow.com', 'kongregate.com',
        'newgrounds.com', 'armorgames.com', 'gamejolt.com', 'chess.com', 'lichess.org',
        // outils canvas / création
        'figma.com', 'miro.com',
        // développement local : tes jeux et prototypes
        'localhost', '127.0.0.1', '[::1]',
    ];

    const normalizeHost = (host) => String(host || '').toLowerCase().replace(/^www\./, '');
    const matches = (host, domain) => { const h = normalizeHost(host), d = normalizeHost(domain); return h === d || h.endsWith('.' + d); };
    const isLocalName = (host) => normalizeHost(host).endsWith('.local');

    // Un jeu (ou une scène 3D) : un canvas qui couvre l'écran et presque pas de texte.
    const looksLikeGame = (doc, win) => {
        try {
            const canvases = [...doc.querySelectorAll('canvas')];
            if (canvases.length === 0) return false;
            const screen = (win.innerWidth || 1) * (win.innerHeight || 1);
            const biggest = Math.max(...canvases.map((c) => { const r = c.getBoundingClientRect(); return r.width * r.height; }));
            const textLength = ((doc.body && doc.body.innerText) || '').trim().length;
            return biggest >= 0.6 * screen && textLength < 800;
        } catch { return false; }
    };

    // lists = { sitesAllowed: [], sitesExcluded: [] } (stockés par l'utilisateur)
    const decide = (host, lists, doc, win) => {
        const allowed = (lists && lists.sitesAllowed) || [], excluded = (lists && lists.sitesExcluded) || [];
        if (allowed.some((d) => matches(host, d))) return { excluded: false, reason: 'user-allow' };
        if (excluded.some((d) => matches(host, d))) return { excluded: true, reason: 'user' };
        if (DEFAULT_EXCLUDED.some((d) => matches(host, d)) || isLocalName(host)) return { excluded: true, reason: 'default' };
        if (doc && looksLikeGame(doc, win || globalThis)) return { excluded: true, reason: 'game' };
        return { excluded: false, reason: 'active' };
    };

    // mode : 'exclude' | 'allow'. Renvoie de nouvelles listes (pas de mutation).
    const update = (lists, host, mode) => {
        const h = normalizeHost(host);
        const without = (arr) => (arr || []).filter((d) => normalizeHost(d) !== h);
        const add = (arr) => [...without(arr), h];
        return mode === 'exclude'
            ? { sitesExcluded: add(lists.sitesExcluded), sitesAllowed: without(lists.sitesAllowed) }
            : { sitesAllowed: add(lists.sitesAllowed), sitesExcluded: without(lists.sitesExcluded) };
    };

    NS.sites = { DEFAULT_EXCLUDED, normalizeHost, matches, looksLikeGame, decide, update };
})();
