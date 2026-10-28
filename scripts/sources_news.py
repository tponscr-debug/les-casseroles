"""
Les Casseroles — signal presse (Google News RSS, sans clé, non officiel).

Responsabilité unique : compter combien de médias DISTINCTS titrent sur une issue
judiciaire d'une personne. C'est un signal de recoupement, jamais une source affichée
(les liens Google News sont des redirections instables). Usage modéré : 1 requête/personne.
"""

import re
import time
import urllib.parse
import urllib.request
from xml.etree import ElementTree

from casseroles_data import fold

UA = {"User-Agent": "LesCasseroles/3.0 (open-source transparency project; tpons.cr@gmail.com)"}
KEYWORDS = {
    "condamne":      r"condamn|coupable|peine de prison|inéligib",
    "mis_en_examen": r"mis(e)? en examen|mise en examen",
    "renvoye":       r"renvoy|procès",
    "relaxe":        r"relax|acquitt",
    "non_lieu":      r"non-?lieu",
    "enquete":       r"enquête|perquisition|garde à vue|plainte",
    "mise_en_cause": r"accus|soupçon|mis(e)? en cause|mise en cause|détourn|fraud|corrupt|escroqu|abus|favoritisme",
}
SLEEP = 1.0


def fetch_headlines(name, retries=1):
    query = f'"{name}" (condamné OR relaxé OR "mis en examen" OR procès OR "non-lieu" OR enquête)'
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": query, "hl": "fr", "gl": "FR", "ceid": "FR:fr"})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                root = ElementTree.fromstring(r.read())
            time.sleep(SLEEP)
            return [{"title": i.findtext("title", ""), "outlet": (i.findtext("source") or "").strip(),
                     "date": i.findtext("pubDate", "")[:16]} for i in root.iter("item")]
        except Exception:
            time.sleep(2)
    return []


def corroborating_outlets(headlines, name, status):
    """Médias distincts dont le titre contient le nom de famille ET un mot-clé du statut."""
    surname = fold(name).split()[-1]
    rx = re.compile(KEYWORDS.get(status, "$^"), re.I)
    outlets = {h["outlet"] for h in headlines
               if h["outlet"] and surname in fold(h["title"]) and rx.search(h["title"])}
    return sorted(outlets)
