# Stratégie de mise à jour des données — proposition (à valider)

_Rédigée le 2026-10-28. Rien de ce qui suit n'est construit : c'est le PRP de la mise à jour, en attente de validation._

## 1. Le problème
Une condamnation n'est pas un fait figé : « non définitif » devient « définitif » (pourvoi rejeté), une condamnation peut être annulée, une relaxe peut être infirmée. **Une donnée juste en mars peut être fausse en octobre.** Dans ce produit, périmé = faux, et faux = risque juridique. Mais tout re-vérifier par LLM coûterait ~8–15 $ équivalent API à chaque passage. Il faut donc surveiller **beaucoup, gratuitement**, et ne dépenser que sur ce qui bouge.

## 2. Principe : un entonnoir du gratuit vers le payant

| Étage | Quoi | Coût | Mesure (échantillon de 60 personnes, 30 j) |
|---|---|---|---|
| **0. Triage** | Qui est « dû » aujourd'hui (paliers + échéances juridiques + signalements) | 0 | — |
| **1. Sentinelles** | Dernière révision Wikipedia (50 titres/requête), diff des déclarations Wikidata P1399, titres de presse pour les paliers chauds | 0 | **17 %** des pages modifiées en 7 j, **38 %** en 30 j, 75 % en 90 j |
| **2. Porte** | `action=compare` entre l'ancienne et la nouvelle révision : on ne garde que le texte **inséré** et on y cherche des termes judiciaires précis | 0 | **≈ 5 %** de toutes les pages en 30 j touchent le judiciaire (dont des faux positifs, ex. « condamnent » au sens politique) |
| **3. Extraction** | LLM sur le **diff seul** + l'état connu de la personne (≈ 1–2 k tokens au lieu de 4–8 k) | ~0,01–0,03 $ | ≈ 5–10 personnes/semaine |
| **4. Garde-fous** | Les mêmes contrôles qu'aujourd'hui : citation exacte, cohérence statut/titre, « définitif » sur indice explicite, signaux propres à l'affaire | 0 | — |
| **5. Décision** | Auto uniquement pour le non-risqué ; tout changement de statut juridique → file de relecture | 0 | — |
| **6. Publication** | Export public filtré + `CHANGELOG` + version | 0 | — |

