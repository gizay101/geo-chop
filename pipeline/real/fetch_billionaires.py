"""Billionaire locations from Wikidata (CC0), aggregated to city level.

Living people with a stated net worth of at least US$1 billion and a residence that has
coordinates. Only per-city COUNTS are kept: no names or addresses go into the game.
Coverage is incomplete (Wikidata isn't Forbes), so the mode is labelled "approximate".

Usage: pipeline/.venv/Scripts/python pipeline/real/fetch_billionaires.py
Writes pipeline/raw/wikidata/billionaire_cities.json
"""
import json
import re
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import truststore

truststore.inject_into_ssl()  # use the OS certificate store (Python's bundled one can be stale)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "pipeline" / "raw" / "wikidata"

QUERY = """
SELECT ?person ?worth ?residence ?coord ?iso3 WHERE {
  ?person wdt:P31 wd:Q5 ;
          p:P2218 ?st .
  ?st psv:P2218 [ wikibase:quantityAmount ?worth ; wikibase:quantityUnit wd:Q4917 ] .
  FILTER(?worth >= 1000000000)
  FILTER NOT EXISTS { ?person wdt:P570 ?died }
  ?person wdt:P551 ?residence .
  ?residence wdt:P625 ?coord .
  OPTIONAL { ?residence wdt:P17 ?country . ?country wdt:P298 ?iso3 . }
}
"""


def main() -> None:
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": QUERY, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": "GeoChopDataPipeline/0.1 (geography game data build)"})
    with urllib.request.urlopen(req, timeout=180) as r:
        rows = json.load(r)["results"]["bindings"]

    # One vote per person: their first listed residence with coordinates.
    seen: set[str] = set()
    cities: dict[str, dict] = {}
    counts: dict[str, int] = defaultdict(int)
    for row in rows:
        person = row["person"]["value"]
        if person in seen:
            continue
        m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", row["coord"]["value"])
        if not m:
            continue
        seen.add(person)
        key = row["residence"]["value"]
        cities[key] = {
            "lon": float(m.group(1)),
            "lat": float(m.group(2)),
            "iso3": row.get("iso3", {}).get("value"),
        }
        counts[key] += 1

    out = [{**c, "count": counts[k], "wikidata": k.rsplit("/", 1)[-1]} for k, c in cities.items()]
    out.sort(key=lambda c: -c["count"])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "billionaire_cities.json").write_text(json.dumps(out, indent=1), encoding="utf-8")

    by_country: dict[str, int] = defaultdict(int)
    for c in out:
        by_country[c["iso3"] or "?"] += c["count"]
    top = sorted(by_country.items(), key=lambda kv: -kv[1])[:15]
    print(f"{len(seen)} people, {len(out)} places. Top countries: {top}")


if __name__ == "__main__":
    main()
