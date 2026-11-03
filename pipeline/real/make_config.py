"""Generate pipeline/config/countries_all.json: every UN member state except North Korea.

Rule (simple and neutral): the 193 UN member states, from Natural Earth 1:10m Admin-0, minus PRK.
Overrides (playable area, display names, notes) come from pipeline/config/packs.json.

Usage: pipeline/.venv/Scripts/python pipeline/real/make_config.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NE10 = ROOT / "pipeline" / "raw" / "naturalearth" / "ne_10m_admin_0_countries.geojson"
CFG = ROOT / "pipeline" / "config"

EXCLUDE = {"PRK"}  # requested
# Natural Earth "Country" entries that are the sovereign state itself (the rest are territories).
SOVEREIGN_COUNTRY_TYPE = {"CHN", "FRA", "FIN", "DNK", "GBR", "NLD", "USA", "AUS", "NZL"}
# Sovereign in NE but not UN members.
NOT_UN = {"TWN", "SOL", "CYN", "VAT", "KOS", "PSX", "SAH"}
EXTRA = {"KAZ", "CUB", "ISR"}  # UN members that NE types as "Sovereignty"/"Disputed"

NAME_FIXES = {
    "USA": "United States", "CZE": "Czechia", "SWZ": "Eswatini", "CIV": "Côte d'Ivoire",
    "COD": "DR Congo", "COG": "Republic of the Congo", "MKD": "North Macedonia", "TLS": "Timor-Leste",
    "FSM": "Micronesia", "STP": "São Tomé and Príncipe", "GMB": "The Gambia", "BHS": "The Bahamas",
}
CONTINENT_FIXES = {"Seven seas (open ocean)": None}  # resolved from REGION_UN below
CONTINENTS = {"Africa", "Asia", "Europe", "North America", "South America", "Oceania"}


def main() -> None:
    feats = json.loads(NE10.read_text(encoding="utf-8"))["features"]
    overrides = {c["iso"]: c for c in json.loads((CFG / "packs.json").read_text(encoding="utf-8"))["countries"]}
    out = []
    for f in feats:
        p = f["properties"]
        iso = p["ADM0_A3"]
        sovereign = p["TYPE"] == "Sovereign country" or (p["TYPE"] == "Country" and iso in SOVEREIGN_COUNTRY_TYPE) or iso in EXTRA
        if not sovereign or iso in NOT_UN or iso in EXCLUDE:
            continue
        name = NAME_FIXES.get(iso) or (p["NAME_EN"] if "." in p["NAME"] else p["NAME"])
        continent = p["CONTINENT"]
        if continent not in CONTINENTS:
            continent = {"Africa": "Africa", "Asia": "Asia", "Americas": "South America", "Oceania": "Oceania"}.get(p["REGION_UN"], "Asia")
        entry = {"iso": iso, "name": name, "continent": continent}
        if iso in overrides:
            o = overrides[iso]
            entry["name"] = o["name"]
            for k in ("keep", "note"):
                if k in o:
                    entry[k] = o[k]
        out.append(entry)
    out.sort(key=lambda e: (e["continent"], e["name"]))
    (CFG / "countries_all.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    by = {}
    for e in out:
        by[e["continent"]] = by.get(e["continent"], 0) + 1
    print(f"{len(out)} countries: {by}")


if __name__ == "__main__":
    main()
