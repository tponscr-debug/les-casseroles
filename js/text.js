// Les Casseroles — helpers texte (normalisation, casse, échappement).
// Aucun accès DOM ni réseau : testable sous Node.
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});

    const COMBINING = /[̀-ͯ]/g;
    const PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'van', 'von', 'der', 'el']);
    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    // Minuscule sans accents — pour COMPARER uniquement.
    const normalize = (str) => str.normalize('NFD').replace(COMBINING, '').toLowerCase();

    // « ÉLISABETH borne » -> « Élisabeth Borne » ; gère accents, tirets, apostrophes, particules.
    const toTitleCase = (str) => String(str).toLowerCase().split(' ').map((word, i) =>
        (i > 0 && PARTICLES.has(word))
            ? word
            : word.replace(/(^|[-'’])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
    ).join(' ');

    // Toute donnée distante affichée via innerHTML DOIT passer ici.
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

    // Liens issus des données : https uniquement (jamais javascript:, data:, http:).
    const safeUrl = (url) => (/^https:\/\//i.test(String(url ?? '')) ? String(url) : '');

    NS.text = { normalize, toTitleCase, escapeHtml, safeUrl };
})();
