"""GEO CHOP data pipeline: builds the game packs from REAL data.

Layers
  pop   GHSL GHS-POP R2023A, epoch 2025, 30 arc-sec (European Commission JRC, CC BY 4.0)
  gdp   Kummu et al. 2025, gridded total GDP (PPP), v4, 2024, 30 arc-sec (CC BY 4.0)
  bil   Wikidata (CC0): billionaires' residence cities, counts only
Borders: Natural Earth (public domain), 1:50m for countries/world, 1:10m for islands.

Per country: keep the playable polygons, project with a country-centred Lambert azimuthal
equal-area projection (same formulas as before, so the app draws the same shapes), sample every
grid cell whose centre is on that land, compress the cells to a few thousand weighted points with
a greedy quadtree (always split the heaviest leaf), then VALIDATE the compressed points against
the full-resolution cells with random cuts.

Usage:
  pipeline/.venv/Scripts/python pipeline/real/build_packs.py                # everything available
  pipeline/.venv/Scripts/python pipeline/real/build_packs.py --only JPN,EGY # some countries
"""
from __future__ import annotations

import argparse
import heapq
import json
import math
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import Window
from shapely import affinity
from shapely.geometry import MultiPolygon, Point, Polygon, mapping
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "pipeline" / "raw"
NE = RAW / "naturalearth"
GHSL = RAW / "ghsl" / "GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif"
# 3 arc-sec (~100 m) tiles, fetched on demand for small islands where 1 km cells are too coarse.
GHSL_3SS_DIR = RAW / "ghsl3ss"
GHSL_3SS_URL = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2025_GLOBE_R2023A_4326_3ss/V1-0/tiles/"
GHSL_3SS_NAME = "GHS_POP_E2025_GLOBE_R2023A_4326_3ss_V1_0_R{r}_C{c}"
GDP = RAW / "gdp" / "rast_gdpTot_1990_2024_30arcsec.tif"
BILLIONAIRES = RAW / "wikidata" / "billionaire_cities.json"
CONFIG = ROOT / "pipeline" / "config" / "packs.json"
ALL_COUNTRIES = ROOT / "pipeline" / "config" / "countries_all.json"  # make_config.py
DATA = ROOT / "mobile" / "src" / "data"
PACKS = DATA / "packs"
REPORT = ROOT / "pipeline" / "reports" / "validation.json"  # committed: accuracy of every pack

TARGET_POINTS = {"countries": 4000, "islands": 5000, "world": 10000, "economy": 5000}
SMALL_KM2 = 20_000   # below this, use 1:10m borders
TINY_KM2 = 3_000     # below this, use 100 m population tiles
QUANT = 65535        # coordinates ship as integers 0..QUANT (normalised space is 0..1)
SIMPLIFY = {"countries": 0.0009, "islands": 0.0006, "world": 0.0012, "economy": 0.0008, "billionaires": 0.0008}
VALIDATION_LINES = 300
MAX_ERROR_PP = 0.3  # compressed vs full resolution, worst case over the random cuts

SOURCES = {
    "population": "GHSL GHS-POP R2023A 2025 (European Commission, JRC), CC BY 4.0",
    "gdp": "Kummu et al. 2025, gridded GDP (PPP) v4, 2024, CC BY 4.0",
    "billionaires": "Wikidata (CC0): residence cities of billionaires, approximate",
}

DEG = math.pi / 180


# ---------------------------------------------------------------- geometry
def laea(lon0: float, lat0: float):
    """Spherical Lambert azimuthal equal-area on the unit sphere, y pointing north (vectorised)."""
    sp0, cp0 = math.sin(lat0 * DEG), math.cos(lat0 * DEG)

    def f(lon, lat):
        lon = np.asarray(lon, dtype=np.float64)
        lat = np.asarray(lat, dtype=np.float64)
        p, dl = lat * DEG, (lon - lon0) * DEG
        sp, cp, cdl = np.sin(p), np.cos(p), np.cos(dl)
        k = np.sqrt(2 / (1 + sp0 * sp + cp0 * cp * cdl))
        return k * cp * np.sin(dl), k * (cp0 * sp - sp0 * cp * cdl)

    return f


