#!/usr/bin/env python3
"""
Les Casseroles — mise à jour de l'encyclopédie (orchestrateur v3).

Principe : ne retraiter QUE ce qui a changé. Un appel groupé donne la dernière révision
Wikipedia de chaque personne ; seules les pages modifiées depuis la dernière vérification
repassent par le LLM (coût ~ proportionnel aux changements, pas à la taille de la base).

  --check               liste les personnes dont la page a changé (gratuit, aucun LLM)
  --run                 re-vérifie les personnes changées + applique + valide
  --name "Nom"          force une personne
  --add-senators        ajoute les nouveaux sénateurs (entrée vide, puis découverte LLM)
  --limit N             plafonne le nombre de personnes traitées (budget)

Toute condamnation ajoutée passe par verify_claims (citation exacte + recoupements) ;
rien n'est affiché sans preuve (cf. casseroles_data.is_displayable).
"""

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

from casseroles_data import ENCYCLOPEDIA, LEGAL_STATUSES, clean_entry, entry_key, fold, people
from llm import STATS
from sources_wikipedia import get_senators, latest_revids
from verify_claims import OUT, load_out, save_out, verify_person

HERE = Path(__file__).resolve().parent


def load():
    return json.loads(ENCYCLOPEDIA.read_text(encoding="utf-8"))


def changed_people(enc, verif):
    """[(clé, titre)] dont la révision Wikipedia diffère de celle vérifiée (ou jamais vérifiée)."""
    known = {k: v for k, v in verif.items() if v.get("wiki_title")}
    titles = [v["wiki_title"] for v in known.values()]
    latest = latest_revids(titles) if titles else {}
    return [(k, v["wiki_title"]) for k, v in known.items() if latest.get(v["wiki_title"]) not in (None, v.get("revid"))]


def reset_for_recheck(entry):
    """Les affirmations juridiques redeviennent 'unverified' : elles seront re-prouvées ou disparaîtront."""
    for item in entry["timeline"]:
        if item["status"] in LEGAL_STATUSES:
            item["verification"] = "unverified"
            item.pop("superseded", None)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true"); ap.add_argument("--run", action="store_true")
    ap.add_argument("--name"); ap.add_argument("--add-senators", action="store_true"); ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    if not (args.check or args.run or args.name or args.add_senators):
        ap.print_help(); return

    enc, verif = load(), load_out()
    todo = []
    if args.name:
        key = next((k for k, _ in people(enc) if fold(k) == fold(args.name)), None)   # accents ignorés pour la recherche
        if not key:
            sys.exit(f"inconnu : {args.name}")
        todo.append(key)
    else:
        todo += [k for k, _ in changed_people(enc, verif)]

    if args.add_senators:
        index = {fold(k) for k, _ in people(enc)}
        new = [(t, party) for t, party in get_senators().items() if fold(t) not in index]
        for title, party in new:
            enc[entry_key(title)] = clean_entry({"role": "Sénateur", "party": party, "satirical_comment": "", "timeline": []})
            todo.append(entry_key(title))
        print(f"{len(new)} nouveau(x) sénateur(s) ajouté(s) (entrées vides)")

    todo = todo[:args.limit] if args.limit else todo
    print(f"{len(todo)} personne(s) à (re)vérifier" + (" : " + ", ".join(todo[:8]) + ("…" if len(todo) > 8 else "") if todo else ""))
    if args.check or not todo:
        return

    for key in todo:
        entry = enc[key]
        reset_for_recheck(entry)
        res = verify_person(key, entry, discover=True)
        if res is not None:
            verif[key] = res
            save_out(verif)
        print(f"  {key}: {sum(1 for c in (res or {}).get('claims', []) if c.get('tier'))} affirmation(s), "
              f"{len((res or {}).get('new_claims', []))} nouvelle(s)")
    ENCYCLOPEDIA.write_text(json.dumps(enc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(HERE / "apply_verification.py")], check=True)
    subprocess.run([sys.executable, str(HERE / "validate_data.py")], check=True)
    print(f"LLM : {STATS['calls']} appel(s), ~{STATS['cost_usd']:.3f} $ (équivalent API)")


if __name__ == "__main__":
    main()
