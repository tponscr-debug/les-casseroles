// Les Casseroles — détection des noms : UNE regex alternée au lieu de N indexOf.
// Mesuré (599 noms, 30 000 nœuds texte) : 1268 ms -> 135 ms.
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});
    const { normalize } = NS.text;

    const COMBINING_CHAR = /[̀-ͯ]/;
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

    // Noms (déjà normalisés) -> regex. Plus longs d'abord : le nom complet gagne.
    const buildMatcher = (keys) => {
        const sorted = [...keys].filter(Boolean).sort((a, b) => b.length - a.length);
        if (sorted.length === 0) return null;
        return new RegExp(
            '(?<![\\p{L}\\p{N}])(?:' + sorted.map(escapeRegExp).join('|') + ')(?![\\p{L}\\p{N}])', 'gu');
    };

    // Plie le texte en gardant la correspondance d'indices (texte décomposé NFD, ligatures…).
    const foldWithMap = (text) => {
        let folded = '';
        const map = [];
        for (let i = 0; i < text.length; i++) {
            const piece = normalize(text[i]);
            for (let j = 0; j < piece.length; j++) map.push(i);
            folded += piece;
        }
        return { folded, map };
    };

    // -> [{ start, end }] sur le texte ORIGINAL (indices utilisables avec slice).
    const findMatches = (regex, text) => {
        if (!regex || !text) return [];
        let folded = normalize(text);
        let map = null;
        if (folded.length !== text.length) ({ folded, map } = foldWithMap(text));

        const out = [];
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(folded)) !== null) {
            let start = map ? map[m.index] : m.index;
            let end = map ? map[m.index + m[0].length - 1] + 1 : m.index + m[0].length;
            while (end < text.length && COMBINING_CHAR.test(text[end])) end++;   // accent combinant final
            out.push({ start, end });
        }
        return out;
    };

    NS.matcher = { buildMatcher, findMatches };
})();
