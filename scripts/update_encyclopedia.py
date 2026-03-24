#!/usr/bin/env python3
"""
Les Casseroles — Script de mise à jour de l'encyclopédie
=========================================================
Sources : Wikipedia (API) + Claude Haiku (extraction structurée)
Usage   : python3 scripts/update_encyclopedia.py [--senators-only] [--all] [--name "prénom nom"]

Workflow :
  1. Récupère la liste des personnes à traiter (base existante + sénateurs)
  2. Pour chaque personne, fetche le wikitext complet de sa page Wikipedia
  3. Extrait les passages contenant des mots-clés d'affaires
  4. Demande à Claude Haiku de structurer en JSON
  5. Merge avec l'encyclopédie existante et sauvegarde
"""

import json
import time
import re
import sys
import argparse
import unicodedata
import urllib.parse
import urllib.request
import os
from pathlib import Path

try:
    import anthropic
except ImportError:
    print("❌ anthropic manquant. Installe-le : pip install anthropic")
    sys.exit(1)

# ─── Config ────────────────────────────────────────────────────────────────────

ROOT         = Path(__file__).parent.parent
ENCYCLOPEDIA = ROOT / "data" / "encyclopedia.json"
WIKI_API     = "https://fr.wikipedia.org/w/api.php"
WIKI_HEADERS = {"User-Agent": "LesCasseroles/2.0 (open-source transparency project)"}

AFFAIRE_KEYWORDS = [
    "détournement", "mise en examen", "mis en examen", "mise en cause",
    "polémique", "condamn", "affaire", "scandale", "controverse",
    "mediapart", "canard enchaîné", "plainte", "enquête judiciaire",
    "parquet", "tribunal", "corruption", "trafic d'influence",
    "financement illégal", "prise illégale d'intérêts", "favoritisme",
    "soupçon", "poursuites", "relaxé", "acquitté", "prison", "garde à vue",
    "perquisition", "fraude", "détournement", "abus de biens",
]

MODEL   = "claude-haiku-4-5-20251001"
SLEEP   = 0.3   # pause entre requêtes Wikipedia (politesse)
API_RPM = 50    # requêtes/minute Haiku (limite conservative)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def normalize(s):
    """Normalise un nom : sans accents, minuscules."""
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower().strip()

def wiki_get(params):
    """Appel GET à l'API MediaWiki."""
    params["format"] = "json"
    url = WIKI_API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=WIKI_HEADERS)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def find_wikipedia_page(name):
    """Cherche la page Wikipedia d'une personne. Retourne le titre exact ou None."""
    # Essai direct avec le nom
    candidate = name.title()
    try:
        d = wiki_get({"action": "query", "titles": candidate, "redirects": "1"})
        pages = d["query"]["pages"]
        page = next(iter(pages.values()))
        if "missing" not in page:
            return page["title"]
    except Exception:
        pass

    # Recherche plein texte
    try:
        d = wiki_get({"action": "query", "list": "search", "srsearch": name,
                      "srnamespace": "0", "srlimit": "1"})
        results = d["query"]["search"]
        if results:
            return results[0]["title"]
    except Exception:
        pass

    return None

def get_wikitext(title):
    """Récupère le wikitext complet d'une page."""
    try:
        d = wiki_get({"action": "parse", "page": title, "prop": "wikitext"})
        return d["parse"]["wikitext"]["*"]
    except Exception:
        return None

