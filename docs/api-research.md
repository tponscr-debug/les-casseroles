# Recherche API & sources publiques — fiabilité des condamnations

Date des vérifications : 2026-10-28. « Vérifié » = testé en direct pendant cette session ; « À confirmer » = non vérifié.

## Question centrale

Peut-on accéder publiquement à un registre des condamnations de personnalités politiques ? **Non, il n'existe pas de base officielle « personne → condamnation » ouverte.**

| Source | Accès | Ce qu'on peut en tirer | Statut |
|---|---|---|---|
| **Casier judiciaire** (B1/B2/B3) | Non public. B1 : autorités judiciaires ; B2 : administrations ; B3 : la personne seule, à l'exclusion de tout tiers | Rien | Source secondaire (cabinets d'avocats, réponse ministérielle). **À confirmer sur Légifrance (CPP art. 774 s.)** |
| **Judilibre** (Cour de cassation, API via PISTE) | Compte PISTE gratuit + CGU. Sandbox sans clé : HTTP 400 | Décisions **pseudonymisées** (noms des personnes physiques masqués, loi du 23/03/2019) → impossible de chercher « Sarkozy » | Vérifié (HTTP). Calendrier pénal 1re instance/appel (fin 2024 / fin 2025) : **à confirmer** |
| **data.gouv.fr** (API `/api/1/datasets`) | Libre, sans clé | Recherches « casier judiciaire », « condamnations » : seulement des **statistiques agrégées** ; « inéligibilité », « élus condamnés » : 0 résultat | Vérifié |
| **Assemblée nationale open data** (zip des députés/mandats) | Libre | Roster des députés actifs (alimente la liste des personnes, pas les condamnations) | Vérifié (HTTP 200) |
| **HATVP open data** (`liste.csv`) | Libre | Déclarations d'intérêts/patrimoine, pas les condamnations | Vérifié (HTTP 200) |
| **Wikidata SPARQL** (`query.wikidata.org`) | Libre, `User-Agent` explicite obligatoire | Propriété **P1399 « condamné pour »** : **192 personnalités politiques françaises**, 283 déclarations, **254 avec référence de presse** (≈ 90 %) | Vérifié |
| **Wikipedia FR** (API MediaWiki) | Libre, `User-Agent` explicite | Texte + références (`<ref>`), révision exacte (`oldid`), catégories « Personnalité politique condamnée pour … » (ex. corruption : 143 pages) | Vérifié |
| **Google News RSS** (`news.google.com/rss/search`) | Non officiel, sans SLA, CGU floues | Titres + média + date : sert de **recoupement non affiché** (jamais de lien Google dans l'UI) | Vérifié (100 items). Limites de débit : **à confirmer** |
| **GDELT DOC 2.0** | Libre | A renvoyé `{}` sur ma requête : non utilisable tel quel | Vérifié (échec) — non retenu |
| Communiqués officiels (PNF, Cour de cassation, tribunaux, Conseil constitutionnel, Conseil d'État) | Pages web, non structurées, pas d'API trouvée | Sources primaires pour les cas médiatiques ; veille manuelle ou scraping ciblé | Existence confirmée par recherche, pas d'API |

## Conséquence de conception

Faute de registre officiel, la fiabilité vient de la **triangulation + prudence juridique + relecture humaine** :

1. Une affirmation judiciaire n'est stockée comme fait que si le LLM fournit une **citation exacte retrouvée dans la révision Wikipedia citée** (contrôle programmatique).
2. « Vérifié » exige **≥ 2 signaux indépendants propres à l'affaire** parmi : référence externe attachée au passage, déclaration Wikidata P1399 sur le même sujet, ≥ 2 médias titrant sur le même sujet. Une condamnation n'est affichée qu'à ce niveau.
3. « Définitif » n'est posé que sur indice explicite dans le texte (pourvoi rejeté, « définitivement »…). Sinon : « caractère définitif non établi ».
4. Les cas ambigus (condamnation + relaxe/annulation) ou non prouvés vont dans `data/review_queue.md` : **rien n'est affiché tant qu'un humain n'a pas tranché**.
5. Limite assumée : Wikipedia/Wikidata peuvent être en retard ou faux. D'où la révision citée (permalien), la preuve dépliable, la date de vérification et le lien « droit de réponse ».

## Limites de débit / étiquette

- Wikimedia : `User-Agent` explicite, requêtes séquentielles, pause 0,35 s ; 50 titres par requête pour `prop=info`. Plafonds exacts : à confirmer.
- WDQS : une requête groupée (≤ 120 QID). Timeout/concurrence : à confirmer.
- Google News RSS : 1 requête/s, 1 requête par personne.
- LLM : `claude -p` sans outils ni MCP ni skills, dossier neutre. ~0,02–0,07 $ équivalent API par personne (forfait claude.ai : consomme le quota, pas de facture à l'appel ; plan exact non vérifiable depuis ici).
