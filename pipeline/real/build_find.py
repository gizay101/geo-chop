"""FIND & SLICE maps: the world (Equal Earth) and state/province maps, as named outlines.

Usage: pipeline/.venv/Scripts/python pipeline/real/build_find.py
Writes mobile/src/data/find/<map>.json (integer coords 0..65535 in normalised map space).
"""
import json
import math
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
NE = ROOT / "pipeline" / "raw" / "naturalearth"
OUT = ROOT / "mobile" / "src" / "data" / "find"
Q = 65535
DEG = math.pi / 180
STATE_MAPS = {"USA": "United States", "CAN": "Canada", "AUS": "Australia", "BRA": "Brazil", "IND": "India"}


def equal_earth(lon, lat):
    a1, a2, a3, a4, m = 1.340264, -0.081106, 0.000893, 0.003796, math.sqrt(3) / 2
    th = np.arcsin(m * np.sin(np.asarray(lat) * DEG))
    t2, t6 = th * th, th ** 6
    x = np.asarray(lon) * DEG * np.cos(th) / (m * (a1 + 3 * a2 * t2 + t6 * (7 * a3 + 9 * a4 * t2)))
    return x, th * (a1 + a2 * t2 + t6 * (a3 + a4 * t2))


def laea(lon0, lat0):
    sp0, cp0 = math.sin(lat0 * DEG), math.cos(lat0 * DEG)

    def f(lon, lat):
        p, dl = np.asarray(lat) * DEG, (np.asarray(lon) - lon0) * DEG
        k = np.sqrt(2 / (1 + sp0 * np.sin(p) + cp0 * np.cos(p) * np.cos(dl)))
        return k * np.cos(p) * np.sin(dl), k * (cp0 * np.sin(p) - sp0 * np.cos(p) * np.cos(dl))

    return f


def polys(geom):
    g = shape(geom)
    return list(getattr(g, "geoms", [g]))


def build(name, title, items, proj, tol):
    """items: (id, name, extra dict, [shapely polygons in lon/lat])"""
    projected = []
    for fid, fname, extra, ps in items:
        pp = []
        for p in ps:
            rings = [np.asarray(p.exterior.coords)] + [np.asarray(i.coords) for i in p.interiors]
            pp.append([np.column_stack(proj(r[:, 0], r[:, 1])) for r in rings])
        projected.append((fid, fname, extra, pp))
    xs = np.concatenate([r[0][:, 0] for *_, pp in projected for r in pp])
    ys = np.concatenate([r[0][:, 1] for *_, pp in projected for r in pp])
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    span = max(x1 - x0, y1 - y0)
    feats, allg = [], []
    for fid, fname, extra, pp in projected:
        rings, area = [], 0.0
        bx0 = by0 = 1e9
        bx1 = by1 = -1e9
        for rs in pp:
            nr = [np.column_stack(((r[:, 0] - x0) / span, (y1 - r[:, 1]) / span)) for r in rs]
            poly = Polygon(nr[0], nr[1:])
            if not poly.is_valid:
                poly = poly.buffer(0)
            simp = poly.simplify(tol, preserve_topology=True)
            for g in getattr(simp, "geoms", [simp]):
                if g.is_empty or g.area < 1e-8:
                    continue
                area += g.area
                allg.append(g)
                gx0, gy0, gx1, gy1 = g.bounds
                bx0, by0, bx1, by1 = min(bx0, gx0), min(by0, gy0), max(bx1, gx1), max(by1, gy1)
                for ring in [g.exterior, *g.interiors]:
                    c = np.asarray(ring.coords)
                    if len(c) >= 4:
                        rings.append([int(round(v * Q)) for v in c.ravel()])
        if rings:
            feats.append({"id": fid, "name": fname, **extra, "area": area,
                          "bbox": [int(bx0 * Q), int(by0 * Q), int(bx1 * Q), int(by1 * Q)], "rings": rings})
    # one merged landmass (closes the hairline gaps between neighbours) for drawing
    eps = 0.0004
    u = unary_union([g.buffer(eps, join_style=2) for g in allg]).buffer(-eps, join_style=2).simplify(tol / 2)
    land = []
    for g in getattr(u, "geoms", [u]):
        for ring in [g.exterior, *g.interiors]:
            c = np.asarray(ring.coords)
            if len(c) >= 4:
                land.append([int(round(v * Q)) for v in c.ravel()])
    OUT.mkdir(parents=True, exist_ok=True)
    out = {"title": title, "q": Q, "width": (x1 - x0) / span, "height": (y1 - y0) / span, "land": land, "features": feats}
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"{name}: {len(feats)} features, {sum(f.get('target', True) for f in feats)} targets, {path.stat().st_size // 1024} KB")


def main():
    un = {c["iso"]: c for c in json.loads((ROOT / "pipeline/config/countries_all.json").read_text(encoding="utf-8"))}
    world = []
    for f in json.loads((NE / "ne_50m_admin_0_countries.geojson").read_text(encoding="utf-8"))["features"]:
        p = f["properties"]
        iso = p["ADM0_A3"]
        if iso == "ATA":
            continue
        c = un.get(iso)
        iso2 = p["ISO_A2_EH"] if p.get("ISO_A2_EH") not in (None, "-99") else ""
        extra = {"iso2": iso2, "continent": c["continent"] if c else p["CONTINENT"], "target": bool(c)}
        world.append((iso, c["name"] if c else p["NAME"], extra, polys(f["geometry"])))
    build("world", "The World", world, equal_earth, 0.0005)

    states = json.loads((NE / "ne_50m_admin_1_states_provinces.geojson").read_text(encoding="utf-8"))["features"]
    for a3, title in STATE_MAPS.items():
        items = []
        for f in states:
            p = f["properties"]
            if p["adm0_a3"] != a3 or (a3 == "USA" and p.get("postal") in ("AK", "HI")):
                continue
            items.append((p.get("postal") or p["name"], p.get("name_en") or p["name"], {"target": True}, polys(f["geometry"])))
        allp = [pg for *_, ps in items for pg in ps]
        lons = np.concatenate([np.asarray(pg.exterior.coords)[:, 0] for pg in allp])
        lats = np.concatenate([np.asarray(pg.exterior.coords)[:, 1] for pg in allp])
        build(a3, title, items, laea((lons.min() + lons.max()) / 2, (lats.min() + lats.max()) / 2), 0.0007)


if __name__ == "__main__":
    main()
