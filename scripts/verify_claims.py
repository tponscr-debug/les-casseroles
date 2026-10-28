#!/usr/bin/env python3
"""
Les Casseroles — vérification des affirmations JUDICIAIRES (priorité n°1 : zéro erreur).

Deux temps, volontairement séparés :
  collect()  : réseau + LLM (payant, ~0,02-0,07 $ équivalent API par personne) — résultat MIS EN CACHE
  evaluate() : contrôles programmatiques purs (gratuit) — rejouables à volonté avec --rescore

Pour chaque personne : bon article Wikipedia (anti-homonyme) + révision exacte ; passages d'affaires
AVEC leurs références presse ; recoupements (Wikidata P1399, catégories, titres de presse) ;
jugement du LLM (sans outils) avec CITATION EXACTE obligatoire ; puis garde-fous :
citation réellement présente, mot-clé cohérent avec le statut, titre cohérent avec le statut,
"définitif" seulement sur indice explicite, signaux spécifiques à l'AFFAIRE.

Écrit data/verification.json. N'écrit JAMAIS dans encyclopedia.json (cf. apply_verification.py).

Usage : verify_claims.py [--name "Nom"] [--limit N] [--workers 3] [--no-news] [--redo] [--rescore]
"""

import argparse
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from casseroles_data import ENCYCLOPEDIA, LEGAL_STATUSES, ROOT, fold, people
from llm import STATS, ask_json
from sources_news import fetch_headlines
from sources_wikidata import fetch_convictions
from sources_wikipedia import extract_evidence, get_categories, get_wikitext_and_revid, resolve_page
from validate_data import FINAL_RE

OUT  = ROOT / "data" / "verification.json"
LOCK = threading.Lock()

STATUS_RE = {
    "condamne":      re.compile(r"condamn|coupable|peine|prison|amende|sursis|inéligib|reconnu", re.I),
    "mis_en_examen": re.compile(r"mis(e)? en examen|mise en examen", re.I),
    "renvoye":       re.compile(r"renvoy|procès|tribunal correctionnel|assises", re.I),
    "relaxe":        re.compile(r"relax|acquitt", re.I),
    "non_lieu":      re.compile(r"non-?lieu", re.I),
    "enquete":       re.compile(r"enquête|plainte|perquisition|garde à vue|parquet|signalement", re.I),
    "mise_en_cause": re.compile(r"accus|soupçon|mis(e)? en cause|mise en cause|information judiciaire|instruction|poursuiv|"
                                r"détourn|fraud|corrupt|escroqu|abus|favoritisme|trafic|harcèlement|agression|violence|viol|"
                                r"blanchiment|financement|conflit d.intérêt", re.I),
    "polemique":     re.compile(r".", re.S),
}
# Mots trop génériques pour caractériser une AFFAIRE (un "relaxé" dans une autre affaire ne doit rien corroborer).
GENERIC = set("""condamne condamnee condamnes premiere instance prison ferme appel affaire amende sursis peine euros
inegibilite execution provisoire confirme confirmee apres ainsi avoir contre definitivement definitive relaxe relaxee
examen enquete tribunal justice annee annees condamnation culpabilite delit jugement jugee decision cassation cour
parquet ouverte ouvert mise mises pourvoi rejete rejetee""".split())


def norm(s):
    return re.sub(r"[\s’'`´\"«»]+", " ", fold(s)).strip()


def topic_tokens(text, name):
    """Préfixes (6 car.) des mots distinctifs d'une affaire : ni génériques, ni le nom de la personne."""
    own = fold(name)
    return {w[:6] for w in re.findall(r"[a-z]{6,}", fold(text)) if w not in GENERIC and w not in own}

# ─── Collecte (réseau + LLM) ───────────────────────────────────────────────────

