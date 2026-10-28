# Les Casseroles

Extension Chrome (Manifest V3) : surligne les noms de responsables politiques français sur n'importe quelle page et affiche leurs affaires **avec statut juridique, preuve citée et sources**.

**Principe n°1 : aucune affirmation judiciaire sans preuve.** Une condamnation n'est affichée que si elle est *vérifiée* (citation exacte + ≥ 2 signaux indépendants). Voir `docs/api-research.md`.

## Installer (développement)
`chrome://extensions` → mode développeur → « Charger l'extension non empaquetée » → ce dossier.

## Données
- `data/encyclopedia.json` : base (schéma v3, voir `PRP.md`). Servie via GitHub (`main`), cache 24 h, repli embarqué.
- `data/review_queue.md` : ce qu'un humain doit trancher.
- Pipeline (`scripts/`) :
  1. `migrate_clean_data.py` — normalise (partis, types, années, doublons), idempotent.
  2. `verify_claims.py` — vérifie les affirmations (`--rescore` rejoue les règles à 0 $ sur les réponses en cache).
  3. `apply_verification.py` — fusionne + écrit la file de relecture.
  4. `validate_data.py` — règles de fiabilité (aussi lancé par les tests).
  5. `update_encyclopedia.py --check | --run` — ne retraite que les pages Wikipedia modifiées.

## Tests
```
node --test tests/*.test.js          # unitaires + intégrité des données
python3 tests/e2e_extension.py       # vrai Chromium + extension + page piège
```
