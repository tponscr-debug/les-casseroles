const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./load.js');
const { text, matcher, data, render, sites } = C;

test('toTitleCase gère accents, tirets, particules', () => {
    assert.equal(text.toTitleCase('élisabeth BORNE'), 'Élisabeth Borne');
    assert.equal(text.toTitleCase('jean-luc mélenchon'), 'Jean-Luc Mélenchon');
    assert.equal(text.toTitleCase('charles de courson'), 'Charles de Courson');
});

test('escapeHtml neutralise le HTML ; safeUrl refuse tout sauf https', () => {
    assert.equal(text.escapeHtml('<img src=x onerror=alert(1)>"\''), '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;');
    assert.equal(text.safeUrl('javascript:alert(1)'), '');
    assert.equal(text.safeUrl('http://x.fr'), '');
    assert.equal(text.safeUrl('https://x.fr/a'), 'https://x.fr/a');
});

const rx = matcher.buildMatcher(['nicolas sarkozy', 'marine le pen', 'élisabeth borne'].map(text.normalize));
const found = (s) => matcher.findMatches(rx, s).map(({ start, end }) => s.slice(start, end));

test('matcher : casse, accents, plusieurs noms dans un même texte', () => {
    assert.deepEqual(found('Hier, NICOLAS SARKOZY et Marine Le Pen ont parlé.'), ['NICOLAS SARKOZY', 'Marine Le Pen']);
    assert.deepEqual(found('Élisabeth Borne / Elisabeth Borne'), ['Élisabeth Borne', 'Elisabeth Borne']);
});
test('matcher : frontières de mot (pas de faux positif)', () => {
    assert.deepEqual(found('Nicolas Sarkozyste'), []);
    assert.deepEqual(found('anti-Nicolas Sarkozy.'), ['Nicolas Sarkozy']);
    assert.deepEqual(found("l'ex-président Nicolas Sarkozy,"), ['Nicolas Sarkozy']);
});
test('matcher : texte déjà décomposé (NFD) -> indices corrects', () => {
    const s = 'Vu: Élisabeth Borne ici'.normalize('NFD');
    const [m] = matcher.findMatches(rx, s);
    assert.equal(s.slice(m.start, m.end).normalize('NFC'), 'Élisabeth Borne');
});
test('matcher : le nom le plus long gagne', () => {
    const r = matcher.buildMatcher(['marine', 'marine le pen']);
    const s = 'Marine Le Pen';
    assert.deepEqual(matcher.findMatches(r, s).map(({ start, end }) => s.slice(start, end)), ['Marine Le Pen']);
});

// ── Règle d'affichage : le coeur de la fiabilité ──
const it = (o) => ({ title: 't', type: 'judiciaire', year: '2022', ...o });
test('isDisplayable : une condamnation exige "verified"', () => {
    assert.equal(data.isDisplayable(it({ status: 'condamne', verification: 'verified' })), true);
    assert.equal(data.isDisplayable(it({ status: 'condamne', verification: 'sourced' })), false);
    assert.equal(data.isDisplayable(it({ status: 'condamne', verification: 'unverified' })), false);
});
test('isDisplayable : autres statuts juridiques = sourced ou verified', () => {
    for (const status of ['mis_en_examen', 'renvoye', 'enquete', 'mise_en_cause', 'relaxe', 'non_lieu']) {
        assert.equal(data.isDisplayable(it({ status, verification: 'sourced' })), true, status);
        assert.equal(data.isDisplayable(it({ status, verification: 'unverified' })), false, status);
    }
});
test('isDisplayable : contexte et étapes remplacées masqués ; polémique visible', () => {
    assert.equal(data.isDisplayable(it({ status: 'contexte', type: 'contexte' })), false);
    assert.equal(data.isDisplayable(it({ status: 'condamne', verification: 'verified', superseded: true })), false);
    assert.equal(data.isDisplayable(it({ status: 'polemique', type: 'polémique', verification: 'unverified' })), true);
});
test('isDisplayable : ancien schéma sans statut -> jamais d\'affirmation juridique', () => {
    assert.equal(data.isDisplayable({ type: 'judiciaire', title: 'x' }), false);
    assert.equal(data.isDisplayable({ type: 'polémique', title: 'Condamné à 3 mois de prison' }), false);
    assert.equal(data.isDisplayable({ type: 'polémique', title: 'Propos controversés sur X' }), true);
});
test('isValidEncyclopedia refuse un JSON mal formé', () => {
    assert.equal(data.isValidEncyclopedia(null), false);
    assert.equal(data.isValidEncyclopedia([]), false);
    assert.equal(data.isValidEncyclopedia({ a: { timeline: 'x' } }), false);
    assert.equal(data.isValidEncyclopedia({ _meta: {}, a: { timeline: [] } }), true);
});