def build_prompt(name, claims, evidence, wikidata, categories):
    ev = [{"id": e["id"], "texte": e["text"]} for e in evidence]
    return (
        f"Personnalité : {name}\n"
        "Pour CHAQUE affirmation C*, dis si les passages E* la confirment.\n"
        "- verdict : confirmed | corrected (l'affaire figure dans les passages mais l'année/le statut/un détail diffère, "
        "OU l'affirmation décrit une étape antérieure : donne alors le statut LE PLUS RÉCENT de la même affaire, "
        "avec sa citation — ne crée jamais de doublon) | unsupported (aucun passage ne la confirme) | "
        "contradicted (un passage dit le contraire)\n"
        "- status : condamne | mis_en_examen | renvoye | relaxe | non_lieu | enquete | mise_en_cause (accusation sans procédure établie) | polemique "
        "(le statut LE PLUS RÉCENT établi par le passage cité)\n"
        "- final : true UNIQUEMENT si le passage dit explicitement que la décision est définitive "
        "(pourvoi rejeté, pas d'appel…), false si un appel/pourvoi est mentionné comme en cours ou possible, sinon null\n"
        "- year : année de la décision/du fait d'après le passage (string 4 chiffres)\n"
        "- evidence_id + quote : id du passage et citation COPIÉE MOT POUR MOT (max 300 car.)\n"
        "- title : 1 phrase factuelle en français qui n'utilise QUE ce que les passages établissent "
        "(supprime tout détail non prouvé par eux ; ne dis jamais plus que la citation ; le titre doit annoncer le MÊME "
        "statut que status — ex. status=relaxe => il dit la relaxe, et s'il y a eu condamnation puis relaxe il dit les deux)\n"
        "- note : une phrase si corrected/contradicted\n"
        "Ajoute dans new_claims les affaires judiciaires CLAIREMENT présentes dans les passages mais absentes "
        "des affirmations (une entrée par affaire, au statut le plus récent) : "
        "{year,status,final,title,evidence_id,quote}.\n"
        "Sans passage probant, n'invente rien.\n"
        'Format : {"claims":[{"id":"C1","verdict":"","status":"","final":null,"year":"","evidence_id":"","quote":"","title":"","note":""}],'
        '"new_claims":[]}\n\n'
        "<donnees>\n"
        f"AFFIRMATIONS: {json.dumps(claims, ensure_ascii=False)}\n"
        f"PASSAGES: {json.dumps(ev, ensure_ascii=False)}\n"
        f"WIKIDATA_CONDAMNATIONS: {json.dumps([w['crime'] + ' ' + w['date'] for w in wikidata], ensure_ascii=False)}\n"
        f"CATEGORIES_WIKIPEDIA: {json.dumps(categories, ensure_ascii=False)}\n"
        "</donnees>"
    )


def collect(key, entry, use_news=True, discover=False):
    """Tout ce qui coûte (réseau, LLM). Retourne un dict brut, mis en cache tel quel."""
    claims_src = [(n, i) for n, i in enumerate(entry["timeline"])
                  if i["status"] in LEGAL_STATUSES and i["verification"] == "unverified"]
    if not claims_src and not discover:
        return None
    raw = {"checked_at": date.today().isoformat(), "notes": [], "indices": [n for n, _ in claims_src]}
    page = resolve_page(key)
    if not page:
        raw["notes"].append("article Wikipedia introuvable ou ambigu : rien n'est affirmé")
        return raw
    wikitext, revid = get_wikitext_and_revid(page["title"])
    raw.update(wiki_title=page["title"], qid=page["qid"], revid=revid,
               permalink=f"https://fr.wikipedia.org/w/index.php?title={page['title'].replace(' ', '_')}&oldid={revid}",
               evidence=extract_evidence(wikitext),
               wikidata=(fetch_convictions([page["qid"]]).get(page["qid"], [])) if page["qid"] else [],
               categories=[c for c in get_categories(page["title"]) if re.search(r"condamn", c, re.I)],
               headlines=fetch_headlines(key) if use_news else [])
    if not raw["evidence"]:
        raw["notes"].append("aucun passage d'affaire exploitable sur l'article")
        return raw
    payload = [{"id": f"C{pos}", "annee": i["year"], "statut": i["status"], "texte": i["title"]}
               for pos, (_, i) in enumerate(claims_src, 1)]
    raw["llm"] = ask_json(build_prompt(key, payload, raw["evidence"], raw["wikidata"], raw["categories"]))
    if raw["llm"] is None:
        raw["notes"].append("réponse LLM invalide : à relancer")
    return raw

# ─── Évaluation (pure, gratuite, rejouable) ────────────────────────────────────