def extract_relevant_passages(wikitext, name):
    """Extrait les passages du wikitext contenant des mots-clés d'affaires."""
    if not wikitext:
        return ""

    # Nettoyer le wikitext de base
    text = wikitext
    text = re.sub(r"<ref[^/]*/?>.*?</ref>", " [source] ", text, flags=re.DOTALL)
    text = re.sub(r"<ref[^>]*/?>", " [source] ", text)
    text = re.sub(r"\[\[Fichier:[^\]]+\]\]", "", text)
    text = re.sub(r"\[\[File:[^\]]+\]\]", "", text)
    text = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", text)
    text = re.sub(r"\{\{[^}]{0,200}\}\}", "", text)
    text = re.sub(r"'{2,}", "", text)
    text = re.sub(r"\[https?://[^\s\]]+[^\]]*\]", "", text)
    text = re.sub(r"\s+", " ", text)

    # Trouver les sections liées aux affaires
    section_keywords = ["affaires", "controvers", "judici", "polémiq", "condamn",
                        "scandale", "mise en cause", "poursuit", "critique"]

    passages = []
    sections = re.split(r"={2,}[^=]+={2,}", text)
    section_titles = re.findall(r"={2,}([^=]+)={2,}", wikitext)

    for i, section in enumerate(sections):
        title = section_titles[i - 1].lower() if i > 0 and i - 1 < len(section_titles) else ""
        is_affaire_section = any(kw in title for kw in section_keywords)
        section_lower = section.lower()
        has_keywords = any(kw in section_lower for kw in AFFAIRE_KEYWORDS)

        if is_affaire_section or has_keywords:
            # Extraire les phrases avec des mots-clés
            sentences = re.split(r"[.!?]\s+", section)
            for sent in sentences:
                if any(kw in sent.lower() for kw in AFFAIRE_KEYWORDS) and len(sent.strip()) > 40:
                    passages.append(sent.strip())

    return "\n".join(passages[:40])  # max 40 passages pour éviter les tokens excessifs

def extract_affaires_with_claude(client, name, passages, existing_timeline):
    """Demande à Claude Haiku d'extraire les affaires structurées."""
    if not passages.strip():
        return None

    existing_titles = [item.get("title", "") for item in (existing_timeline or [])]
    existing_str = "\n".join(f"- {t}" for t in existing_titles) if existing_titles else "Aucune"

    prompt = f"""Tu es un assistant qui extrait des affaires politiques depuis du texte Wikipedia en français.

Politicien : {name}
Affaires déjà dans notre base :
{existing_str}

Passages Wikipedia (extraits bruts) :
---
{passages[:6000]}
---

Ta tâche : extraire UNIQUEMENT les nouvelles affaires non déjà listées ci-dessus.
Pour chaque affaire, retourne un objet JSON avec :
- "year": l'année (string, ex: "2023"). Si inconnue, "?"
- "type": "judiciaire" si procédure judiciaire, condamnation, mise en examen, enquête du parquet. Sinon "polémique"
- "title": description factuelle en 1-2 phrases, en français, sans jugement. Cite les faits documentés.

RÈGLES IMPORTANTES :
- Ne PAS inventer. Si ce n'est pas dans le texte, ne l'ajoute pas.
- Ne PAS inclure des affaires déjà listées.
- Si aucune nouvelle affaire, retourne une liste vide [].
- Réponse UNIQUEMENT en JSON valide, sans commentaire.

Format attendu :
[
  {{"year": "2023", "type": "judiciaire", "title": "Condamné à 3 ans de prison..."}},
  {{"year": "2021", "type": "polémique", "title": "Polémique suite à..."}}
]"""

    try:
        r = client.messages.create(
            model=MODEL,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = r.content[0].text.strip()
        # Parser le JSON
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        return []
    except json.JSONDecodeError:
        return []
    except Exception as e:
        print(f"    ⚠️  Claude erreur: {e}")
        return []

def generate_satirical_comment(client, name, role, affaires):
    """Génère un commentaire satirique court pour un nouveau politicien."""
    if not affaires:
        return ""
    prompt = f"""Génère UNE seule phrase satirique et piquante (20-40 mots max) sur {name}, {role}.
Basé sur ses affaires : {', '.join(a['title'][:60] for a in affaires[:3])}.
Ton : mordant mais factuel. Pas de point d'exclamation. Réponds UNIQUEMENT avec la phrase, sans guillemets."""
    try:
        r = client.messages.create(
            model=MODEL,
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}]
        )
        return r.content[0].text.strip().strip('"').strip("'")
    except Exception:
        return ""

# ─── Récupération des sénateurs ────────────────────────────────────────────────

