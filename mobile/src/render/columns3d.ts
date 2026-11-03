// Faux-3D population columns (docs/PLAN.md §3.5).
//
// "Ground" space = the flat map in screen pixels, which is what the player aimed on.
// The camera rotates the ground around the canvas centre (theta), tilts it (phi) and zooms (k).
// Columns are hexagonal prisms drawn as one Skia triangle mesh per frame, in back-to-front
// (painter's) order, entirely on the UI thread.
import { BlendMode, Skia, VertexMode, type SkCanvas, type SkColor, type SkPoint } from "@shopify/react-native-skia";

import type { ChopLine, CountryPack, Pt } from "@/game/types";

/** How far the two pieces drift apart after the chop, in ground px. */
export const SEPARATION = 12;
/** Thickness of the country slab, in ground px. */
export const SLAB_THICKNESS = 7;

const TRIANGLES = VertexMode.Triangles;
const DST_OVER = BlendMode.DstOver;
const TARGET_HEXES = 1300;
const MAX_HEXES = 1700; // 18 vertices each must stay under the 65,535 uint16 index limit
const MAX_DELAY = 0.45;

export type Fit = { s: number; ox: number; oy: number };

export type Cam = { cx: number; cy: number; ox: number; oy: number; k: number; theta: number; phi: number };

/** The camera's resting pose after the tilt animation. */
export type CamFinal = { cx: number; cy: number; theta: number; phi: number; k: number; ox: number; oy: number };

export type ColumnModel = {
  count: number;
  gx: number[];
  gy: number[];
  h: number[];
  /** 0 = side A, 1 = side B. */
  side: number[];
  delay: number[];
  r: number;
  /** [side][face 0..5, 6 = top] → RGBA (0..1). */
  colors: number[][][];
  labelA: Pt;
  labelB: Pt;
  /** Side-A normal in ground space (unit). */
  nx: number;
  ny: number;
};

// ---------- camera ----------

export function camAt(f: CamFinal, u: number, orbit: number, pitch: number): Cam {
  "worklet";
  const phi = Math.max(0, Math.min(1.3, f.phi * u + pitch));
  return { cx: f.cx, cy: f.cy, theta: f.theta * u + orbit, phi, k: 1 + (f.k - 1) * u, ox: f.ox * u, oy: f.oy * u };
}

/** Ground → screen for a point at height z (ground px). */
export function project(c: Cam, x: number, y: number, z: number): Pt {
  "worklet";
  const ct = Math.cos(c.theta), st = Math.sin(c.theta);
  const dx = x - c.cx, dy = y - c.cy;
  return {
    x: c.cx + c.ox + c.k * (ct * dx - st * dy),
    y: c.cy + c.oy + c.k * Math.cos(c.phi) * (st * dx + ct * dy) - z * c.k * Math.sin(c.phi),
  };
}

/** The same mapping as `project` (z = 0), as a Skia transform list for <Group>. */
export function camTransform(c: Cam) {
  "worklet";
  return [
    { translateX: c.cx + c.ox },
    { translateY: c.cy + c.oy },
    { scaleX: c.k },
    { scaleY: c.k * Math.cos(c.phi) },
    { rotate: c.theta },
    { translateX: -c.cx },
    { translateY: -c.cy },
  ];
}

/** Choose the final rotation/tilt/zoom so the tilted country plus its columns fit the canvas. */
export function finalCamera(country: CountryPack, fit: Fit, w: number, h: number, hmax: number): CamFinal {
  const theta = -0.5;
  const phi = 0.95;
  const cx = w / 2, cy = h / 2;
  const ct = Math.cos(theta), st = Math.sin(theta), cp = Math.cos(phi), sp = Math.sin(phi);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const ring of country.rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const dx = fit.ox + ring[i] * fit.s - cx, dy = fit.oy + ring[i + 1] * fit.s - cy;
      const X = ct * dx - st * dy, Y = cp * (st * dx + ct * dy);
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    }
  }
  const pad = 30;
  const k = Math.min(1.8, (w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0 + hmax * sp));
  return {
    cx, cy, theta, phi, k,
    ox: -k * (x0 + x1) / 2,
    oy: -k * (y0 + y1) / 2 + 0.5 * hmax * k * sp,
  };
}