def guard(claim, evidence_by_id):
    """Contrôles programmatiques. Retourne (claim corrigée, raison de rejet | None)."""
    ev = evidence_by_id.get(claim.get("evidence_id"))
    quote, status = claim.get("quote", ""), claim.get("status", "")
    if claim.get("verdict") in ("unsupported", "contradicted"):
        return claim, claim["verdict"]
    if not ev or len(quote) < 15 or norm(quote) not in norm(ev["text"]):
        return claim, "citation absente du passage"
    if status not in STATUS_RE:
        return claim, "statut invalide"
    if not STATUS_RE[status].search(quote):
        return claim, "citation incohérente avec le statut"
    title = claim.get("title", "")
    if title and not STATUS_RE[status].search(title):
        return claim, "titre incohérent avec le statut"
    if status == "condamne" and re.search(r"relax|acquitt|infirm|annul", quote, re.I):
        return claim, "citation ambiguë (condamnation et relaxe/annulation) : relecture humaine"
    if status != "condamne" or claim.get("final") not in (True, False):
        claim["final"] = None
    elif claim["final"] is True and not FINAL_RE.search(quote + " " + ev["text"]):
        claim["final"] = None                      # jamais "définitif" sur la seule parole du LLM
    return claim, None


def signals_for(claim, ev, raw, name):
    """Signaux indépendants SPÉCIFIQUES à l'affaire. 'categorie_wikipedia' est du contexte, pas une preuve."""
    sig = []
    external = [r for r in ev.get("refs", []) if "wikipedia.org" not in r["url"]]
    if external:
        sig.append("wikipedia_ref")                # citation externe attachée à CE passage
    topic = topic_tokens(claim["quote"] + " " + claim.get("title", ""), name)
    if claim["status"] == "condamne":
        matched = [c for c in raw["wikidata"] if {w[:6] for w in re.findall(r"[a-z]{5,}", fold(c["crime"]))} & topic]
        if matched:
            sig.append("wikidata")                 # déclaration P1399 sur le MÊME sujet
            external += [{"url": u, "outlet": re.sub(r"^www\.", "", re.sub(r"^https?://", "", u).split("/")[0]),
                          "title": c["crime"], "date": c["date"]} for c in matched for u in c["refs"][:2] if u.startswith("https://")]
        if any(re.search(r"condamn", c, re.I) for c in raw["categories"]):
            sig.append("categorie_wikipedia")
    surname = fold(name).split()[-1]
    kw = STATUS_RE[claim["status"]]
    outlets = sorted({h["outlet"] for h in raw["headlines"] if h["outlet"] and surname in fold(h["title"])
                      and kw.search(h["title"]) and topic & topic_tokens(h["title"], name)})
    if len(outlets) >= 2:
        sig.append("presse")                       # >= 2 médias, même sujet, même statut
    return sig, outlets, external


def tier_for(status, signals):
    spec = [s for s in signals if s != "categorie_wikipedia"]     # wikipedia_ref | wikidata | presse
    if status == "condamne":      # exige >= 2 signaux indépendants spécifiques à l'affaire
        return "verified" if len(spec) >= 2 else ("sourced" if spec else "unverified")
    if status in LEGAL_STATUSES:
        return "verified" if len(spec) >= 2 else ("sourced" if "wikipedia_ref" in spec else "unverified")
    return "unverified"


def _sources(external, permalink):
    return [{"kind": "wikipedia_ref", "url": r["url"], "outlet": r["outlet"], "title": r["title"], "date": r["date"]}
            for r in external] + [{"kind": "wikipedia", "url": permalink, "outlet": "Wikipédia (révision citée)"}]


