const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const C = require('./load.js');

const file = path.join(__dirname, '..', 'data', 'encyclopedia.json');
const enc = require(file);
const people = Object.entries(enc).filter(([k]) => !k.startsWith('_'));

test('validate_data.py : schéma v3 + règles de fiabilité', () => {
    execFileSync('python3', [path.join(__dirname, '..', 'scripts', 'validate_data.py')], { stdio: 'pipe' });
});
test('aucune condamnation affichable sans source ni preuve', () => {
    for (const [name, e] of people) for (const i of e.timeline) {
        if (i.status === 'condamne' && C.data.isDisplayable(i)) {
            assert.ok(i.sources.length > 0 && i.evidence && i.evidence.length > 20, `${name}: ${i.title}`);
            assert.equal(i.verification, 'verified', name);
        }
    }
});
test('le décompte du JSON = ce que l\'extension affiche', () => {
    for (const [name, e] of people) assert.equal(e.casseroles_count, C.data.affairsOf(e).length, name);
});
test('partis normalisés (< 80 libellés) et clés uniques sans accent', () => {
    assert.ok(new Set(people.map(([, e]) => e.party)).size < 80);
    const folded = people.map(([k]) => C.text.normalize(k));
    assert.equal(new Set(folded).size, folded.length);
});
