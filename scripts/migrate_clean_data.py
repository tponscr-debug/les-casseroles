#!/usr/bin/env python3
"""
Les Casseroles — migration/nettoyage de data/encyclopedia.json vers le schéma v3.

Idempotent. Non destructif : aucune affaire n'est supprimée, les valeurs d'origine
modifiées sont conservées (party_raw, year_raw). Tout contenu ancien passe en
verification="unverified" : il ne sera AFFICHÉ (pour les statuts juridiques)
qu'après vérification par scripts/verify_claims.py.

Usage : python3 scripts/migrate_clean_data.py [--file chemin] [--dry-run]
"""

import argparse
import collections
import json
from datetime import date

from casseroles_data import (
    ENCYCLOPEDIA, SCHEMA, LEGAL_STATUSES, clean_entry, count_affairs,
    entry_key, fold, merge_timelines, people,
)


def merge_duplicates(raw):
    """Fusionne les clés qui ne diffèrent que par les accents (garde la version accentuée)."""
    groups = collections.defaultdict(list)
    for key in raw:
        if not key.startswith("_"):
            groups[fold(key)].append(key)

    out, merged = {}, []
    for keys in groups.values():
        keys.sort(key=lambda k: (k == fold(k), -len(raw[k].get("timeline", []))))  # accentuée d'abord, la + riche d'abord
        base = dict(raw[keys[0]])
        if len(keys) > 1:
            merged.append(keys)
            base["timeline"] = merge_timelines(*(raw[k].get("timeline", []) for k in keys))
        out[entry_key(keys[0])] = base
    return out, merged


def migrate(raw):
    merged_people, merged = merge_duplicates(raw)
    out = {k: clean_entry(v) for k, v in merged_people.items()}
    out["_meta"] = {
        "schema": SCHEMA,
        "generated_at": date.today().isoformat(),
        "policy": "Les statuts juridiques ne sont affichés que s'ils sont vérifiés ou sourcés.",
    }
    return dict(sorted(out.items(), key=lambda kv: (kv[0].startswith("_") is False, kv[0]))), merged


def report(before, after, merged):
    pending = sum(1 for _, e in people(after) for i in e["timeline"]
                  if i["status"] in LEGAL_STATUSES and i["verification"] == "unverified")
    ctx = sum(1 for _, e in people(after) for i in e["timeline"] if i["status"] == "contexte")
    parties = {e["party"] for _, e in people(after)}
    shown = sum(1 for _, e in people(after) if count_affairs(e) > 0)
    print(f"profils          : {len(list(people(before)))} -> {len(list(people(after)))}")
    print(f"clés fusionnées  : {merged}")
    print(f"partis distincts : {len({e.get('party') for _, e in people(before)})} -> {len(parties)}")
    print(f"événements 'contexte' (non comptés) : {ctx}")
    print(f"affirmations juridiques à vérifier  : {pending}")
    print(f"profils avec ≥1 affaire             : {shown}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=str(ENCYCLOPEDIA))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with open(args.file, encoding="utf-8") as f:
        raw = json.load(f)
    after, merged = migrate(json.loads(json.dumps(raw)))
    report(raw, after, merged)
    if args.dry_run:
        return
    with open(args.file, "w", encoding="utf-8") as f:
        json.dump(after, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"écrit : {args.file}")


if __name__ == "__main__":
    main()
