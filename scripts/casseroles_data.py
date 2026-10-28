"""
Les Casseroles — helpers partagés par les scripts de données.

Responsabilité unique : normalisation (clés, partis, types, années) et règles
métier sur les statuts judiciaires. Aucun appel réseau ici.
"""

import re
import unicodedata
from pathlib import Path

ROOT         = Path(__file__).resolve().parent.parent
ENCYCLOPEDIA = ROOT / "data" / "encyclopedia.json"
SCHEMA       = 3

# ─── Statuts ───────────────────────────────────────────────────────────────────
# Les statuts "juridiques" ne sont affichés que s'ils sont vérifiés (cf. VERIFIED_TIERS).

LEGAL_STATUSES = {"condamne", "mis_en_examen", "renvoye", "relaxe", "non_lieu", "enquete", "mise_en_cause"}
ALL_STATUSES   = LEGAL_STATUSES | {"polemique", "contexte"}
VERIFIED_TIERS = {"verified", "sourced"}           # "unverified" => jamais affiché pour un statut juridique

# ─── Clés ──────────────────────────────────────────────────────────────────────

def fold(s):
    """Minuscule sans accents, espaces normalisés — pour COMPARER, jamais pour stocker."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


def entry_key(name):
    """Clé stockée : minuscule, accents conservés (NFC), espaces normalisés."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", name or "").lower()).strip()


def is_meta(key):
    return key.startswith("_")


def people(encyclopedia):
    """Itère (clé, entrée) en ignorant les clés techniques (_meta)."""
    return ((k, v) for k, v in encyclopedia.items() if not is_meta(k))


def build_fold_index(encyclopedia):
    """{clé pliée: clé stockée} — évite les doublons accentués/non accentués."""
    return {fold(k): k for k, _ in people(encyclopedia)}

# ─── Partis ────────────────────────────────────────────────────────────────────

# (motif sur texte plié, libellé canonique) — premier qui matche gagne.
_PARTY_RULES = [
    (r"union des droites|\budr\b",                             "Union des droites pour la République"),
    (r"rassemblement national|^rn$|\brn\b",                    "Rassemblement National"),
    (r"france insoumise|\blfi\b",                              "La France insoumise"),
    (r"communiste|^pcf$|\bpcf\b",                              "Parti communiste français"),
    (r"socialiste|\(soc\)|^ps$",                               "Parti socialiste"),
    (r"horizons",                                              "Horizons"),
    (r"renaissance|lrem|en marche|ensemble pour la republique|\bepr\b|^ensemble|majorite presidentielle",
                                                               "Renaissance"),
    (r"republicains|droite republicaine|^lr$",                 "Les Républicains"),
    (r"modem|mouvement democrate|les democrates|^dem\b",       "MoDem"),
    (r"\bliot\b|libertes, independants",                       "LIOT"),
    (r"^udi\b|union des democrates et independants",           "UDI"),
    (r"ecologist|eelv|\becos\b",                               "Les Écologistes"),
]
_PARTY_EMPTY = {"", "inconnu", "n/a", "na", "aucun", "sans etiquette", "non renseigne"}


def canonical_party(raw):
    """Ramène les ~290 variantes de parti à ~20 libellés. Chaîne vide si inconnu."""
    f = fold(raw)
    if f in _PARTY_EMPTY:
        return ""
    for pattern, label in _PARTY_RULES:
        if re.search(pattern, f):
            return label
    cleaned = re.sub(r"\s*\([^)]*\)\s*$", "", (raw or "").strip()).strip()
    return "" if fold(cleaned) in _PARTY_EMPTY else cleaned

# ─── Types & statuts ───────────────────────────────────────────────────────────

# Événements de carrière, pas des affaires : conservés dans le JSON mais jamais comptés.
_CONTEXT_TYPES = {
    "mandat", "election", "fin de mandat", "nomination", "reelection", "retour en mandat",
    "elargissement", "role", "fonction", "activite politique", "transition politique",
    "proposition de loi", "loi", "vote", "contexte",
}

# Un titre qui décrit une issue/procédure judiciaire passe par la vérification,
# QUEL QUE SOIT le "type" posé par l'ancien script (sinon un "polémique" qui
# dit "condamné à…" contournerait le contrôle).
LEGAL_RE = re.compile(
    r"condamn|coupable|relax|acquitt|non-?lieu|mis(e)? en examen|mise en examen|renvoy|"
    r"inéligib|ineligib|garde à vue|perquisition|plainte|parquet|enquête|information judiciaire|instruction|"
    r"procès|tribunal|cour d'appel|cassation|sursis|prison|amende|poursuiv|signalement|article 40|"
    r"accus|soupçon|mis(e)? en cause|mise en cause|détourn|fraud|corrupt|escroqu|abus de|favoritisme|"
    r"trafic d.influence|prise illégale|emplois? fictifs?|harcèlement|agression|violence|\bviol\b|blanchiment|"
    r"financement (illégal|occulte)|conflit d.intérêts?",
    re.IGNORECASE,
)