Estimation du régime de croisière : **~0,2–0,5 $ équivalent API par semaine** (à confirmer à l'usage ; non mesuré sur de vrais appels diff-seul), contre ~8–15 $ pour un re-passage complet. Le premier tri a aussi montré une limite : le filtre par mots-clés a des faux positifs → l'étage 3 (LLM) reste le juge, la porte ne fait que réduire le volume.

## 3. Paliers de surveillance (priorité à ce qui peut changer)
- **Chaud** (quotidien) : condamnation non définitive, procédure en cours (mis en examen, renvoyé, enquête), ou ≥ 2 médias sur du judiciaire dans les 7 derniers jours. Mesuré : Le Pen 5 titres judiciaires en 7 j, Sarkozy 1, Quatennens 0 (dernier titre il y a 645 j) ; **0/24** dans un échantillon aléatoire → le palier chaud est petit.
- **Tiède** (hebdomadaire) : condamnation définitive, relaxe, polémiques.
- **Froid** (mensuel) : le reste.
- **Échéances juridiques** : après une décision non définitive, la personne reste « chaude » jusqu'à une date calculée (`watch_until`) : appel (10 jours en matière pénale) puis pourvoi (5 jours francs), puis la durée d'un examen en cassation. _Délais à confirmer sur Légifrance (CPP) avant de les coder._
- **Signalements** (issues GitHub « signalement ») : traitement immédiat, priorité absolue.

## 4. Ce que l'extension montre de la fraîcheur
- Chaque ligne affiche déjà « vérifié le … ». À ajouter : un statut non définitif **non revérifié depuis > 60 jours** se lit « statut à actualiser » (honnêteté plutôt que fausse certitude).
- Si la presse signale du judiciaire récent que la personne n'a pas encore intégré : bandeau neutre « Actualité récente : dossier en cours de mise à jour » (sans rien affirmer).

## 5. Données
- `data/freshness.json` (privé) : par personne `tier, last_checked, revid, next_check, watch_until, reason`.
- `status_history[]` sur chaque ligne : `{date, status, final, source}` — on garde l'historique d'une affaire (condamné → définitif) au lieu de l'écraser ; indispensable pour expliquer un changement.
- **Export public filtré** (`data/public/`) : seulement le **affichable** (le reste reste privé), + `_meta.changes` et `CHANGELOG.md` hebdomadaire. Prérequis de toute publication (cf. audit).
- Roster (nouveaux élus, ministres) : listes ouvertes de l'Assemblée et du Sénat + Wikidata, **chaque mois**, sans LLM ; les nouveaux arrivent en palier froid avec une timeline vide.
- Mandats/rôles (« Ancien député… ») : rafraîchis depuis ces sources, sans LLM — corrige des rôles périmés.

## 6. Règles de décision
- **Automatique** : date de vérification, rôle/mandat issus des sources officielles, ajout d'une source à une affaire déjà vérifiée.
- **Toujours relu par toi** : toute nouvelle condamnation, tout changement de statut juridique, toute levée de « non définitif », toute relaxe. Livré sous forme de **digest** (« 4 changements à valider ») avec preuve et sources, applicable d'une commande.
- **Jamais** : publier un statut juridique qui échoue aux garde-fous.

## 7. Où ça tourne (décision à prendre)
| Option | + | − |
|---|---|---|
| **A. Local, `launchd` hebdo sur ton Mac** | Gratuit (quota claude.ai), simple, tu gardes la main | Le Mac doit être allumé |
| **B. GitHub Action quotidienne pour le gratuit (étages 0-2) + LLM en local** | Détection sans Mac, digest automatique | Plus de pièces ; le LLM ne peut pas tourner en Action sans clé API payante |
| **C. Routine cloud planifiée (skill `schedule`)** | Rien à laisser allumé | Faisabilité et coût non vérifiés |

Recommandation : **A pour démarrer** (hebdo, plafond de budget), **B** si le rythme quotidien du palier chaud devient utile.

## 8. Garde-fous de coût
- `--dry-run` : affiche « N personnes appelleraient le LLM, ~X $ » **avant** de dépenser.
- Plafond par exécution (`--max-llm 20`) et mensuel ; au-delà, on s'arrête et on te le dit.
- Réponses LLM mises en cache : changer une règle de fiabilité = `--rescore` à 0 $.

## 9. Rattrapage initial (386 personnes / 774 affirmations non vérifiées)
Deux façons : **en bloc** (~8–15 $ équivalent API, ~1 h 30) ou **étalé** dans cette même mécanique (ex. 40 personnes/semaine, ~10 semaines), ce qui lisse le coût et te laisse relire au fil de l'eau. Seules 3 personnes sont vérifiées aujourd'hui.

## 10. Plan de test
- **Rejeu historique** : deux révisions réelles d'une page (avant/après une décision définitive) → l'entonnoir doit détecter le changement et produire `final=true` avec citation.
- **Porte** : jeu de diffs étiquetés (vrais changements judiciaires vs faux positifs du type « condamnent ») → précision/rappel mesurés.
- **Budget** : tests unitaires du plafond et du `--dry-run`.
- **Bout en bout** sur 3 personnes : de la sentinelle jusqu'à l'export public et au `CHANGELOG`.

## 11. Risques
- Wikipedia en retard sur l'actualité (d'où le bandeau « actualité récente »).
- Faux positifs de la porte (coût marginal : un appel LLM inutile).
- Wikidata/Wikipedia faux en amont (déjà couvert par preuve citée + relecture).
- Délais juridiques mal codés → les confirmer avant implémentation.

## 12. Décisions à prendre
1. Où ça tourne : A, B ou C ?
2. Le rattrapage des 386 : en bloc ou étalé ?
3. Plafond de budget par exécution (proposition : 20 personnes).
4. Valides-tu « toute nouvelle condamnation / changement de statut passe par ta relecture » ?
