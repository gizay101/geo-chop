// SUPERSEDED by pipeline/real/build_packs.py (real GHSL / GDP / Wikidata data). Kept for reference only:
// running it would overwrite the real packs with placeholder data.
// GEO CHOP: prototype packs built from PLACEHOLDER population.
//
// This is a stand-in until the real GHSL pipeline (docs/PLAN.md §4) exists.
// Borders are real (Natural Earth 1:50m for countries and the world, 1:10m for islands).
// Population is SYNTHETIC: city blobs from Natural Earth populated places plus a thin rural
// layer near cities. Good enough to build and feel the game. Not accurate enough to ship.
//
// Usage: node pipeline/proto/make-proto.mjs
// Output: mobile/src/data/packs/<pack>/<ISO>.json and mobile/src/data/registry.ts (generated)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const rawDir = path.join(root, "pipeline/raw/naturalearth");
const dataDir = path.join(root, "mobile/src/data");
const packsDir = path.join(dataDir, "packs");

/** keep(lon, lat) is tested against each polygon's bounding-box centre. */
const box = (lo0, lo1, la0, la1) => (lon, lat) => lon >= lo0 && lon <= lo1 && lat >= la0 && lat <= la1;

const PACKS = {
  countries: {
    source: "ne_50m_admin_0_countries.geojson",
    points: 3500,
    simplify: 0.0008,
    list: [
      { iso: "USA", name: "United States", note: "Contiguous states", keep: box(-125, -66, 24, 50) },
      { iso: "CAN", name: "Canada" },
      { iso: "MEX", name: "Mexico" },
      { iso: "BRA", name: "Brazil" },
      { iso: "ARG", name: "Argentina" },
      { iso: "CHL", name: "Chile", keep: (lon) => lon > -77 },
      { iso: "PER", name: "Peru" },
      { iso: "COL", name: "Colombia", keep: (lon) => lon < -75 || lon > -78 },
      { iso: "GBR", name: "United Kingdom" },
      { iso: "FRA", name: "France", note: "Metropolitan France", keep: box(-6, 10, 41, 52) },
      { iso: "ESP", name: "Spain", note: "Excludes the Canary Islands", keep: (lon, lat) => lat > 35 },
      { iso: "DEU", name: "Germany" },
      { iso: "ITA", name: "Italy" },
      { iso: "GRC", name: "Greece" },
      { iso: "NOR", name: "Norway", note: "Excludes Svalbard", keep: (lon, lat) => lat < 72 },
      { iso: "SWE", name: "Sweden" },
      { iso: "TUR", name: "Turkey" },
      { iso: "EGY", name: "Egypt", rural: 0.2 },
      { iso: "NGA", name: "Nigeria", rural: 0.3 },
      { iso: "ETH", name: "Ethiopia", rural: 0.4 },
      { iso: "KEN", name: "Kenya", rural: 0.35 },
      { iso: "ZAF", name: "South Africa" },
      { iso: "SAU", name: "Saudi Arabia" },
      { iso: "IND", name: "India", rural: 0.35 },
      { iso: "CHN", name: "China", rural: 0.25 },
      { iso: "RUS", name: "Russia" },
      { iso: "JPN", name: "Japan" },
      { iso: "KOR", name: "South Korea" },
      { iso: "VNM", name: "Vietnam", rural: 0.3 },
      { iso: "THA", name: "Thailand", rural: 0.3 },
      { iso: "PHL", name: "Philippines", rural: 0.3 },
      { iso: "IDN", name: "Indonesia", rural: 0.3 },
      { iso: "AUS", name: "Australia", rural: 0.12, keep: box(112, 155, -45, -9) },
      { iso: "NZL", name: "New Zealand", keep: (lon) => lon > 160 },
    ],
  },
  islands: {
    source: "ne_10m_admin_0_countries.geojson",
    points: 2500,
    simplify: 0.0006,
    list: [
      { iso: "ISL", name: "Iceland", rural: 0.08 },
      { iso: "LKA", name: "Sri Lanka", rural: 0.35 },
      { iso: "CUB", name: "Cuba" },
      { iso: "JAM", name: "Jamaica" },
      { iso: "PRI", name: "Puerto Rico" },
      { iso: "TTO", name: "Trinidad and Tobago" },
      { iso: "BRB", name: "Barbados" },
      { iso: "BHS", name: "The Bahamas" },
      { iso: "MLT", name: "Malta" },
      { iso: "CPV", name: "Cabo Verde" },
      { iso: "MUS", name: "Mauritius", note: "Main island only", keep: (lon, lat) => lon < 60 && lat < -19 },
      { iso: "BHR", name: "Bahrain" },
      { iso: "SGP", name: "Singapore" },
      { iso: "FJI", name: "Fiji", note: "Main island groups", keep: (lon, lat) => lat > -21 && lat < -15.5 && (lon > 176 || lon < -178) },
      { iso: "WSM", name: "Samoa" },
    ],
  },
};