_PROCEDURE_RE = re.compile(r"enquête|plainte|garde à vue|perquisition|parquet|signalement|article 40|information judiciaire|instruction|poursuiv", re.I)
_ALLEGATION_RE = re.compile(
    r"accus|soupçon|mis(e)? en cause|mise en cause|détourn|fraud|corrupt|escroqu|abus de|favoritisme|trafic d.influence|"
    r"prise illégale|emplois? fictifs?|harcèlement|agression|violence|\bviol\b|blanchiment|financement (illégal|occulte)|conflit d.intérêts?", re.I)


def infer_status(title, type_hint=""):
    """Statut déduit du texte — heuristique pour l'ancien contenu, remplacée par la vérification."""
    t = (title or "").lower()
    if re.search(r"relax|acquitt", t):                      return "relaxe"
    if re.search(r"non-?lieu", t):                          return "non_lieu"
    if re.search(r"condamn|reconnu(e)? coupable|déclaré(e)? coupable", t):
                                                            return "condamne"
    if re.search(r"mis(e)? en examen|mise en examen", t):   return "mis_en_examen"
    if re.search(r"renvoy.{0,30}(tribunal|procès|correctionnel|assises)|procès", t):
                                                            return "renvoye"
    if _PROCEDURE_RE.search(t):                             return "enquete"
    if _ALLEGATION_RE.search(t):                            return "mise_en_cause"
    return "contexte" if canonical_type(type_hint) == "contexte" else "polemique"


def canonical_type(raw):
    f = fold(raw)
    if f in _CONTEXT_TYPES:
        return "contexte"
    return "judiciaire" if ("jud" in f or "infraction" in f) else "polémique"


def claims_legal_outcome(item):
    return bool(LEGAL_RE.search(item.get("title", ""))) or item.get("type") == "judiciaire"


def clean_year(raw):
    """'2019-2022' -> '2019', 'Avant 2024' -> '2024', 'circa 2022' -> '2022', sinon '?'."""
    m = re.search(r"(19|20)\d{2}", str(raw or ""))
    return m.group(0) if m else "?"

# ─── Dédoublonnage ─────────────────────────────────────────────────────────────

def title_signature(title):
    words = [w for w in re.findall(r"[a-z0-9]+", fold(title)) if len(w) > 3]
    return frozenset(words)


def is_duplicate(a, b, threshold=0.6):
    """Même événement ? (Jaccard sur les mots significatifs, même année si connue)."""
    sa, sb = title_signature(a["title"]), title_signature(b["title"])
    if not sa or not sb:
        return False
    if a.get("year") not in (None, "?") and b.get("year") not in (None, "?") and a["year"] != b["year"]:
        return False
    return len(sa & sb) / len(sa | sb) >= threshold


def merge_timelines(*timelines):
    out = []
    for tl in timelines:
        for item in tl:
            if not any(is_duplicate(item, seen) for seen in out):
                out.append(item)
    return out

# ─── Normalisation d'une entrée (idempotente) ──────────────────────────────────

def clean_item(item):
    raw_type, raw_year = item.get("type", ""), item.get("year", "?")
    item["type"] = canonical_type(raw_type)
    year = clean_year(raw_year)
    if str(raw_year) != year:
        item.setdefault("year_raw", str(raw_year))
    item["year"] = year
    # un titre à issue judiciaire n'est jamais "contexte" ni purement "polémique"
    if item["type"] != "judiciaire" and LEGAL_RE.search(item.get("title", "")) and item["type"] == "polémique":
        item["type"] = "judiciaire"
    item.setdefault("status", infer_status(item.get("title", ""), raw_type))
    if item.get("verification", "unverified") == "unverified" and item.get("origin") != "verification" and not item.get("evidence"):
        item["status"] = infer_status(item.get("title", ""), raw_type)
    if item["status"] not in ALL_STATUSES:
        item["status"] = infer_status(item.get("title", ""), raw_type)
    item.setdefault("final", None)
    item.setdefault("verification", "unverified")
    item.setdefault("sources", [])
    return item


def is_displayable(item):
    """Règle d'affichage (miroir de js/data.js) : un statut juridique n'est montré qu'avec preuve.

    - condamnation : niveau "verified" exigé (>= 2 signaux indépendants)
    - autres statuts juridiques : "verified" ou "sourced"
    - polémique : toujours (pas d'affirmation judiciaire) ; contexte : jamais.
    """
    status, tier = item.get("status"), item.get("verification")
    if item.get("superseded") or status == "contexte" or item.get("type") == "contexte":
        return False
    if status == "condamne":
        return tier == "verified"
    if status in LEGAL_STATUSES:
        return tier in VERIFIED_TIERS
    return True


def count_affairs(entry):
    return sum(1 for i in entry.get("timeline", []) if is_displayable(i))


def clean_entry(entry):
    party = canonical_party(entry.get("party", ""))
    if party != entry.get("party", ""):
        entry.setdefault("party_raw", entry.get("party", ""))
    entry["party"] = party
    entry["timeline"] = [clean_item(i) for i in entry.get("timeline", [])]
    entry["casseroles_count"] = count_affairs(entry)
    return entry