def get_senators_from_wikipedia():
    """Récupère la liste des sénateurs actuels depuis Wikipedia."""
    senators = {}

    # Catégories Wikipedia des sénateurs par parti
    categories = [
        "Sénateur_membre_du_Rassemblement_national",
        "Sénateur_membre_des_Républicains",
        "Sénateur_membre_de_Renaissance_(parti_politique)",
        "Sénateur_membre_d'Horizons",
        "Sénateur_membre_du_Parti_socialiste_(France)",
        "Sénateur_membre_du_Mouvement_démocrate_(France)",
        "Sénateur_membre_de_La_France_insoumise",
        "Sénateur_membre_du_Parti_communiste_français",
        "Sénateur_membre_d'Europe_Écologie_Les_Verts",
        "Sénateur_membre_de_l'Union_centriste_(France,_2017)",
    ]

    # Groupes sénatoriaux pour récupérer les membres
    groups_api = [
        ("Rassemblement_des_démocrates,_progressistes_et_indépendants", "RDPI/Renaissance"),
        ("Les_Républicains_au_Sénat", "LR"),
        ("Rassemblement_national_au_Sénat", "RN"),
        ("Socialistes,_Écologistes_et_Républicains", "PS/Socialiste"),
        ("Union_centriste_(groupe)", "UC/MoDem"),
        ("Les_Indépendants_–_République_et_Territoires", "Indépendants"),
        ("Communiste_Républicain_Citoyen_et_Écologiste_-_Kanaky", "PCF/CRCE"),
        ("Écologistes_-_Solidarité_et_Territoires", "Verts"),
        ("La_Gauche_Républicaine_et_Socialiste", "Gauche"),
        ("Rassemblement_Démocratique_et_Social_Européen", "RDSE"),
    ]

    print("📋 Récupération des sénateurs depuis Wikipedia...")
    total = 0

    for cat_name, party_label in [
        ("Sénateur_membre_du_Rassemblement_national", "Rassemblement National"),
        ("Sénateur_membre_des_Républicains", "Les Républicains"),
        ("Sénateur_membre_de_Renaissance_%28parti_politique%29", "Renaissance"),
    ]:
        try:
            d = wiki_get({
                "action": "query",
                "list": "categorymembers",
                "cmtitle": f"Catégorie:{cat_name}",
                "cmlimit": "500",
                "cmnamespace": "0",
            })
            members = d.get("query", {}).get("categorymembers", [])
            for m in members:
                key = normalize(m["title"])
                if key not in senators:
                    senators[key] = {"wiki_title": m["title"], "party": party_label}
                    total += 1
            time.sleep(SLEEP)
        except Exception as e:
            print(f"  ⚠️  Catégorie {cat_name}: {e}")

    # Compléter avec une recherche directe sur les groupes sénatoriaux
    for group, party in groups_api:
        try:
            d = wiki_get({
                "action": "query",
                "list": "categorymembers",
                "cmtitle": f"Catégorie:{group}",
                "cmlimit": "500",
                "cmnamespace": "0",
            })
            members = d.get("query", {}).get("categorymembers", [])
            for m in members:
                key = normalize(m["title"])
                if key not in senators:
                    senators[key] = {"wiki_title": m["title"], "party": party}
                    total += 1
            time.sleep(SLEEP)
        except Exception:
            pass

    print(f"  → {total} sénateurs trouvés")
    return senators

# ─── Traitement principal ──────────────────────────────────────────────────────

def process_person(client, name_key, wiki_title, existing_entry, party_hint=None):
    """Traite une personne : Wikipedia → Claude → JSON."""
    title = find_wikipedia_page(wiki_title or name_key) if not wiki_title else wiki_title
    time.sleep(SLEEP)

    if not title:
        return None

    wikitext = get_wikitext(title)
    time.sleep(SLEEP)

    if not wikitext:
        return None

    passages = extract_relevant_passages(wikitext, name_key)
    if not passages.strip():
        return existing_entry  # Rien de nouveau

    existing_timeline = existing_entry.get("timeline", []) if existing_entry else []
    new_affaires = extract_affaires_with_claude(client, name_key, passages, existing_timeline)

    if not new_affaires:
        return existing_entry

    # Fusionner avec l'existant
    merged = {**(existing_entry or {})}
    merged["timeline"] = existing_timeline + new_affaires
    merged["casseroles_count"] = len(merged["timeline"])

    # Générer un satirical_comment si nouveau profil
    if not existing_entry and new_affaires:
        role = merged.get("role", "Homme politique")
        merged["satirical_comment"] = generate_satirical_comment(client, name_key, role, new_affaires)

    return merged

