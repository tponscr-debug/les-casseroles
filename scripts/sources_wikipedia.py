"""
Les Casseroles — source Wikipedia (API MediaWiki, gratuite, sans clé).

Responsabilité unique : résoudre le BON article d'une personne (jamais un homonyme),
en extraire des passages d'affaires AVEC leurs références, et les catégories de
condamnation. Étiquette API : User-Agent explicite, requêtes séquentielles, pause.
"""

import json
import re
import time
import urllib.parse
import urllib.request

from casseroles_data import fold

WIKI_API     = "https://fr.wikipedia.org/w/api.php"
WIKI_HEADERS = {"User-Agent": "LesCasseroles/3.0 (open-source transparency project; tpons.cr@gmail.com)"}
SLEEP        = 0.35
POLITICIAN_RE = re.compile(r"politi|député|deputé|sénat|ministre|maire|président|élu|eurodéput|conseiller|(homme|femme|chef) d.état", re.I)
POLITICIAN_CAT_RE = re.compile(r"député|sénateur|ministre|maire de|président de la république|personnalité politique|conseiller (régional|départemental|municipal)", re.I)


def is_politician_page(page):
    """Description Wikidata OU, à défaut, catégories de l'article (garde-fou anti-homonyme)."""
    if POLITICIAN_RE.search(page.get("description", "")):
        return True
    return any(POLITICIAN_CAT_RE.search(c) for c in get_categories(page["title"]))

AFFAIRE_KEYWORDS = [
    "détournement", "mise en examen", "mis en examen", "mise en cause", "polémique", "condamn",
    "affaire", "scandale", "controverse", "plainte", "enquête", "parquet", "tribunal", "corruption",
    "trafic d'influence", "financement illégal", "prise illégale d'intérêts", "favoritisme", "soupçon",
    "poursuites", "relax", "acquitt", "prison", "garde à vue", "perquisition", "fraude", "abus de",
    "harcèlement", "emplois fictifs", "inéligib", "non-lieu", "renvoy", "cassation", "appel",
]
SECTION_KEYWORDS = ["affaire", "controvers", "judici", "polémiq", "condamn", "scandale", "mise en cause"]


def wiki_get(params, retries=2):
    params = {**params, "format": "json"}
    url = WIKI_API + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=WIKI_HEADERS), timeout=15) as r:
                return json.loads(r.read())
        except Exception:
            if attempt == retries:
                raise
            time.sleep(1.5 * (attempt + 1))


def resolve_page(name):
    """Titre exact de l'article de la personne, ou None.

    Garde-fous anti-homonyme : on exige une page non-homonymie dont la description
    Wikidata évoque la politique ET dont le titre (hors parenthèses) = le nom cherché.
    """
    candidate = " ".join(w.capitalize() for w in name.split())
    d = wiki_get({"action": "query", "titles": candidate, "redirects": 1,
                  "prop": "description|pageprops", "ppprop": "disambiguation|wikibase_item"})
    time.sleep(SLEEP)
    page = next(iter(d["query"]["pages"].values()))
    if "missing" not in page and "disambiguation" not in page.get("pageprops", {}):
        if is_politician_page(page):
            return {"title": page["title"], "qid": page.get("pageprops", {}).get("wikibase_item")}

    # repli : recherche, acceptée seulement si le titre correspond EXACTEMENT au nom
    d = wiki_get({"action": "query", "list": "search", "srsearch": f'"{name}"', "srlimit": 5, "srnamespace": 0})
    time.sleep(SLEEP)
    for hit in d["query"]["search"]:
        if fold(re.sub(r"\s*\(.*\)$", "", hit["title"])) != fold(name):
            continue
        p = wiki_get({"action": "query", "titles": hit["title"], "prop": "description|pageprops",
                      "ppprop": "disambiguation|wikibase_item"})
        time.sleep(SLEEP)
        pg = next(iter(p["query"]["pages"].values()))
        if "disambiguation" not in pg.get("pageprops", {}) and is_politician_page(pg):
            return {"title": pg["title"], "qid": pg.get("pageprops", {}).get("wikibase_item")}
    return None


def get_wikitext_and_revid(title, oldid=None):
    params = {"action": "parse", "prop": "wikitext|revid", "redirects": 1}
    params.update({"oldid": oldid} if oldid else {"page": title})
    d = wiki_get(params)
    time.sleep(SLEEP)
    return d["parse"]["wikitext"]["*"], d["parse"].get("revid")


def get_categories(title):
    """Catégories de l'article (utile : 'Personnalité politique condamnée pour …')."""
    d = wiki_get({"action": "query", "titles": title, "prop": "categories", "cllimit": 500})
    time.sleep(SLEEP)
    page = next(iter(d["query"]["pages"].values()))
    return [c["title"].split(":", 1)[-1] for c in page.get("categories", [])]


# ─── Extraction de passages + références ───────────────────────────────────────

_REF_ANY  = re.compile(r"<ref\b[^>]*?/>|<ref\b[^>]*?>.*?</ref>", re.S)   # balise auto-fermante OU avec corps
_REF_NAME = re.compile(r"name\s*=\s*[\"']?([^\"'\s/>]+)")
_URL_RE   = re.compile(r"https?://[^\s|\]}<>\"']+")
_TITLE_RE = re.compile(r"\|\s*titre\s*=\s*([^|}]+)", re.I)
_SITE_RE  = re.compile(r"\|\s*(?:site|périodique|journal|éditeur|lire en ligne)\s*=\s*([^|}]+)", re.I)
_DATE_RE  = re.compile(r"\|\s*date\s*=\s*([^|}]+)", re.I)


