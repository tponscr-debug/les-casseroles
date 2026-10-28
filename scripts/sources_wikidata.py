"""
Les Casseroles — source Wikidata (SPARQL, sans clé).

Responsabilité unique : récupérer les déclarations P1399 ("condamné pour") AVEC leurs
références (URL de presse) pour une liste de QID, en UNE requête. Sert de second
signal indépendant pour recouper une condamnation avant de la déclarer "vérifiée".
Étiquette : User-Agent explicite, une requête groupée, pas de rafale.
"""

import json
import urllib.parse
import urllib.request

ENDPOINT = "https://query.wikidata.org/sparql"
HEADERS  = {"User-Agent": "LesCasseroles/3.0 (open-source transparency project; tpons.cr@gmail.com)",
            "Accept": "application/sparql-results+json"}


def fetch_convictions(qids, chunk=120):
    """{qid: [{'crime': str, 'date': str, 'refs': [url, ...]}]} — vide si aucune déclaration."""
    out = {}
    qids = [q for q in qids if q]
    for i in range(0, len(qids), chunk):
        values = " ".join(f"wd:{q}" for q in qids[i:i + chunk])
        query = f"""
        SELECT ?p ?crimeLabel ?date ?ref WHERE {{
          VALUES ?p {{ {values} }}
          ?p p:P1399 ?s . ?s ps:P1399 ?crime .
          OPTIONAL {{ ?s pq:P585 ?date }}
          OPTIONAL {{ ?s prov:wasDerivedFrom/pr:P854 ?ref }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }}
        }}"""
        url = ENDPOINT + "?" + urllib.parse.urlencode({"query": query})
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=90) as r:
            rows = json.loads(r.read())["results"]["bindings"]
        for row in rows:
            qid = row["p"]["value"].rsplit("/", 1)[-1]
            entry = next((e for e in out.setdefault(qid, []) if e["crime"] == row["crimeLabel"]["value"]), None)
            if entry is None:
                entry = {"crime": row["crimeLabel"]["value"], "date": row.get("date", {}).get("value", "")[:10], "refs": []}
                out[qid].append(entry)
            ref = row.get("ref", {}).get("value")
            if ref and ref not in entry["refs"]:
                entry["refs"].append(ref)
    return out