def run(args):
    print("\n🍳 Les Casseroles — Mise à jour de l'encyclopédie")
    print("=" * 55)

    # Charger l'encyclopédie existante
    with open(ENCYCLOPEDIA, "r", encoding="utf-8") as f:
        encyclopedia = json.load(f)
    print(f"📚 Base actuelle : {len(encyclopedia)} profils")

    # Initialiser le client Claude
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ ANTHROPIC_API_KEY non définie.")
        print("   Lance : export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)
    client = anthropic.Anthropic(api_key=api_key)

    # Construire la liste des personnes à traiter
    to_process = {}

    if args.name:
        # Mode ciblé
        key = normalize(args.name)
        to_process[key] = {"existing": encyclopedia.get(key), "wiki_title": args.name.title()}

    elif args.senators_only:
        senators = get_senators_from_wikipedia()
        for key, info in senators.items():
            if key not in encyclopedia:
                to_process[key] = {"existing": None, "wiki_title": info["wiki_title"], "party": info.get("party")}
        print(f"📋 {len(to_process)} nouveaux sénateurs à ajouter")

    else:  # --all (défaut)
        # Mettre à jour tous les profils existants
        for key, entry in encyclopedia.items():
            to_process[key] = {"existing": entry, "wiki_title": key.title()}
        # Ajouter les sénateurs manquants
        senators = get_senators_from_wikipedia()
        new_senators = 0
        for key, info in senators.items():
            if key not in to_process:
                to_process[key] = {"existing": None, "wiki_title": info["wiki_title"], "party": info.get("party")}
                new_senators += 1
        print(f"📋 {len(encyclopedia)} profils à mettre à jour + {new_senators} sénateurs à ajouter")

    if not to_process:
        print("✅ Rien à traiter.")
        return

    # Traitement
    updated = 0
    added   = 0
    errors  = 0
    total   = len(to_process)

    for i, (key, info) in enumerate(to_process.items(), 1):
        name_display = key.title()
        print(f"\n[{i}/{total}] {name_display}")

        try:
            result = process_person(
                client,
                key,
                info.get("wiki_title"),
                info.get("existing"),
                info.get("party"),
            )

            if result is None:
                print(f"  → Page Wikipedia introuvable, ignoré")
                continue

            # Pré-remplir le parti si nouveau sénateur
            if not result.get("party") and info.get("party"):
                result["party"] = info["party"]
            if not result.get("role"):
                result["role"] = "Sénateur"

            existing = info.get("existing")
            if existing is None:
                added += 1
                n_new = len(result.get("timeline", []))
                print(f"  ✅ Ajouté — {n_new} affaire(s)")
            else:
                old_count = len(existing.get("timeline", []))
                new_count = len(result.get("timeline", []))
                diff = new_count - old_count
                if diff > 0:
                    updated += 1
                    print(f"  ✅ +{diff} affaire(s) (total: {new_count})")
                else:
                    print(f"  → Aucune nouvelle affaire")

            encyclopedia[key] = result

        except Exception as e:
            errors += 1
            print(f"  ❌ Erreur: {e}")

        # Sauvegarder toutes les 25 personnes (checkpoint)
        if i % 25 == 0:
            with open(ENCYCLOPEDIA, "w", encoding="utf-8") as f:
                json.dump(encyclopedia, f, ensure_ascii=False, indent=2)
            print(f"\n💾 Checkpoint sauvegardé ({i}/{total})")

        # Respecter le rate limit API
        time.sleep(60 / API_RPM)

    # Sauvegarde finale
    with open(ENCYCLOPEDIA, "w", encoding="utf-8") as f:
        json.dump(encyclopedia, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 55}")
    print(f"✅ Terminé !")
    print(f"   Profils mis à jour   : {updated}")
    print(f"   Nouveaux profils     : {added}")
    print(f"   Erreurs              : {errors}")
    print(f"   Total dans la base   : {len(encyclopedia)}")
    print(f"\n💾 Encyclopédie sauvegardée → {ENCYCLOPEDIA}")
    print(f"   → git add data/encyclopedia.json && git commit -m 'data: mise à jour encyclopédie' && git push")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mise à jour de l'encyclopédie Les Casseroles")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--senators-only", action="store_true", help="Ajouter uniquement les sénateurs manquants")
    group.add_argument("--all",           action="store_true", help="Tout mettre à jour (défaut)")
    group.add_argument("--name",          type=str,            help='Traiter une seule personne (ex: "Bruno Retailleau")')
    args = parser.parse_args()
    if not args.senators_only and not args.name:
        args.all = True
    run(args)