const R_KM = 6371;

// ---------- utilities ----------
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const deg = Math.PI / 180;

/** Spherical Lambert Azimuthal Equal-Area, unit sphere. Returns [x, y] with y pointing north. */
function makeLaea(lon0, lat0) {
  const sp0 = Math.sin(lat0 * deg), cp0 = Math.cos(lat0 * deg);
  return (lon, lat) => {
    const p = lat * deg, dl = (lon - lon0) * deg;
    const sp = Math.sin(p), cp = Math.cos(p), cdl = Math.cos(dl);
    const k = Math.sqrt(2 / (1 + sp0 * sp + cp0 * cp * cdl));
    return [k * cp * Math.sin(dl), k * (cp0 * sp - sp0 * cp * cdl)];
  };
}

/** Equal Earth projection (Šavrič, Patterson & Jenny 2018). */
function equalEarth(lon, lat) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const th = Math.asin(M * Math.sin(lat * deg));
  const t2 = th * th, t6 = t2 * t2 * t2;
  const x = (lon * deg * Math.cos(th)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

function simplify(points, tol) {
  // Douglas–Peucker on a closed ring (first == last).
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-12;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > t2) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

function pointInRing(x, y, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function makeLandTest(polys) {
  const boxes = polys.map((poly) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  });
  return (x, y) => {
    for (let i = 0; i < polys.length; i++) {
      const b = boxes[i];
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      const poly = polys[i];
      if (!pointInRing(x, y, poly[0])) continue;
      let inHole = false;
      for (let h = 1; h < poly.length; h++) if (pointInRing(x, y, poly[h])) { inHole = true; break; }
      if (!inHole) return true;
    }
    return false;
  };
}

function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const r5 = (n) => Math.round(n * 1e5) / 1e5;
const polysOf = (geom) => (geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates);
const iso2Of = (p) => (p.ISO_A2_EH && p.ISO_A2_EH !== "-99" ? p.ISO_A2_EH : p.ISO_A2 !== "-99" ? p.ISO_A2 : "");

function bboxCentre(ring) {
  let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
  for (const [lon, lat] of ring) { lo0 = Math.min(lo0, lon); lo1 = Math.max(lo1, lon); la0 = Math.min(la0, lat); la1 = Math.max(la1, lat); }
  return [(lo0 + lo1) / 2, (la0 + la1) / 2];
}

/** Normalise projected polygons so the longest side is 1, y pointing DOWN (screen space). */
function normaliser(projPolys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of projPolys) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const span = Math.max(x1 - x0, y1 - y0);
  return { span, width: r5((x1 - x0) / span), height: r5((y1 - y0) / span), norm: ([x, y]) => [(x - x0) / span, (y1 - y) / span] };
}

function finishPolys(projPolys, norm, tol, minArea) {
  return projPolys
    .map((poly) => poly.map((ring) => ring.map(norm)))
    .filter((poly) => ringArea(poly[0]) > minArea)
    .map((poly) => poly.map((ring) => simplify(ring, tol)))
    .filter((poly) => poly[0].length >= 4) // outer ring must survive simplification
    .map((poly) => poly.filter((ring) => ring.length >= 4));
}

