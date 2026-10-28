#!/usr/bin/env python3
"""
Les Casseroles — validateur de données (schéma v3 + règles de fiabilité).

Code de sortie 1 si une règle est violée. Utilisé en local, par les tests et la CI.
Règles clés : un statut juridique "vérifié/sourcé" DOIT avoir une source (URL https) et
une preuve citée ; "définitif" exige un indice explicite dans la preuve.

Usage : python3 scripts/validate_data.py [chemin]
"""

import collections
import json
import re
import sys

from casseroles_data import (
    ALL_STATUSES, ENCYCLOPEDIA, LEGAL_STATUSES, VERIFIED_TIERS, fold, people,
)

FINAL_RE = re.compile(
    r"définitiv|definitiv|irrévocable|autorité de la chose jugée|"
    r"pourvoi.{0,60}rejet|rejet.{0,60}pourvoi|cassation.{0,60}(confirm|rejet)|"
    r"(confirm|rejet).{0,60}cassation|renonc.{0,30}(appel|pourvoi)|n'a pas fait appel|"
    r"sans appel",
    re.IGNORECASE,
)
CONVICTION_RE = re.compile(r"condamn|coupable|peine|prison|amende|sursis|inéligib|reconnu", re.IGNORECASE)
TIERS = VERIFIED_TIERS | {"unverified", "rejected"}


def validate(data):
    errors = []
    folded = collections.Counter(fold(k) for k, _ in people(data))
    errors += [f"clé en double (accents) : {k}" for k, n in folded.items() if n > 1]

    for key, entry in people(data):
        if not isinstance(entry.get("timeline"), list):
            errors.append(f"{key}: timeline absente")
            continue
        for n, item in enumerate(entry["timeline"]):
            where = f"{key}[{n}]"
            status, tier = item.get("status"), item.get("verification")
            if status not in ALL_STATUSES:
                errors.append(f"{where}: statut invalide {status!r}")
            if tier not in TIERS:
                errors.append(f"{where}: niveau de vérification invalide {tier!r}")
            if not re.fullmatch(r"\d{4}|\?", str(item.get("year", ""))):
                errors.append(f"{where}: année invalide {item.get('year')!r}")
            if status in LEGAL_STATUSES and tier in VERIFIED_TIERS:
                srcs = item.get("sources") or []
                if not srcs or not all(re.match(r"https://", s.get("url", "")) for s in srcs):
                    errors.append(f"{where}: {status} {tier} sans source https")
                ev = item.get("evidence", "")
                if len(ev) < 20:
                    errors.append(f"{where}: {status} {tier} sans preuve citée")
                if status == "condamne" and not CONVICTION_RE.search(ev):
                    errors.append(f"{where}: 'condamne' mais la preuve ne parle pas de condamnation")
                if item.get("final") is True and not FINAL_RE.search(ev):
                    errors.append(f"{where}: final=true sans indice explicite de décision définitive")
            if item.get("final") is not None and status != "condamne":
                errors.append(f"{where}: 'final' n'a de sens que pour 'condamne'")
    return errors


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else str(ENCYCLOPEDIA)
    with open(path, encoding="utf-8") as f:
        errors = validate(json.load(f))
    for e in errors[:40]:
        print("✗", e)
    print(f"{len(errors)} erreur(s)" if errors else "✓ données valides")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
