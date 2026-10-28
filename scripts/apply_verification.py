#!/usr/bin/env python3
"""
Les Casseroles — fusionne data/verification.json dans data/encyclopedia.json.

Règles (fiabilité d'abord) :
  - une affirmation confirmée prend statut/année/niveau/sources/preuve issus de la vérification,
    et son titre est REMPLACÉ par la reformulation limitée aux passages (l'ancien est gardé : title_legacy)
  - une étape antérieure d'une affaire dont l'issue est connue est marquée superseded (masquée)
  - tout le reste reste "unverified" => non affiché pour un statut juridique
  - génère data/review_queue.md : ce que l'humain doit trancher (non confirmé, contredit, nouveau)
Idempotent.

Usage : python3 scripts/apply_verification.py [--dry-run]
"""

import argparse
import json
from datetime import date

from casseroles_data import (
    ENCYCLOPEDIA, ROOT, LEGAL_STATUSES, clean_item, count_affairs, is_displayable, is_duplicate, people,
)

VERIF = ROOT / "data" / "verification.json"
QUEUE = ROOT / "data" / "review_queue.md"


def apply(enc, verif):
    stats = {"verified": 0, "sourced": 0, "unconfirmed": 0, "superseded": 0, "added": 0, "rejected": 0}
    queue = []
    for key, res in verif.items():
        entry = enc.get(key)
        if not entry:
            continue
        if res.get("permalink"):
            entry["wikipedia"], entry["wikidata"] = res.get("wiki_title"), res.get("qid")
        entry["checked_at"] = res.get("checked_at", date.today().isoformat())
        for note in res.get("notes", []):
            queue.append((key, "—", note))
        for row in res.get("claims", []):
            item = entry["timeline"][row["index"]]
            if row.get("superseded"):
                item["superseded"] = True
                stats["superseded"] += 1
            elif row.get("tier") in ("verified", "sourced"):
                item.setdefault("title_legacy", item["title"])
                if 20 <= len(row.get("title", "")) <= 400:
                    item["title"] = row["title"]
                item.update(status=row["status"], final=row.get("final"), year=row.get("year", item["year"]),
                            verification=row["tier"], sources=row["sources"], evidence=row["quote"],
                            signals=row["signals"], checked_at=entry["checked_at"])
                stats[row["tier"]] += 1
                if row["tier"] == "sourced" and row["status"] == "condamne":
                    queue.append((key, item["title"], "condamnation sourcée mais un seul signal : non affichée, à confirmer"))
            else:
                reason = row.get("rejected_reason") or row.get("verdict")
                stats["rejected" if row.get("verdict") == "contradicted" else "unconfirmed"] += 1
                queue.append((key, item["title"], f"non confirmée ({reason}) : {row.get('note', '')}".strip()))
        for new in res.get("new_claims", []):
            item = clean_item({"year": new["year"], "type": "judiciaire", "title": new["title"]})
            item.update(status=new["status"], final=new.get("final"), verification=new["tier"],
                        sources=new["sources"], evidence=new["quote"], signals=new["signals"],
                        checked_at=entry["checked_at"], origin="verification")
            if any(is_duplicate(item, other) for other in entry["timeline"]):
                continue
            entry["timeline"].append(item)
            stats["added"] += 1
            if not is_displayable(item):
                queue.append((key, item["title"], f"nouvelle affaire trouvée ({new['tier']}) : à confirmer"))
        kept = []
        for item in entry["timeline"]:
            if item.get("verification") in ("verified", "sourced") and item.get("evidence"):
                # même preuve, ou même énoncé la même année = même affaire : une seule ligne affichée
                if any(item["evidence"] == k["evidence"] or is_duplicate(item, k) for k in kept):
                    item["superseded"] = True
                else:
                    kept.append(item)
        entry["casseroles_count"] = count_affairs(entry)
    return stats, queue


def write_queue(queue):
    lines = ["# File de relecture humaine", "",
             f"_Générée le {date.today().isoformat()} par apply_verification.py. Rien de ce qui est listé ici n'est affiché "
             "comme fait tant qu'un humain ne l'a pas tranché._", ""]
    for key, title, why in sorted(queue):
        lines.append(f"- **{key}** — {title[:110]}\n  - {why}")
    QUEUE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    enc = json.loads(ENCYCLOPEDIA.read_text(encoding="utf-8"))
    verif = json.loads(VERIF.read_text(encoding="utf-8")) if VERIF.exists() else {}
    stats, queue = apply(enc, verif)
    enc["_meta"]["verified_at"] = date.today().isoformat()
    pending = sum(1 for _, e in people(enc) for i in e["timeline"]
                  if i["status"] in LEGAL_STATUSES and not is_displayable(i) and not i.get("superseded"))
    print(f"{stats} | en attente de vérification/relecture : {pending}")
    if args.dry_run:
        return
    ENCYCLOPEDIA.write_text(json.dumps(enc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_queue(queue)
    print(f"écrit : {ENCYCLOPEDIA.name}, {QUEUE.name} ({len(queue)} entrées)")


if __name__ == "__main__":
    main()