// ── Rendu : pas d'injection, présomption d'innocence, humour ──
const evil = '<img src=x onerror="window.__xss=1">';
test('renderModal échappe toutes les données (anti-XSS)', () => {
    const html = render.renderModal(evil, {
        role: evil, party: evil, satirical_comment: evil, checked_at: '2026-10-28',
        timeline: [it({ status: 'polemique', type: 'polémique', title: evil, evidence: evil,
            sources: [{ url: 'javascript:alert(1)', outlet: evil }, { url: 'https://ok.fr/a', outlet: evil }] })],
    });
    assert.ok(!/<img/i.test(html), 'aucune balise <img> injectée par les données');
    assert.ok(!html.includes('javascript:'), 'aucune URL javascript:');
    assert.ok(html.includes('https://ok.fr/a'));
});
test('statusInfo : définitivité jamais présumée', () => {
    assert.match(render.statusInfo({ status: 'condamne', final: true }).label, /définitive/);
    assert.match(render.statusInfo({ status: 'condamne', final: null }).label, /non établi/);
    assert.match(render.statusInfo({ status: 'condamne', final: false }).label, /non définitif/);
    assert.match(render.statusInfo({ status: 'mis_en_examen' }).label, /présumé innocent/);
});
test('« le mot du serveur » : masqué sur un dossier judiciaire, absent en mode sérieux', () => {
    const base = { satirical_comment: 'blague', timeline: [] };
    const withConv = render.renderModal('x', { ...base, timeline: [it({ status: 'condamne', verification: 'verified', evidence: 'condamné à 4 mois' })] });
    const polOnly = render.renderModal('x', { ...base, timeline: [it({ status: 'polemique', type: 'polémique' })] });
    const polSerious = render.renderModal('x', { ...base, timeline: [it({ status: 'polemique', type: 'polémique' })] }, { humor: 'serious' });
    assert.ok(!withConv.includes('blague'));
    assert.ok(polOnly.includes('blague'));
    assert.ok(!polSerious.includes('blague'));
});
test('mode sérieux : aucun texte de blague ; mode drôle : pieds de ticket', () => {
    const entry = { timeline: [it({ status: 'polemique', type: 'polémique' })] };
    const funny = render.renderModal('x', entry), serious = render.renderModal('x', entry, { humor: 'serious' });
    assert.match(funny, /prescrit/); assert.match(funny, /TVA/);
    for (const w of ['prescrit', 'TVA', 'CASSEROLE ***', 'Toques']) assert.ok(!serious.includes(w), w);
});
test('le tag de statut juridique est SOBRE dans les deux modes (la blague ne touche pas le verdict)', () => {
    const entry = { timeline: [it({ status: 'condamne', final: false, verification: 'verified', evidence: 'condamné à un an avec sursis' })] };
    for (const humor of ['funny', 'serious']) {
        const html = render.renderModal('x', entry, { humor });
        assert.ok(html.includes('<span class="tag conv">Condamné · non définitif</span>'), humor);
    }
    assert.match(render.renderModal('x', entry, { humor: 'funny' }), /<b class="side">EN COURS<\/b>/);   // la blague vit dans la colonne de droite
});
test('stamp : présumé innocent / non définitif / définitive selon le dossier', () => {
    const mk = (o) => render.renderModal('x', { timeline: [it({ verification: 'verified', evidence: 'condamné à un an', ...o })] });
    assert.match(mk({ status: 'condamne', final: true }), /<span class="stamp">Définitive/);
    assert.match(mk({ status: 'condamne', final: false }), /<span class="stamp">Non définitif/);
    assert.match(mk({ status: 'mis_en_examen' }), /<span class="stamp">Présumé innocent/);
    assert.match(mk({ status: 'condamne', final: null }), /<span class="stamp">Définitif non établi/);
    const mixed = render.renderModal('x', { timeline: [it({ status: 'condamne', final: true, verification: 'verified', evidence: 'condamné définitivement' }),
        it({ status: 'condamne', final: false, verification: 'verified', evidence: 'condamné en première instance', title: 'autre' })] });
    assert.match(mixed, /voir chaque ligne/);                 // dossier mixte : pas de tampon trompeur
});
test('texte de bulle stable pour un nom donné', () => {
    assert.equal(C.copy.bubble('funny', 'Marine Le Pen'), C.copy.bubble('funny', 'Marine Le Pen'));
    assert.equal(C.copy.bubble('serious', 'x'), 'Voir le dossier');
});

// ── Contexte d'extension : un script orphelin (extension rechargée) doit se démonter, une seule fois ──
test('context : sans chrome.* le contexte est mort ; le démontage est notifié une seule fois', () => {
    let calls = 0;
    C.context.onDead(() => { calls++; });
    assert.equal(C.context.alive(), false);
    assert.equal(C.context.check(), false);
    assert.equal(C.context.check(), false);
    assert.equal(calls, 1);
    assert.equal(C.context.isDead(), true);
});