def equal_earth(lon, lat):
    a1, a2, a3, a4, m = 1.340264, -0.081106, 0.000893, 0.003796, math.sqrt(3) / 2
    lon = np.asarray(lon, dtype=np.float64)
    lat = np.asarray(lat, dtype=np.float64)
    th = np.arcsin(m * np.sin(lat * DEG))
    t2 = th * th
    t6 = t2 ** 3
    x = lon * DEG * np.cos(th) / (m * (a1 + 3 * a2 * t2 + t6 * (7 * a3 + 9 * a4 * t2)))
    y = th * (a1 + a2 * t2 + t6 * (a3 + a4 * t2))
    return x, y


def load_features(name: str) -> dict:
    feats = json.loads((NE / name).read_text(encoding="utf-8"))["features"]
    return {f["properties"]["ADM0_A3"]: f for f in feats}


def polys_of(geom: dict) -> list:
    return [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]


def iso2_of(p: dict) -> str:
    for k in ("ISO_A2_EH", "ISO_A2"):
        v = p.get(k)
        if v and v != "-99":
            return v
    return ""


def playable_lonlat(feature: dict, keep: list | None) -> tuple[MultiPolygon, bool]:
    """Kept polygons as one shapely MultiPolygon in lon/lat, unwrapped across the antimeridian."""
    polys = polys_of(feature["geometry"])
    if keep:
        def centre(ring):
            a = np.asarray(ring)
            return (a[:, 0].min() + a[:, 0].max()) / 2, (a[:, 1].min() + a[:, 1].max()) / 2

        polys = [p for p in polys if any(b[0] <= centre(p[0])[0] <= b[1] and b[2] <= centre(p[0])[1] <= b[3] for b in keep)]
    lons = np.concatenate([np.asarray(p[0])[:, 0] for p in polys])
    wraps = lons.max() - lons.min() > 180
    if not keep and len(polys) > 1:
        polys = drop_remote_specks(polys, wraps)
    out = []
    for p in polys:
        rings = []
        for r in p:
            a = np.asarray(r, dtype=np.float64)
            if wraps:
                a[:, 0] = np.where(a[:, 0] < 0, a[:, 0] + 360, a[:, 0])
            rings.append(a)
        out.append(Polygon(rings[0], rings[1:]))
    return MultiPolygon(out), wraps


def drop_remote_specks(polys: list, wraps: bool) -> list:
    """Drop far-away small islands (e.g. Galápagos, Canaries, Andamans) so the main country fills
    the screen: a polygon goes if it is > 900 km from the largest one AND < 5% of the land area."""
    def lonlat(p):
        a = np.asarray(p[0], dtype=np.float64)
        if wraps:
            a[:, 0] = np.where(a[:, 0] < 0, a[:, 0] + 360, a[:, 0])
        return a

    arrs = [lonlat(p) for p in polys]
    areas = []
    for a in arrs:
        lat0 = a[:, 1].mean() * DEG
        x, y = a[:, 0] * DEG * math.cos(lat0) * 6371, a[:, 1] * DEG * 6371
        areas.append(abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))) / 2)
    total = sum(areas)
    big = int(np.argmax(areas))
    c0 = arrs[big].mean(axis=0)

    def dist_km(c):
        dlat, dlon = (c[1] - c0[1]) * DEG, (c[0] - c0[0]) * DEG
        h = math.sin(dlat / 2) ** 2 + math.cos(c0[1] * DEG) * math.cos(c[1] * DEG) * math.sin(dlon / 2) ** 2
        return 2 * 6371 * math.asin(math.sqrt(min(1, h)))

    return [p for p, a, ar in zip(polys, arrs, areas) if not (dist_km(a.mean(axis=0)) > 900 and ar < 0.05 * total)]