function writePack(pack, polys, meta, points, cities) {
  const out = {
    ...meta,
    placeholder: true,
    rings: polys.flat().map((ring) => ring.flatMap(([x, y]) => [r5(x), r5(y)])),
    points: points.map((v, i) => (i % 3 === 2 ? Math.round(v) : r5(v))),
    cities: cities.slice(0, 10).map((c) => ({ name: c.name, pop: c.pop, x: r5(c.x), y: r5(c.y) })),
  };
  const dir = path.join(packsDir, pack);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${meta.iso}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`${pack}/${meta.iso}: ${polys.length} polys, ${points.length / 3} pts, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

// ---------- country / island packs ----------
const places = JSON.parse(fs.readFileSync(path.join(rawDir, "ne_10m_populated_places_simple.geojson"), "utf8")).features;
const sources = {};
const loadSource = (name) => (sources[name] ??= JSON.parse(fs.readFileSync(path.join(rawDir, name), "utf8")).features);

fs.rmSync(packsDir, { recursive: true, force: true });
const index = [];

for (const [packName, pack] of Object.entries(PACKS)) {
  const features = loadSource(pack.source);
  for (const cfg of pack.list) {
    const rand = mulberry32([...cfg.iso].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const feat = features.find((f) => f.properties.ADM0_A3 === cfg.iso);
    if (!feat) throw new Error(`${packName}: country not found: ${cfg.iso}`);
    const totalPop = feat.properties.POP_EST;
    const ruralShare = cfg.rural ?? 0.15;

    let lonlat = polysOf(feat.geometry);
    if (cfg.keep) lonlat = lonlat.filter((poly) => cfg.keep(...bboxCentre(poly[0])));

    // Antimeridian (Russia, Fiji): unwrap negative longitudes so the country is contiguous.
    let lo0 = Infinity, lo1 = -Infinity;
    for (const poly of lonlat) for (const [lon] of poly[0]) { lo0 = Math.min(lo0, lon); lo1 = Math.max(lo1, lon); }
    const wraps = lo1 - lo0 > 180;
    const unwrap = (lon) => (wraps && lon < 0 ? lon + 360 : lon);
    lonlat = lonlat.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => [unwrap(lon), lat])));

    let la0 = Infinity, la1 = -Infinity;
    lo0 = Infinity; lo1 = -Infinity;
    for (const poly of lonlat) for (const [lon, lat] of poly[0]) {
      lo0 = Math.min(lo0, lon); lo1 = Math.max(lo1, lon); la0 = Math.min(la0, lat); la1 = Math.max(la1, lat);
    }
    const proj = makeLaea((lo0 + lo1) / 2, (la0 + la1) / 2);
    const projPolys = lonlat.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => proj(lon, lat))));
    const { span, width, height, norm } = normaliser(projPolys);
    const kmToUnits = 1 / R_KM / span;
    const polys = finishPolys(projPolys, norm, pack.simplify, 2e-6);
    const isLand = makeLandTest(polys);

    const cities = places
      .filter((f) => f.properties.adm0_a3 === cfg.iso)
      .map((f) => {
        const [x, y] = norm(proj(unwrap(f.properties.longitude), f.properties.latitude));
        return { name: f.properties.name, pop: f.properties.pop_max, x, y };
      })
      .filter((c) => c.pop > 0 && isLand(c.x, c.y))
      .sort((a, b) => b.pop - a.pop);
    if (cities.length === 0) throw new Error(`${cfg.iso}: no cities inside the playable area`);
    const cityPopSum = cities.reduce((s, c) => s + c.pop, 0);

    const points = [];
    const urbanMass = totalPop * (1 - ruralShare);
    const ruralMass = totalPop * ruralShare;
    const urbanBudget = Math.round(pack.points * 0.6);
    const ruralBudget = pack.points - urbanBudget;

    // Urban: gaussian blobs, sample count ∝ sqrt(pop).
    const sqrtSum = cities.reduce((s, c) => s + Math.sqrt(c.pop), 0);
    for (const c of cities) {
      const n = Math.max(3, Math.round((urbanBudget * Math.sqrt(c.pop)) / sqrtSum));
      const sigma = (3 + 9 * Math.sqrt(c.pop / 1e6)) * kmToUnits;
      const w = (urbanMass * (c.pop / cityPopSum)) / n;
      for (let i = 0; i < n; i++) {
        let px = c.x, py = c.y;
        for (let tries = 0; tries < 12; tries++) {
          const tx = c.x + gauss(rand) * sigma, ty = c.y + gauss(rand) * sigma;
          if (isLand(tx, ty)) { px = tx; py = ty; break; }
        }
        points.push(px, py, w);
      }
    }

    // Rural: uniform land samples, weighted by closeness to cities, plus a tiny baseline.
    const rural = [];
    let guard = 0;
    while (rural.length < ruralBudget * 3 && guard++ < ruralBudget * 600) {
      const x = rand() * width, y = rand() * height;
      if (!isLand(x, y)) continue;
      let near = 0;
      for (const c of cities) near += c.pop * Math.exp(-(Math.hypot(x - c.x, y - c.y) / kmToUnits) / 60);
      rural.push([x, y, (0.01 * cityPopSum) / cities.length + near]);
    }
    rural.sort((a, b) => b[2] - a[2]);
    const keptRural = rural.slice(0, ruralBudget); // the strongest third: a sparse, density-weighted layer
    const ruralWeightSum = keptRural.reduce((s, r) => s + r[2], 0) || 1;
    for (const [x, y, wt] of keptRural) points.push(x, y, (ruralMass * wt) / ruralWeightSum);

    const meta = { iso: cfg.iso, iso2: iso2Of(feat.properties), name: cfg.name, pack: packName, note: cfg.note ?? null, population: totalPop, width, height };
    writePack(packName, polys, meta, points, cities);
    index.push({ iso: cfg.iso, iso2: meta.iso2, name: cfg.name, pack: packName, note: meta.note, population: totalPop });
  }
}

// ---------- world pack (Equal Earth) ----------
{
  const features = loadSource("ne_50m_admin_0_countries.geojson").filter((f) => f.properties.ADM0_A3 !== "ATA");
  const projPolys = features.flatMap((f) => polysOf(f.geometry).map((poly) => poly.map((ring) => ring.map(([lon, lat]) => equalEarth(lon, lat)))));
  const { width, height, norm } = normaliser(projPolys);
  const polys = finishPolys(projPolys, norm, 0.0012, 4e-6);

  // Each country's population is spread over its listed places, proportional to their size.
  const popByCountry = new Map(features.map((f) => [f.properties.ADM0_A3, f.properties.POP_EST]));
  const placeSum = new Map();
  for (const p of places) placeSum.set(p.properties.adm0_a3, (placeSum.get(p.properties.adm0_a3) ?? 0) + p.properties.pop_max);
  const points = [];
  let total = 0;
  const cities = [];
  for (const p of places) {
    const pop = popByCountry.get(p.properties.adm0_a3);
    const sum = placeSum.get(p.properties.adm0_a3);
    if (!pop || !sum || p.properties.pop_max <= 0) continue;
    const [x, y] = norm(equalEarth(p.properties.longitude, p.properties.latitude));
    const w = pop * (p.properties.pop_max / sum);
    points.push(x, y, w);
    total += w;
    cities.push({ name: p.properties.name, pop: p.properties.pop_max, x, y });
  }
  cities.sort((a, b) => b.pop - a.pop);
  const meta = { iso: "WLD", iso2: "", name: "The World", pack: "world", note: "Every country except Antarctica", population: Math.round(total), width, height };
  writePack("world", polys, meta, points, cities);
  index.push({ iso: "WLD", iso2: "", name: meta.name, pack: "world", note: meta.note, population: meta.population });
}

// ---------- registry (lazy loaders: a pack is only parsed when first played) ----------
const lines = [
  "// GENERATED by pipeline/proto/make-proto.mjs. Do not edit.",
  'import type { CountryPack } from "@/game/types";',
  "",
  "export type PackId = \"countries\" | \"islands\" | \"world\";",
  "export type PackEntry = { iso: string; iso2: string; name: string; pack: PackId; note: string | null; population: number };",
  "",
  `export const PACK_INDEX: PackEntry[] = ${JSON.stringify(index, null, 2)};`,
  "",
  "export const LOADERS: Record<string, () => CountryPack> = {",
  ...index.map((e) => `  ${e.iso}: () => require("./packs/${e.pack}/${e.iso}.json"),`),
  "};",
  "",
];
fs.writeFileSync(path.join(dataDir, "registry.ts"), lines.join("\n"));
console.log(`registry.ts: ${index.length} entries`);