// ── Exclusion par site ──
const reason = (host, lists = {}, doc = null) => sites.decide(host, lists, doc, { innerWidth: 1000, innerHeight: 800 }).reason;
const fakeDoc = (canvasW, canvasH, textLen) => ({
    querySelectorAll: () => (canvasW ? [{ getBoundingClientRect: () => ({ width: canvasW, height: canvasH }) }] : []),
    body: { innerText: 'x'.repeat(textLen) },
});
test('sites : streaming, jeux et dev local exclus par défaut (sous-domaines compris)', () => {
    for (const h of ['netflix.com', 'www.netflix.com', 'www.primevideo.com', 'm.youtube.com', 'localhost', '127.0.0.1', 'monjeu.local', 'foo.itch.io'])
        assert.equal(reason(h), 'default', h);
});
test('sites : sites d\'actualité actifs ; pas de faux positif sur un nom proche', () => {
    for (const h of ['lemonde.fr', 'www.lefigaro.fr', 'fr.wikipedia.org', 'notnetflix.com', 'netflix.com.evil.fr'])
        assert.equal(reason(h), 'active', h);
});
test('sites : l\'utilisateur gagne (réactiver > exclure > défaut)', () => {
    assert.equal(reason('www.netflix.com', { sitesAllowed: ['netflix.com'] }), 'user-allow');
    assert.equal(reason('lemonde.fr', { sitesExcluded: ['lemonde.fr'] }), 'user');
    assert.equal(reason('lemonde.fr', { sitesAllowed: ['lemonde.fr'], sitesExcluded: ['lemonde.fr'] }), 'user-allow');
});
test('sites : détection d\'un jeu (canvas plein écran, peu de texte) sans exclure une page de contenu', () => {
    assert.equal(reason('monsite.fr', {}, fakeDoc(1000, 800, 120)), 'game');
    assert.equal(reason('monsite.fr', {}, fakeDoc(1000, 800, 5000)), 'active');      // beaucoup de texte : article avec carte
    assert.equal(reason('monsite.fr', {}, fakeDoc(300, 200, 120)), 'active');        // petit canvas : graphique
    assert.equal(reason('monsite.fr', {}, fakeDoc(0, 0, 120)), 'active');            // pas de canvas
    assert.equal(reason('monsite.fr', { sitesAllowed: ['monsite.fr'] }, fakeDoc(1000, 800, 120)), 'user-allow');
});
test('sites : update exclut/réactive sans muter et sans doublon', () => {
    const a = sites.update({ sitesAllowed: ['a.fr'], sitesExcluded: [] }, 'www.b.fr', 'exclude');
    assert.deepEqual(a, { sitesExcluded: ['b.fr'], sitesAllowed: ['a.fr'] });
    const b = sites.update(a, 'b.fr', 'allow');
    assert.deepEqual(b, { sitesAllowed: ['a.fr', 'b.fr'], sitesExcluded: [] });
    assert.deepEqual(sites.update(b, 'b.fr', 'allow').sitesAllowed, ['a.fr', 'b.fr']);
});

// ── Service worker : un badge demandé pour un onglet fermé ne doit produire AUCUN rejet non géré ──
test('background : onglet fermé (No tab with id) -> aucune promesse rejetée non gérée', async () => {
    const unhandled = [];
    const onUnhandled = (e) => unhandled.push(String(e));
    process.on('unhandledRejection', onUnhandled);
    let handler;
    const gone = () => Promise.reject(new Error('No tab with id: 1'));
    globalThis.chrome = { runtime: { onMessage: { addListener: (fn) => { handler = fn; } } }, action: { setBadgeText: gone, setBadgeBackgroundColor: gone } };
    const { onMessage } = require('../background.js');
    onMessage({ action: 'setBadge', count: 5 }, { tab: { id: 1 } });
    onMessage({ action: 'setBadge', count: 150 }, { tab: { id: 2 } });
    onMessage({ action: 'setBadge', count: 3 }, {});                 // pas d'onglet : ignoré
    await new Promise((r) => setTimeout(r, 50));
    process.off('unhandledRejection', onUnhandled);
    delete globalThis.chrome;
    assert.equal(typeof handler, 'function');
    assert.deepEqual(unhandled, []);
});

test('background : si chrome.runtime a disparu (rechargement en cours), le script ne lève aucune erreur', () => {
    const path = require.resolve('../background.js');
    delete require.cache[path];
    globalThis.chrome = { runtime: undefined, action: {} };
    assert.doesNotThrow(() => require('../background.js'));
    delete globalThis.chrome; delete require.cache[path];
    assert.doesNotThrow(() => require('../background.js'));            // pas de `chrome` du tout
});