// ---------- column model (built once per chop, on the JS thread) ----------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function shade([r, g, b]: [number, number, number], f: number): number[] {
  const c = (v: number) => Math.max(0, Math.min(1, v * f));
  return [c(r), c(g), c(b), 1];
}

function ringArea(ring: number[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) a += (ring[j] + ring[i]) * (ring[j + 1] - ring[i + 1]);
  return Math.abs(a / 2);
}

export function buildColumns(
  country: CountryPack,
  fit: Fit,
  line: ChopLine,
  colorA: string,
  colorB: string,
  hmax: number,
): ColumnModel {
  // Side-A normal (same convention as game/geometry.ts) and line constant, in normalised space.
  const ndx = line.b.x - line.a.x, ndy = line.b.y - line.a.y;
  const nlen = Math.hypot(ndx, ndy) || 1;
  const nx = -ndy / nlen, ny = ndx / nlen;
  const c = nx * line.a.x + ny * line.a.y;

  const landPx = country.rings.reduce((s, r) => s + ringArea(r), 0) * fit.s * fit.s;
  let r = Math.sqrt(landPx / (TARGET_HEXES * 2.598));
  const pts = country.points;

  let bins = new Map<string, { q: number; rr: number; wA: number; wB: number }>();
  for (let attempt = 0; attempt < 6; attempt++) {
    bins = new Map();
    for (let i = 0; i < pts.length; i += 3) {
      const x = fit.ox + pts[i] * fit.s, y = fit.oy + pts[i + 1] * fit.s;
      // Pointy-top axial coordinates with cube rounding.
      const fq = ((Math.sqrt(3) / 3) * x - y / 3) / r;
      const fr = ((2 / 3) * y) / r;
      const fs = -fq - fr;
      let q = Math.round(fq), rr = Math.round(fr);
      const s = Math.round(fs);
      const dq = Math.abs(q - fq), dr = Math.abs(rr - fr), ds = Math.abs(s - fs);
      if (dq > dr && dq > ds) q = -rr - s;
      else if (dr > ds) rr = -q - s;
      const key = q + "," + rr;
      let b = bins.get(key);
      if (!b) bins.set(key, (b = { q, rr, wA: 0, wB: 0 }));
      if (nx * pts[i] + ny * pts[i + 1] > c) b.wA += pts[i + 2];
      else b.wB += pts[i + 2];
    }
    if (bins.size <= MAX_HEXES) break;
    r *= 1.2;
  }

  const hexes = [...bins.values()];
  const wMax = hexes.reduce((m, b) => Math.max(m, b.wA + b.wB), 0) || 1;
  const gx: number[] = [], gy: number[] = [], h: number[] = [], side: number[] = [], dist: number[] = [];
  let sumA = 0, sumB = 0, axS = 0, ayS = 0, bxS = 0, byS = 0;
  for (const b of hexes) {
    const x = r * Math.sqrt(3) * (b.q + b.rr / 2);
    const y = r * 1.5 * b.rr;
    const w = b.wA + b.wB;
    const sd = b.wA >= b.wB ? 0 : 1;
    gx.push(x); gy.push(y); side.push(sd);
    h.push(Math.max(1.5, hmax * Math.pow(w / wMax, 0.55)));
    // Distance from the chop line (normalised units → only used relatively).
    const nxp = (x - fit.ox) / fit.s, nyp = (y - fit.oy) / fit.s;
    dist.push(Math.abs(nx * nxp + ny * nyp - c));
    if (sd === 0) { sumA += w; axS += x * w; ayS += y * w; } else { sumB += w; bxS += x * w; byS += y * w; }
  }
  const dMax = Math.max(...dist, 1e-9);
  const delay = dist.map((d) => (d / dMax) * MAX_DELAY);

  // Flat shading: fixed light from the front-left of the ground plane.
  const light = (3 * Math.PI) / 4;
  const mkColors = (hex: string) => {
    const rgb = hexToRgb(hex);
    const faces: number[][] = [];
    for (let f = 0; f < 6; f++) {
      const normal = Math.PI / 3 + (f * Math.PI) / 3;
      faces.push(shade(rgb, 0.68 + 0.26 * Math.cos(normal - light)));
    }
    faces.push(shade(rgb, 1.12)); // top
    return faces;
  };

  return {
    count: gx.length,
    gx, gy, h, side, delay,
    r: r * 0.86, // small gaps between columns read as "blocks"
    colors: [mkColors(colorA), mkColors(colorB)],
    labelA: sumA > 0 ? { x: axS / sumA, y: ayS / sumA } : { x: 0, y: 0 },
    labelB: sumB > 0 ? { x: bxS / sumB, y: byS / sumB } : { x: 0, y: 0 },
    nx, ny,
  };
}

