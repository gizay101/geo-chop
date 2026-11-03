// GEO CHOP: prototype country packs from PLACEHOLDER population.
//
// This is a stand-in until the real GHSL pipeline (docs/PLAN.md §4) exists.
// Borders are real (Natural Earth 1:50m). Population is SYNTHETIC: city blobs from
// Natural Earth populated places plus a thin rural layer near cities. Good enough to
// build and feel the game. Not accurate enough to ship.
//
// Usage: node pipeline/proto/make-proto.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const rawDir = path.join(root, "pipeline/raw/naturalearth");
const outDir = path.join(root, "mobile/src/data/countries");

const COUNTRIES = [
  { iso: "EGY", name: "Egypt", rural: 0.2 },
  { iso: "JPN", name: "Japan", rural: 0.15 },
  { iso: "AUS", name: "Australia", rural: 0.12, keep: (lon, lat) => lon > 112 && lon < 155 && lat < -9 && lat > -45 },
  { iso: "CHL", name: "Chile", rural: 0.15, keep: (lon) => lon > -77 },
  { iso: "CAN", name: "Canada", rural: 0.15 },
];

const TARGET_POINTS = 4000;
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

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

function simplify(points, tol) {
  // Douglas–Peucker on an open polyline (closed rings: first == last).
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

// ---------- main ----------
const countries = JSON.parse(fs.readFileSync(path.join(rawDir, "ne_50m_admin_0_countries.geojson"), "utf8"));
const places = JSON.parse(fs.readFileSync(path.join(rawDir, "ne_10m_populated_places_simple.geojson"), "utf8"));
fs.mkdirSync(outDir, { recursive: true });

for (const cfg of COUNTRIES) {
  const rand = mulberry32([...cfg.iso].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const feat = countries.features.find((f) => f.properties.ADM0_A3 === cfg.iso);
  if (!feat) throw new Error(`Country not found: ${cfg.iso}`);
  const totalPop = feat.properties.POP_EST;

  let lonlatPolys = feat.geometry.type === "Polygon" ? [feat.geometry.coordinates] : feat.geometry.coordinates;
  if (cfg.keep) lonlatPolys = lonlatPolys.filter((poly) => {
    const [lon, lat] = poly[0][0];
    return cfg.keep(lon, lat);
  });

  // Centre the projection on the lon/lat bounding box.
  let lo0 = Infinity, la0 = Infinity, lo1 = -Infinity, la1 = -Infinity;
  for (const poly of lonlatPolys) for (const [lon, lat] of poly[0]) {
    lo0 = Math.min(lo0, lon); lo1 = Math.max(lo1, lon); la0 = Math.min(la0, lat); la1 = Math.max(la1, lat);
  }
  const proj = makeLaea((lo0 + lo1) / 2, (la0 + la1) / 2);

  // Project, then normalise so the longest side is 1. Flip y so it points DOWN (screen space).
  let projPolys = lonlatPolys.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => proj(lon, lat))));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of projPolys) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const span = Math.max(x1 - x0, y1 - y0);
  const norm = ([x, y]) => [(x - x0) / span, (y1 - y) / span];
  const kmToUnits = 1 / R_KM / span;
  projPolys = projPolys.map((poly) => poly.map((ring) => ring.map(norm)));

  // Drop specks, simplify for display.
  const minArea = 2e-6;
  const polys = projPolys
    .filter((poly) => ringArea(poly[0]) > minArea)
    .map((poly) => poly.map((ring) => simplify(ring, 0.0008)))
    .filter((poly) => poly[0].length >= 4) // outer ring must survive simplification
    .map((poly) => poly.filter((ring) => ring.length >= 4));
  const isLand = makeLandTest(polys);
  const width = r5((x1 - x0) / span), height = r5((y1 - y0) / span);

  // Cities inside the playable land.
  const cities = places.features
    .filter((f) => f.properties.adm0_a3 === cfg.iso)
    .map((f) => {
      const [x, y] = norm(proj(f.properties.longitude, f.properties.latitude));
      return { name: f.properties.name, pop: f.properties.pop_max, x, y };
    })
    .filter((c) => c.pop > 0 && isLand(c.x, c.y))
    .sort((a, b) => b.pop - a.pop);
  const cityPopSum = cities.reduce((s, c) => s + c.pop, 0);

  const points = [];
  const urbanMass = totalPop * (1 - cfg.rural);
  const ruralMass = totalPop * cfg.rural;
  const urbanBudget = Math.round(TARGET_POINTS * 0.6);
  const ruralBudget = TARGET_POINTS - urbanBudget;

  // Urban: gaussian blobs, sample count ∝ sqrt(pop).
  const sqrtSum = cities.reduce((s, c) => s + Math.sqrt(c.pop), 0);
  for (const c of cities) {
    const n = Math.max(3, Math.round((urbanBudget * Math.sqrt(c.pop)) / sqrtSum));
    const sigma = (4 + 10 * Math.sqrt(c.pop / 1e6)) * kmToUnits;
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
  while (rural.length < ruralBudget * 3 && guard++ < ruralBudget * 400) {
    const x = rand() * width, y = rand() * height;
    if (!isLand(x, y)) continue;
    let near = 0;
    for (const c of cities) {
      const dKm = Math.hypot(x - c.x, y - c.y) / kmToUnits;
      near += c.pop * Math.exp(-dKm / 80);
    }
    rural.push([x, y, 0.01 * cityPopSum / cities.length + near]);
  }
  // Keep the strongest third (a sparse, density-weighted rural layer).
  rural.sort((a, b) => b[2] - a[2]);
  const keptRural = rural.slice(0, ruralBudget);
  const ruralWeightSum = keptRural.reduce((s, r) => s + r[2], 0);
  for (const [x, y, wt] of keptRural) points.push(x, y, (ruralMass * wt) / ruralWeightSum);

  const outline = polys
    .map((poly) => poly.map((ring) => "M" + ring.map(([x, y]) => `${r5(x)} ${r5(y)}`).join("L") + "Z").join(""))
    .join("");

  const pack = {
    iso: cfg.iso,
    name: cfg.name,
    placeholder: true,
    population: totalPop,
    width,
    height,
    outline,
    rings: polys.flat().map((ring) => ring.flatMap(([x, y]) => [r5(x), r5(y)])),
    points: points.map((v, i) => (i % 3 === 2 ? Math.round(v) : r5(v))),
    cities: cities.slice(0, 10).map((c) => ({ name: c.name, pop: c.pop, x: r5(c.x), y: r5(c.y) })),
  };
  const file = path.join(outDir, `${cfg.iso}.json`);
  fs.writeFileSync(file, JSON.stringify(pack));
  console.log(`${cfg.iso}: ${polys.length} polys, ${points.length / 3} pts, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
