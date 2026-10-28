# PRP — Les Casseroles v3 : fiabilité d'abord

_Rédigé le 2026-10-28 après l'audit du même jour, sur « go » de Thomas. Ce document décrit ce qui est construit, ce qui reste, et les règles qui ne doivent pas bouger._

## 1. Objectif et valeur
Afficher, sur n'importe quelle page, les affaires des responsables politiques français **sans jamais affirmer ce qui n'est pas prouvé**. Priorité absolue : zéro erreur sur les condamnations. Valeur : un outil civique crédible (sourcé, daté, contestable), pas un pilori.

## 2. Architecture et justification
- **Extension MV3, JS pur, sans build** : modules classiques partageant `globalThis.Casseroles` (testables sous Node sans bundler, < 400 lignes chacun).
- **UI en Shadow DOM** : le CSS du site ne casse plus la modale, et nos styles ne fuient pas.
- **Données statiques sur GitHub** (cache 24 h, repli embarqué) : zéro serveur à maintenir.
- **Pipeline Python en 2 temps** : `collect` (réseau + LLM, payant, mis en cache) / `evaluate` (règles pures, gratuit, rejouable). Permet d'ajuster les règles de fiabilité sans repayer.
- **LLM verrouillé** (`claude -p` sans outils/MCP/skills/hooks) : le texte Wikipedia est non fiable.

## 3. Modules
| Fichier | Rôle |
|---|---|
| `js/text.js` | normalisation, casse, `escapeHtml`, `safeUrl` |
| `js/matcher.js` | une regex alternée (10× plus rapide), indices fiables même en NFD |
| `js/data.js` | **règle d'affichage**, validation JSON, chargement cache→GitHub→bundle |
| `js/ui-render.js` | rendu HTML pur : statuts prudents, preuve, sources, humour conditionnel |
| `js/ui.js` | Shadow DOM, bulle, modale, a11y (focus, Échap) |
| `js/highlighter.js` | scan des nœuds ajoutés, observer sans boucle, mode « une fois par page » |
| `scripts/casseroles_data.py` | clés, partis, types, statuts, règle `is_displayable` (miroir de `data.js`) |
| `scripts/sources_*.py`, `llm.py` | Wikipedia (+révision exacte), Wikidata P1399, presse (signal), LLM |
| `scripts/verify_claims.py` / `apply_verification.py` / `validate_data.py` | vérifier / fusionner / contrôler |
| `scripts/update_encyclopedia.py` | ne retraite que les pages Wikipedia modifiées (`revid`) |

## 4. Contrats de données (schéma v3)
`encyclopedia.json` : `{ "_meta": {schema, generated_at, verified_at, policy}, "<nom en minuscules, accents conservés>": Entry }`
- `Entry` : `role, party (canonique), satirical_comment, casseroles_count (= ce que l'UI affiche), checked_at, wikipedia, wikidata, timeline[]`
- `Item` : `year, type (judiciaire|polémique|contexte), status, final, verification, sources[{kind,url,outlet,title,date}], evidence, signals[], title, title_legacy?, superseded?`
- `status` : `condamne | mis_en_examen | renvoye | relaxe | non_lieu | enquete | mise_en_cause | polemique | contexte`
- `final` : `true | false | null` — **`true` uniquement sur indice explicite** (« définitivement », pourvoi rejeté…). `null` = non établi.
- `verification` : `verified | sourced | unverified | rejected`

### Règle d'affichage (invariant, testée des deux côtés)
- **condamnation** → `verified` exigé (≥ 2 signaux indépendants propres à l'affaire)
- **autres statuts juridiques** → `verified` ou `sourced`
- **polémique** → toujours ; **contexte / superseded** → jamais
- un titre est **réécrit à partir des seuls passages cités** (l'ancien : `title_legacy`)
- l'humour est masqué dès qu'un dossier judiciaire est affiché

## 5. Contraintes et risques
- **Pas de registre officiel** (cf. `docs/api-research.md`) : on dépend de Wikipedia/Wikidata/presse → risque de retard ou d'erreur amont. Mitigation : permalien de la révision, preuve dépliable, date, droit de réponse, file de relecture humaine.
- **Diffamation / présomption d'innocence** : libellés « présumé innocent », jamais de « définitif » présumé, relaxes visibles.
- **Homonymes** : l'article doit être non-homonymie ET décrit comme politique (description ou catégories) ; sinon rien n'est affirmé.
- **Prompt injection** : LLM sans outils, citation vérifiée par programme.
- **Coût LLM** : ~0,02–0,07 $ équivalent API / personne ; tout run en lot est soumis à validation de Thomas.
- **Wikipedia CC BY-SA** : attribution assurée par les liens de source.

## 6. Plan de test
- `node --test tests/*.test.js` : texte, matcher (frontières, NFD, plus long gagne), règle d'affichage, anti-XSS, humour, intégrité des données (dont « aucune condamnation affichable sans source ni preuve » et « décompte JSON = décompte UI »).
- `python3 tests/e2e_extension.py` : vrai Chromium + extension + page piégée (CSS hostile, liens, champs, contenu injecté, données malveillantes) — 28 vérifications.
- `validate_data.py` : schéma + règles de fiabilité (aussi en CI à venir).
- Vérification manuelle de la sortie LLM sur cas difficiles (Sarkozy, Le Pen) avant tout run en lot.

## 7. État
**Fait** : correctifs de l'audit (XSS, perf, observer, polices locales, permissions, lien cliquable, casse accentuée), modularisation, Shadow DOM, politique d'affichage, statuts/preuves/sources dans l'UI, nettoyage des données (partis 288→60, types, années, doublons), pipeline de vérification, détection de changement par `revid`, tests.
**Vérifié sur 3 personnes** (Quatennens, Le Pen, Sarkozy). **Non lancé** : la vérification des 386 personnes / 774 affirmations restantes (en attente de ton accord, cf. coût).
**À faire (v3.1)** : alias de nom de famille (uniquement après le nom complet, jamais ambigu), carte ancrée + side panel « radar de page », GitHub Action hebdomadaire → PR, roster Wikidata (QID), formulaire d'issue prérempli, publication Chrome Web Store.