def evaluate(raw, name):
    """raw (cache) -> {claims, new_claims} ; aucun accès réseau."""
    out = {"claims": [], "new_claims": []}
    judged = raw.get("llm")
    if not judged:
        return out
    by_id = {e["id"]: e for e in raw["evidence"]}
    for c in judged.get("claims", []):
        m = re.fullmatch(r"C(\d+)", str(c.get("id", "")))
        if not m or not (1 <= int(m.group(1)) <= len(raw["indices"])):
            continue
        c, reason = guard(c, by_id)
        row = {"index": raw["indices"][int(m.group(1)) - 1], "verdict": c.get("verdict"), "note": c.get("note", ""),
               "rejected_reason": reason}
        if reason is None:
            sig, outlets, external = signals_for(c, by_id[c["evidence_id"]], raw, name)
            row.update(status=c["status"], final=c.get("final"), year=c.get("year") or "?", quote=c["quote"],
                       title=(c.get("title") or "").strip(), evidence_id=c["evidence_id"], signals=sig,
                       press_outlets=outlets, tier=tier_for(c["status"], sig), sources=_sources(external, raw["permalink"]))
        out["claims"].append(row)
    for c in judged.get("new_claims", []):
        c, reason = guard(c, by_id)
        if reason is None and c.get("title"):
            sig, outlets, external = signals_for(c, by_id[c["evidence_id"]], raw, name)
            out["new_claims"].append({"year": c.get("year") or "?", "status": c["status"], "final": c.get("final"),
                                      "title": c["title"], "quote": c["quote"], "signals": sig, "press_outlets": outlets,
                                      "tier": tier_for(c["status"], sig), "sources": _sources(external, raw["permalink"])})
    return out

# ─── Orchestration ─────────────────────────────────────────────────────────────

def load_out():
    return json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}


def save_out(data):
    with LOCK:
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def verify_person(key, entry, use_news=True, discover=False):
    raw = collect(key, entry, use_news, discover)
    return None if raw is None else {**raw, **evaluate(raw, key)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name"); ap.add_argument("--limit", type=int); ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--no-news", action="store_true"); ap.add_argument("--redo", action="store_true")
    ap.add_argument("--rescore", action="store_true", help="rejoue les contrôles sur les réponses en cache (0 $)")
    ap.add_argument("--refresh-evidence", action="store_true",
                    help="re-parse la MÊME révision Wikipedia (mêmes passages, refs à jour) puis rescore (0 $ LLM)")
    args = ap.parse_args()
    done = load_out()

    if args.refresh_evidence:
        for key, res in done.items():
            if res.get("llm") and res.get("revid"):
                text, _ = get_wikitext_and_revid(res["wiki_title"], oldid=res["revid"])
                fresh = extract_evidence(text)
                assert [e["text"] for e in fresh] == [e["text"] for e in res["evidence"]], f"{key}: passages différents"
                res["evidence"] = fresh
        args.rescore = True

    if args.rescore:
        for key, res in done.items():
            if res.get("llm"):
                res.update(evaluate(res, key))
        save_out(done)
        print(f"{sum(1 for r in done.values() if r.get('llm'))} personne(s) ré-évaluée(s) sans appel LLM")
        return

    enc = json.loads(ENCYCLOPEDIA.read_text(encoding="utf-8"))
    todo = [(k, e) for k, e in people(enc)
            if any(i["status"] in LEGAL_STATUSES and i["verification"] == "unverified" for i in e["timeline"])
            and (args.redo or k not in done)]
    if args.name:
        todo = [(k, e) for k, e in todo if fold(k) == fold(args.name)]
    if args.limit:
        todo = todo[:args.limit]
    print(f"{len(todo)} personne(s) à vérifier ({len(done)} déjà faites)", flush=True)

    def work(item):
        key, entry = item
        try:
            res = verify_person(key, entry, use_news=not args.no_news)
        except Exception as exc:                    # une personne en erreur ne bloque pas le lot
            res = {"checked_at": date.today().isoformat(), "claims": [], "new_claims": [], "notes": [f"erreur: {exc}"]}
        if res is not None:
            done[key] = res
            save_out(done)
        ok = sum(1 for c in (res or {}).get("claims", []) if c.get("tier") in ("verified", "sourced"))
        print(f"  {key:32} {ok}/{len((res or {}).get('claims', []))} confirmées | "
              f"{len((res or {}).get('new_claims', []))} nouvelles | {'; '.join((res or {}).get('notes', []))}", flush=True)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(work, todo))
    print(f"\nLLM : {STATS['calls']} appel(s), coût estimé (équivalent API) {STATS['cost_usd']:.3f} $", flush=True)


if __name__ == "__main__":
    main()