def land_km2(mp: MultiPolygon) -> float:
    minx, miny, maxx, maxy = mp.bounds
    proj = laea((minx + maxx) / 2, (miny + maxy) / 2)
    total = 0.0
    for poly in mp.geoms:
        x, y = proj(*np.asarray(poly.exterior.coords).T)
        total += Polygon(np.column_stack([x, y])).area
    return total * 6371 ** 2


class Normaliser:
    """Projected → normalised map space: longest side = 1, y pointing DOWN (screen space)."""

    def __init__(self, xs: np.ndarray, ys: np.ndarray):
        self.x0, self.x1, self.y0, self.y1 = xs.min(), xs.max(), ys.min(), ys.max()
        self.span = max(self.x1 - self.x0, self.y1 - self.y0)
        self.width = (self.x1 - self.x0) / self.span
        self.height = (self.y1 - self.y0) / self.span

    def __call__(self, x, y):
        return (np.asarray(x) - self.x0) / self.span, (self.y1 - np.asarray(y)) / self.span


def project_geometry(mp: MultiPolygon, proj, tol: float, min_area: float):
    """Project + normalise + simplify. Returns (normaliser, rings as flat lists, land centroid)."""
    projected = []
    for poly in mp.geoms:
        rings = [np.asarray(poly.exterior.coords)] + [np.asarray(i.coords) for i in poly.interiors]
        projected.append([np.column_stack(proj(r[:, 0], r[:, 1])) for r in rings])
    allx = np.concatenate([p[0][:, 0] for p in projected])
    ally = np.concatenate([p[0][:, 1] for p in projected])
    norm = Normaliser(allx, ally)
    rings_out = []
    cx_sum = cy_sum = a_sum = 0.0
    for rings in projected:
        nr = [np.column_stack(norm(r[:, 0], r[:, 1])) for r in rings]
        poly = Polygon(nr[0], nr[1:])
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.area < min_area:
            continue
        cen = poly.centroid
        cx_sum += cen.x * poly.area
        cy_sum += cen.y * poly.area
        a_sum += poly.area
        simp = poly.simplify(tol, preserve_topology=True)
        for g in getattr(simp, "geoms", [simp]):
            if g.is_empty or g.area < min_area:
                continue
            for ring in [g.exterior, *g.interiors]:
                c = np.asarray(ring.coords)
                if len(c) >= 4:
                    rings_out.append([int(round(float(v) * QUANT)) for v in c.ravel()])
    return norm, rings_out, (cx_sum / a_sum, cy_sum / a_sum) if a_sum else (0.5, 0.5)


