// Les Casseroles — données : règle d'affichage, validation, chargement (cache -> GitHub -> bundle).
// RÈGLE DE FIABILITÉ (miroir de scripts/casseroles_data.py::is_displayable) :
//   une affirmation juridique n'est montrée qu'avec preuve ; une condamnation exige "verified".
(() => {
    const NS = (globalThis.Casseroles = globalThis.Casseroles || {});
    const { normalize } = NS.text;

    const state = { map: new Map(), enabled: true, firstOnly: false, meta: null };
    const LEGAL = new Set(['condamne', 'mis_en_examen', 'renvoye', 'relaxe', 'non_lieu', 'enquete', 'mise_en_cause']);
    const LEGAL_TITLE = /condamn|coupable|relax|acquitt|non-?lieu|mis(e)? en examen|renvoy|inéligib|garde à vue|perquisition|plainte|parquet|enquête|information judiciaire|instruction|procès|tribunal|cassation|sursis|prison|amende|accus|soupçon|mise? en cause|détourn|fraud|corrupt|escroqu|abus de|favoritisme|harcèlement|agression|violence/i;

    const isDisplayable = (item) => {
        if (!item || item.superseded || item.status === 'contexte' || item.type === 'contexte') return false;
        // Données antérieures au schéma v3 (pas de statut) : jamais d'affirmation juridique non vérifiable.
        if (!item.status) return item.type !== 'judiciaire' && !LEGAL_TITLE.test(item.title || '');
        if (item.status === 'condamne') return item.verification === 'verified';
        if (LEGAL.has(item.status)) return item.verification === 'verified' || item.verification === 'sourced';
        return true;
    };

    const affairsOf = (entry) => (entry.timeline || []).filter(isDisplayable);

    const buildMap = (data) => {
        state.map.clear();
        state.meta = data._meta || null;
        for (const [key, entry] of Object.entries(data)) {
            if (key.startsWith('_') || !entry || !Array.isArray(entry.timeline)) continue;
            if (affairsOf(entry).length > 0) state.map.set(normalize(key), entry);
        }
    };

    // Un JSON distant mal formé ne doit jamais écraser un bon cache.
    const isValidEncyclopedia = (data) => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
        const entries = Object.entries(data).filter(([k]) => !k.startsWith('_'));
        return entries.length > 0 && entries.every(([, e]) => e && typeof e === 'object' && Array.isArray(e.timeline));
    };

    const REMOTE_URL = 'https://raw.githubusercontent.com/tponscr-debug/les-casseroles/main/data/encyclopedia.json';
    const CACHE_TTL = 24 * 60 * 60 * 1000;

    const loadPoliticians = async () => {
        const cached = await chrome.storage.local.get(['encyclopediaData', 'encyclopediaCachedAt']);
        const fresh = cached.encyclopediaData && (Date.now() - (cached.encyclopediaCachedAt || 0)) < CACHE_TTL;
        if (fresh && isValidEncyclopedia(cached.encyclopediaData)) return buildMap(cached.encyclopediaData);

        try {
            const resp = await fetch(REMOTE_URL, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (!isValidEncyclopedia(data)) throw new Error('JSON distant invalide');
            await chrome.storage.local.set({ encyclopediaData: data, encyclopediaCachedAt: Date.now() });
            return buildMap(data);
        } catch (e) {
            console.warn('Les Casseroles: données distantes indisponibles :', e.message);
        }
        if (isValidEncyclopedia(cached.encyclopediaData)) return buildMap(cached.encyclopediaData);

        try {
            const data = await (await fetch(chrome.runtime.getURL('data/encyclopedia.json'))).json();
            if (isValidEncyclopedia(data)) buildMap(data);
        } catch (e) {
            console.error('Les Casseroles: impossible de charger les données.', e);
        }
    };

    NS.data = { state, LEGAL, isDisplayable, affairsOf, buildMap, isValidEncyclopedia, loadPoliticians };
})();