// ---------- per-frame drawing (UI thread) ----------

export function drawColumns(canvas: SkCanvas, m: ColumnModel, c: Cam, rise: number, sep: number) {
  "worklet";
  if (rise <= 0 || m.count === 0) return;
  const ct = Math.cos(c.theta), st = Math.sin(c.theta);
  const cp = Math.cos(c.phi), sp = Math.sin(c.phi);
  const k = c.k;

  // Hex corner offsets after rotation/tilt, shared by every column.
  const px: number[] = [], py: number[] = [];
  for (let j = 0; j < 6; j++) {
    const a = Math.PI / 6 + (j * Math.PI) / 3;
    const ox = m.r * Math.cos(a), oy = m.r * Math.sin(a);
    px.push(k * (ct * ox - st * oy));
    py.push(k * cp * (st * ox + ct * oy));
  }
  // Side faces whose outward normal points towards the viewer (screen-down).
  const vis: number[] = [];
  for (let f = 0; f < 6; f++) if (Math.sin(Math.PI / 3 + (f * Math.PI) / 3 + c.theta) > 0.001) vis.push(f);

  const n = m.count;
  const X: number[] = new Array(n), Y: number[] = new Array(n), Z: number[] = new Array(n);
  const depth: number[] = new Array(n), order: number[] = new Array(n);
  const span = 1 - MAX_DELAY;
  for (let i = 0; i < n; i++) {
    const s = m.side[i] === 0 ? 1 : -1;
    const dx = m.gx[i] + m.nx * SEPARATION * sep * s - c.cx;
    const dy = m.gy[i] + m.ny * SEPARATION * sep * s - c.cy;
    const ry = st * dx + ct * dy;
    X[i] = c.cx + c.ox + k * (ct * dx - st * dy);
    Y[i] = c.cy + c.oy + k * cp * ry;
    depth[i] = ry;
    let t = Math.max(0, Math.min(1, (rise - m.delay[i]) / span));
    t = 1 - Math.pow(1 - t, 3); // ease-out cubic
    Z[i] = m.h[i] * t * k * sp;
    order[i] = i;
  }
  order.sort((a, b) => depth[a] - depth[b]);

  const pos: { x: number; y: number }[] = [];
  const cols: number[][] = [];
  const idx: number[] = [];
  for (let o = 0; o < n; o++) {
    const i = order[o];
    const z = Z[i];
    const fc = m.colors[m.side[i]];
    if (z > 0.3) {
      for (let v = 0; v < vis.length; v++) {
        const f = vis[v], f1 = (f + 1) % 6;
        const base = pos.length;
        const x0 = X[i] + px[f], y0 = Y[i] + py[f], x1 = X[i] + px[f1], y1 = Y[i] + py[f1];
        pos.push({ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x1, y: y1 - z }, { x: x0, y: y0 - z });
        const col = fc[f];
        cols.push(col, col, col, col);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const base = pos.length;
    const top = fc[6];
    for (let j = 0; j < 6; j++) {
      pos.push({ x: X[i] + px[j], y: Y[i] + py[j] - z });
      cols.push(top);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 3, base + 4, base, base + 4, base + 5);
  }
  const verts = Skia.MakeVertices(TRIANGLES, pos as unknown as SkPoint[], null, cols as unknown as SkColor[], idx);
  canvas.drawVertices(verts, DST_OVER, Skia.Paint());
}