# ---------------------------------------------------------------- raster sampling
def ghsl_3ss_tiles(mp: MultiPolygon) -> list[Path]:
    """Download (once) the 10° × 10° 3 arc-sec tiles covering the polygons. Ocean tiles don't exist."""
    import truststore

    truststore.inject_into_ssl()
    minx, miny, maxx, maxy = mp.bounds
    lon_ranges = [(minx, maxx)] if maxx <= 180 else [(minx, 180), (-180, maxx - 360)]
    paths = []
    for lo0, lo1 in lon_ranges:
        for c in range(int((lo0 + 180) // 10) + 1, int((min(lo1, 179.999) + 180) // 10) + 2):
            for r in range(int((89.0996 - maxy) // 10) + 1, int((89.0996 - miny) // 10) + 2):
                name = GHSL_3SS_NAME.format(r=r, c=c)
                tif = GHSL_3SS_DIR / f"{name}.tif"
                if not tif.exists():
                    GHSL_3SS_DIR.mkdir(parents=True, exist_ok=True)
                    zpath = GHSL_3SS_DIR / f"{name}.zip"
                    try:
                        urllib.request.urlretrieve(GHSL_3SS_URL + name + ".zip", zpath)
                    except urllib.error.HTTPError:
                        continue  # all-ocean tile
                    with zipfile.ZipFile(zpath) as z:
                        z.extract(f"{name}.tif", GHSL_3SS_DIR)
                    zpath.unlink()
                    print(f"    fetched 100 m tile R{r} C{c}")
                paths.append(tif)
    return paths


def sample_cells(paths: list[Path], band: int, mp: MultiPolygon, all_touched: bool):
    """(lon, lat, value) of every positive cell inside the polygons. Reads in row strips; several
    rasters (tiles) may be given and each contributes the part of the area it covers."""
    minx, miny, maxx, maxy = mp.bounds
    spans = [(minx, maxx, 0.0)] if maxx <= 180 else [(minx, 180.0, 0.0), (-180.0, maxx - 360, 360.0)]
    lons, lats, vals = [], [], []
    for path in paths:
        with rasterio.open(path) as ds:
            T = ds.transform
            for x0, x1, shift in spans:
                geom = mapping(affinity.translate(mp, xoff=-shift))
                c0 = max(0, int(math.floor((x0 - T.c) / T.a)))
                c1 = min(ds.width, int(math.ceil((x1 - T.c) / T.a)))
                r0 = max(0, int(math.floor((maxy - T.f) / T.e)))
                r1 = min(ds.height, int(math.ceil((miny - T.f) / T.e)))
                if c1 <= c0 or r1 <= r0:
                    continue
                for rs in range(r0, r1, 512):
                    win = Window(c0, rs, c1 - c0, min(512, r1 - rs))
                    arr = ds.read(band, window=win).astype(np.float64)
                    wt = ds.window_transform(win)
                    inside = geometry_mask([geom], out_shape=arr.shape, transform=wt, invert=True, all_touched=all_touched)
                    ok = inside & np.isfinite(arr) & (arr > 0)
                    rr, cc = np.nonzero(ok)
                    if len(rr) == 0:
                        continue
                    lons.append(wt.c + (cc + 0.5) * wt.a + shift)
                    lats.append(wt.f + (rr + 0.5) * wt.e)
                    vals.append(arr[rr, cc])
    if not vals:
        return np.zeros(0), np.zeros(0), np.zeros(0)
    return np.concatenate(lons), np.concatenate(lats), np.concatenate(vals)


def world_cells(path: Path, block: int = 12):
    """Whole-world grid summed into block×block cells (12 × 30″ = 0.1°). Antarctica dropped."""
    with rasterio.open(path) as ds:
        T = ds.transform
        w = (ds.width // block) * block
        lons, lats, vals = [], [], []
        for rs in range(0, (ds.height // block) * block, block * 40):
            h = min(block * 40, (ds.height // block) * block - rs)
            arr = ds.read(1, window=Window(0, rs, w, h)).astype(np.float64)
            arr[~np.isfinite(arr) | (arr < 0)] = 0
            s = arr.reshape(h // block, block, w // block, block).sum(axis=(1, 3))
            rr, cc = np.nonzero(s > 0)
            lons.append(T.c + (cc + 0.5) * block * T.a)
            lats.append(T.f + (rs + (rr + 0.5) * block) * T.e)
            vals.append(s[rr, cc])
    lon, lat, val = np.concatenate(lons), np.concatenate(lats), np.concatenate(vals)
    keep = lat > -60
    return lon[keep], lat[keep], val[keep]


# ---------------------------------------------------------------- compression + validation
def compress(x: np.ndarray, y: np.ndarray, w: np.ndarray, target: int):
    """Greedy quadtree: keep splitting the heaviest leaf until there are `target` leaves.
    Each leaf becomes one point at its weighted centroid. The worst-case error of any cut is
    bounded by the weight of the leaves it crosses, so heavy (dense) areas get the finest detail."""
    if len(w) <= target:
        return x, y, w
    s = max(x.max() - x.min(), y.max() - y.min()) * 1.000001
    heap = [(-w.sum(), 0, x.min(), y.min(), s, np.arange(len(w)))]
    leaves, counter = [], 1
    while heap and len(heap) + len(leaves) < target:
        negw, _, bx, by, size, idx = heapq.heappop(heap)
        if len(idx) == 1 or size < 1e-7:
            leaves.append(idx)
            continue
        half = size / 2
        right = x[idx] >= bx + half
        down = y[idx] >= by + half
        for q, (dx, dy) in enumerate(((0, 0), (1, 0), (0, 1), (1, 1))):
            m = (right == bool(dx)) & (down == bool(dy))
            if m.any():
                sub = idx[m]
                heapq.heappush(heap, (-w[sub].sum(), counter, bx + dx * half, by + dy * half, half, sub))
                counter += 1
    leaves.extend(item[5] for item in heap)
    cx = np.empty(len(leaves)), np.empty(len(leaves)), np.empty(len(leaves))
    for i, idx in enumerate(leaves):
        ww = w[idx]
        tot = ww.sum()
        cx[0][i] = (x[idx] * ww).sum() / tot
        cx[1][i] = (y[idx] * ww).sum() / tot
        cx[2][i] = tot
    return cx


def difficulty(cx, cy, cw, centre) -> float:
    """Mean |share − 50%| (pp) of lines through the land's centroid at 12 angles. 0 = easy."""
    tot = cw.sum()
    errs = []
    for k in range(12):
        t = k * math.pi / 12
        nx, ny = math.cos(t), math.sin(t)
        c = nx * centre[0] + ny * centre[1]
        errs.append(abs(cw[(nx * cx + ny * cy) > c].sum() / tot - 0.5) * 100)
    return float(np.mean(errs))


def validate(fx, fy, fw, cx, cy, cw, lines: int, seed: int) -> tuple[float, float]:
    """Max and mean |share difference| in percentage points over random cuts through populated places."""
    rng = np.random.default_rng(seed)
    p = fw / fw.sum()
    picks = rng.choice(len(fw), size=lines, p=p)
    angles = rng.uniform(0, math.pi, size=lines)
    errs = np.empty(lines)
    tf, tc = fw.sum(), cw.sum()
    span = max(fx.max() - fx.min(), fy.max() - fy.min())
    jitter = rng.uniform(-0.01, 0.01, size=lines) * span
    for k in range(lines):
        nx, ny = math.cos(angles[k]), math.sin(angles[k])
        c = nx * fx[picks[k]] + ny * fy[picks[k]] + jitter[k]
        a_full = fw[(nx * fx + ny * fy) > c].sum() / tf
        a_comp = cw[(nx * cx + ny * cy) > c].sum() / tc
        errs[k] = abs(a_full - a_comp) * 100
    return float(errs.max()), float(errs.mean())


# ---------------------------------------------------------------- packs
def cities_in(places: list, iso: str, mp: MultiPolygon, wraps: bool, proj, norm) -> list:
    prepared = prep(mp)
    out = []
    for f in places:
        pr = f["properties"]
        if pr["adm0_a3"] != iso or pr["pop_max"] <= 0:
            continue
        lon = pr["longitude"] + (360 if wraps and pr["longitude"] < 0 else 0)
        if not prepared.contains(Point(lon, pr["latitude"])):
            continue
        x, y = norm(*proj(lon, pr["latitude"]))
        out.append({"name": pr["name"], "pop": pr["pop_max"], "x": round(float(x), 4), "y": round(float(y), 4)})
    out.sort(key=lambda c: -c["pop"])
    return out[:10]


def write_pack(pack: str, meta: dict, rings: list, x, y, w, cities: list, weight_round: int = 0) -> Path:
    pts = []
    for a, b, c in zip(x, y, w):
        pts += [int(round(float(a) * QUANT)), int(round(float(b) * QUANT)), int(round(float(c)))]
    for c in cities:
        c["x"], c["y"] = int(round(c["x"] * QUANT)), int(round(c["y"] * QUANT))
    out = {**meta, "placeholder": False, "q": QUANT, "rings": rings, "points": pts, "cities": cities}
    d = PACKS / pack
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{meta['iso']}.json"
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    return path


def build_country(pack: str, cfg: dict, features: dict, places: list, layer: str, report: dict) -> dict | None:
    iso = cfg["iso"]
    t0 = time.time()
    feat = features[iso] if iso in features else FEATURES_10M[iso]
    mp, wraps = playable_lonlat(feat, cfg.get("keep"))
    km2 = land_km2(mp)
    if km2 < SMALL_KM2 and features is not FEATURES_10M:  # small: use the detailed borders
        feat = FEATURES_10M[iso]
        mp, wraps = playable_lonlat(feat, cfg.get("keep"))
        km2 = land_km2(mp)
    minx, miny, maxx, maxy = mp.bounds
    proj = laea((minx + maxx) / 2, (miny + maxy) / 2)
    norm, rings, centre = project_geometry(mp, proj, SIMPLIFY[pack], 2e-6)
    metric = {"pop": "population", "gdp": "gdp", "bil": "billionaires"}[layer]

    if layer == "bil":
        cities = json.loads(BILLIONAIRES.read_text(encoding="utf-8"))
        prepared = prep(mp)
        lon, lat, val = [], [], []
        for c in cities:
            if c["iso3"] != iso:
                continue
            lo = c["lon"] + (360 if wraps and c["lon"] < 0 else 0)
            if prepared.contains(Point(lo, c["lat"])):
                lon.append(lo); lat.append(c["lat"]); val.append(c["count"])
        if sum(val) < 20:
            print(f"  {pack}/{iso}: only {sum(val)} billionaires, skipped")
            return None
        x, y = norm(*proj(np.array(lon), np.array(lat)))
        cx, cy, cw = x, y, np.array(val, dtype=np.float64)
        err = (0.0, 0.0)
        n_full = len(val)
    else:
        if layer == "gdp":
            paths, band = [GDP], gdp_band()
        elif pack == "islands" or km2 < TINY_KM2:
            paths, band = ghsl_3ss_tiles(mp), 1
        else:
            paths, band = [GHSL], 1
        lon, lat, val = sample_cells(paths, band, mp, all_touched=(pack == "islands" or km2 < TINY_KM2))
        if len(val) == 0:
            print(f"  {pack}/{iso}: no data, skipped")
            return None
        def fit_points(lon, lat, val):
            fx, fy = norm(*proj(lon, lat))
            # Concentrated layers (e.g. Chile's GDP in Santiago) need more points: grow until it validates.
            for target in (TARGET_POINTS[pack] * f for f in (1, 1.5, 2)):
                cx, cy, cw = compress(fx, fy, val, int(target))
                # validate on the quantised coordinates that actually ship
                err = validate(fx, fy, val, np.round(cx * QUANT) / QUANT, np.round(cy * QUANT) / QUANT, cw,
                               VALIDATION_LINES, seed=len(iso) * 7919 + ord(iso[0]))
                if err[0] <= MAX_ERROR_PP:
                    break
            return cx, cy, cw, err

        cx, cy, cw, err = fit_points(lon, lat, val)
        # Small, concentrated countries: 1 km cells are too lumpy. Retry once with the 100 m grid.
        if err[0] > MAX_ERROR_PP and layer == "pop" and paths == [GHSL] and km2 < 150_000:
            lon, lat, val = sample_cells(ghsl_3ss_tiles(mp), 1, mp, all_touched=True)
            cx, cy, cw, err = fit_points(lon, lat, val)
        n_full = len(val)

    total = float(cw.sum())
    meta = {
        "iso": iso, "iso2": iso2_of(feat["properties"]), "name": cfg["name"], "pack": pack,
        "continent": cfg.get("continent") or CONTINENT_OF.get(iso), "difficulty": round(difficulty(cx, cy, cw, centre), 2),
        "note": cfg.get("note"), "metric": metric, "total": round(total), "population": round(total) if metric == "population" else None,
        "source": SOURCES[metric], "width": round(norm.width, 5), "height": round(norm.height, 5),
    }
    out = write_pack(pack, meta, rings, cx, cy, cw, cities_in(places, iso, mp, wraps, proj, norm))
    report[f"{pack}/{iso}"] = {"cells": int(n_full), "points": int(len(cw)), "max_err_pp": round(err[0], 3), "mean_err_pp": round(err[1], 4), "total": round(total)}
    flag = "OK " if err[0] <= MAX_ERROR_PP else "!! "
    print(f"  {flag}{pack}/{iso}: {n_full:>9,} cells → {len(cw):>5} pts, max err {err[0]:.3f} pp, "
          f"total {total:,.0f}, {out.stat().st_size / 1024:.0f} KB, {time.time() - t0:.1f}s")
    return {k: meta[k] for k in INDEX_KEYS}


_gdp_band = None


def gdp_available() -> bool:
    """False while the 1.4 GB GDP raster is still downloading (or missing)."""
    if not GDP.exists():
        return False
    try:
        with rasterio.open(GDP) as ds:
            ds.read(ds.count, window=Window(ds.width - 1, ds.height - 1, 1, 1))
        return True
    except Exception:
        return False


def gdp_band() -> int:
    """The 2024 band of the Kummu GDP stack (the last band; checked against band descriptions)."""
    global _gdp_band
    if _gdp_band is None:
        with rasterio.open(GDP) as ds:
            desc = [d or "" for d in ds.descriptions]
            hits = [i + 1 for i, d in enumerate(desc) if "2024" in d]
            _gdp_band = hits[0] if hits else ds.count
            print(f"  GDP raster: {ds.count} bands {desc}; using band {_gdp_band}")
    return _gdp_band


def build_world(features: dict, places: list, report: dict) -> dict:
    t0 = time.time()
    polys = []
    for iso, f in features.items():
        if iso == "ATA":
            continue
        for p in polys_of(f["geometry"]):
            polys.append(Polygon(p[0], p[1:]))
    mp = MultiPolygon(polys)
    norm, rings, centre = project_geometry(mp, equal_earth, SIMPLIFY["world"], 4e-6)
    lon, lat, val = world_cells(GHSL)
    fx, fy = norm(*equal_earth(lon, lat))
    cx, cy, cw = compress(fx, fy, val, TARGET_POINTS["world"])
    err = validate(fx, fy, val, np.round(cx * QUANT) / QUANT, np.round(cy * QUANT) / QUANT, cw, VALIDATION_LINES, seed=42)
    total = float(cw.sum())
    cities = []
    for f in places:
        pr = f["properties"]
        if pr["pop_max"] > 0:
            x, y = norm(*equal_earth(pr["longitude"], pr["latitude"]))
            cities.append({"name": pr["name"], "pop": pr["pop_max"], "x": round(float(x), 4), "y": round(float(y), 4)})
    cities.sort(key=lambda c: -c["pop"])
    meta = {"iso": "WLD", "iso2": "", "name": "The World", "pack": "world", "note": "Every country except Antarctica",
            "continent": None, "difficulty": round(difficulty(cx, cy, cw, centre), 2),
            "metric": "population", "total": round(total), "population": round(total), "source": SOURCES["population"],
            "width": round(norm.width, 5), "height": round(norm.height, 5)}
    out = write_pack("world", meta, rings, cx, cy, cw, cities[:10])
    report["world/WLD"] = {"cells": int(len(val)), "points": int(len(cw)), "max_err_pp": round(err[0], 3), "mean_err_pp": round(err[1], 4), "total": round(total)}
    print(f"  {'OK ' if err[0] <= MAX_ERROR_PP else '!! '}world/WLD: {len(val):,} cells → {len(cw)} pts, max err {err[0]:.3f} pp, "
          f"total {total:,.0f}, {out.stat().st_size / 1024:.0f} KB, {time.time() - t0:.1f}s")
    return {k: meta[k] for k in INDEX_KEYS}


INDEX_KEYS = ("iso", "iso2", "name", "pack", "note", "metric", "total", "continent", "difficulty")


def write_registry(index: list) -> None:
    lines = [
        "// GENERATED by pipeline/real/build_packs.py. Do not edit.",
        'import type { CountryPack } from "@/game/types";',
        "",
        'export type PackId = "countries" | "islands" | "world" | "economy" | "billionaires";',
        'export type Metric = "population" | "gdp" | "billionaires";',
        "export type PackEntry = {",
        "  iso: string; iso2: string; name: string; pack: PackId; note: string | null; metric: Metric; total: number;",
        "  continent: string | null;",
        "  /** Error (pp) of a naive cut through the middle of the land; higher = harder. */",
        "  difficulty: number;",
        "};",
        "",
        f"export const PACK_INDEX: PackEntry[] = {json.dumps(index, indent=2)};",
        "",
        "/** Keyed by `${pack}/${iso}`. A pack is only parsed when first played. */",
        "export const LOADERS: Record<string, () => CountryPack> = {",
        *[f'  "{e["pack"]}/{e["iso"]}": () => require("./packs/{e["pack"]}/{e["iso"]}.json"),' for e in index],
        "};",
        "",
    ]
    (DATA / "registry.ts").write_text("\n".join(lines), encoding="utf-8")
    print(f"registry.ts: {len(index)} packs")


FEATURES_10M: dict = {}
CONTINENT_OF: dict = {}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated ISO codes (registry is still rebuilt from all packs on disk)")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None

    global FEATURES_10M, CONTINENT_OF
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    f50 = load_features("ne_50m_admin_0_countries.geojson")
    f10 = load_features("ne_10m_admin_0_countries.geojson")
    FEATURES_10M = f10
    all_countries = json.loads(ALL_COUNTRIES.read_text(encoding="utf-8"))
    CONTINENT_OF = {c["iso"]: c["continent"] for c in all_countries}
    places = json.loads((NE / "ne_10m_populated_places_simple.geojson").read_text(encoding="utf-8"))["features"]
    report = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else {}
    by_iso = {c["iso"]: c for c in cfg["countries"]}

    jobs = [("countries", c, f50, "pop") for c in all_countries]
    jobs += [("islands", c, f10, "pop") for c in cfg["islands"]]
    if gdp_available():
        jobs += [("economy", by_iso[i], f50, "gdp") for i in cfg["economy"]]
    else:
        print("GDP raster not downloaded yet: skipping economy packs")
    if BILLIONAIRES.exists():
        jobs += [("billionaires", by_iso[i], f50, "bil") for i in cfg["billionaires"]]

    for pack, c, feats, layer in jobs:
        if only and c["iso"] not in only:
            continue
        build_country(pack, c, feats, places, layer, report)
    if not only or "WLD" in only:
        build_world(f50, places, report)

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=1, sort_keys=True), encoding="utf-8")

    # Registry from every pack on disk (so --only runs don't drop the others).
    index = []
    order = {"world": 0, "countries": 1, "islands": 2, "economy": 3, "billionaires": 4}
    for path in sorted(PACKS.glob("*/*.json"), key=lambda p: (order.get(p.parent.name, 9), p.stem)):
        m = json.loads(path.read_text(encoding="utf-8"))
        if m.get("placeholder", True):
            continue  # old prototype packs are not listed
        index.append({k: m.get(k) for k in INDEX_KEYS})
    write_registry(index)


if __name__ == "__main__":
    main()