def _ref_info(ref_body):
    url = _URL_RE.search(ref_body)
    if not url:
        return None
    m = lambda rx: (rx.search(ref_body).group(1).strip() if rx.search(ref_body) else "")
    host = re.sub(r"^www\.", "", urllib.parse.urlparse(url.group(0)).netloc)
    return {"url": url.group(0).rstrip(".,;)"), "outlet": re.sub(r"\[\[|\]\]", "", m(_SITE_RE)) or host,
            "title": re.sub(r"[\[\]']", "", m(_TITLE_RE))[:160], "date": m(_DATE_RE)}


def _named_refs(wikitext):
    """{nom: corps} des <ref name=…>corps</ref> : les <ref name=… /> les réutilisent partout ailleurs."""
    out = {}
    for m in _REF_ANY.finditer(wikitext):
        tag = m.group(0)
        if tag.endswith("/>"):
            continue
        name = _REF_NAME.search(tag[:tag.index(">")])
        if name:
            out[name.group(1)] = tag[tag.index(">") + 1:-len("</ref>")]
    return out


def _chunk_refs(chunk, named):
    refs = []
    for m in _REF_ANY.finditer(chunk):
        tag = m.group(0)
        name = _REF_NAME.search(tag[:tag.index(">") + 1])
        body = named.get(name.group(1), "") if tag.endswith("/>") and name else tag[tag.index(">") + 1:-len("</ref>")]
        info = _ref_info(body) if body else None
        if info and info["url"] not in [r["url"] for r in refs]:
            refs.append(info)
    return refs


def extract_evidence(wikitext, max_passages=45):
    """Liste de passages {id, text, refs[]} : phrases d'affaires + sources citées juste après."""
    t = re.sub(r"\{\{(?:Fichier|File|Infobox)[^}]*\}\}", "", wikitext)
    named = _named_refs(wikitext)
    sections = re.split(r"\n(?==+[^=].*?=+\s*\n)", t)
    passages = []
    for sec in sections:
        title_m = re.match(r"=+\s*(.*?)\s*=+", sec)
        sec_title = title_m.group(1).lower() if title_m else ""
        in_affaire_section = any(k in sec_title for k in SECTION_KEYWORDS)
        # on garde les <ref> attachées à chaque phrase avant de nettoyer
        for chunk in re.split(r"(?<=[.!?])\s+(?=[A-ZÉÈÀ«\[])", sec):
            refs = _chunk_refs(chunk, named)
            plain = _REF_ANY.sub("", chunk)
            plain = re.sub(r"\[\[(?:Fichier|File|Catégorie)[^\]]*\]\]", "", plain)
            plain = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", plain)
            plain = re.sub(r"\{\{[^{}]{0,300}\}\}", "", plain)
            plain = re.sub(r"'{2,}|={2,}[^=]+={2,}", "", plain)
            plain = re.sub(r"\s+", " ", plain).strip()
            low = plain.lower()
            if len(plain) > 40 and (in_affaire_section or any(k in low for k in AFFAIRE_KEYWORDS)) \
                    and any(k in low for k in AFFAIRE_KEYWORDS):
                passages.append({"text": plain[:600], "refs": refs[:3], "section": sec_title})
    return [{"id": f"E{i + 1}", **p} for i, p in enumerate(passages[:max_passages])]


# ─── Revisions (détection des changements) ─────────────────────────────────────

def latest_revids(titles, batch=50):
    """{titre: revid} — 50 titres par requête : tout le roster en ~17 appels."""
    out = {}
    for i in range(0, len(titles), batch):
        d = wiki_get({"action": "query", "titles": "|".join(titles[i:i + batch]), "prop": "info", "redirects": 1})
        time.sleep(SLEEP)
        redirects = {r["from"]: r["to"] for r in d["query"].get("redirects", [])}
        by_title = {p["title"]: p.get("lastrevid") for p in d["query"]["pages"].values()}
        for t in titles[i:i + batch]:
            out[t] = by_title.get(redirects.get(t, t))
    return out


# ─── Roster : sénateurs ────────────────────────────────────────────────────────

SENATOR_CATEGORIES = [
    ("Sénateur_membre_du_Rassemblement_national", "Rassemblement National"),
    ("Sénateur_membre_des_Républicains", "Les Républicains"),
    ("Sénateur_membre_du_Parti_socialiste_(France)", "Parti socialiste"),
    ("Sénateur_membre_de_La_France_insoumise", "La France insoumise"),
    ("Sénateur_membre_du_Parti_communiste_français", "Parti communiste français"),
    ("Sénateur_membre_du_Mouvement_démocrate_(France)", "MoDem"),
    ("Sénateur_membre_d'Horizons", "Horizons"),
]


def get_senators():
    """{titre Wikipedia: parti} des sénateurs listés par catégorie."""
    out = {}
    for cat, party in SENATOR_CATEGORIES:
        d = wiki_get({"action": "query", "list": "categorymembers", "cmtitle": f"Catégorie:{cat}",
                      "cmlimit": 500, "cmnamespace": 0})
        time.sleep(SLEEP)
        for m in d.get("query", {}).get("categorymembers", []):
            out.setdefault(m["title"], party)
    return out
