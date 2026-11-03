import type { ChopLine, Pt } from "./types";

/**
 * Side test. With n = (-dy, dx), a point P is on side A when n·(P − a) > 0.
 * The same convention is used for scoring, the visual split and the perfect line.
 */
function normalOf(line: ChopLine): Pt {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/** Fraction (0..1) of population on side A of the infinite line. O(N). */
export function splitShare(points: readonly number[], line: ChopLine): number {
  const n = normalOf(line);
  const c = n.x * line.a.x + n.y * line.a.y;
  let sideA = 0;
  let total = 0;
  for (let i = 0; i < points.length; i += 3) {
    const w = points[i + 2];
    total += w;
    if (n.x * points[i] + n.y * points[i + 1] > c) sideA += w;
  }
  return total > 0 ? sideA / total : 0;
}

/** True when the infinite line has land vertices on both sides, i.e. it actually cuts the country. */
export function lineCrossesLand(rings: readonly number[][], line: ChopLine): boolean {
  const n = normalOf(line);
  const c = n.x * line.a.x + n.y * line.a.y;
  let pos = false;
  let neg = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      if (n.x * ring[i] + n.y * ring[i + 1] > c) pos = true;
      else neg = true;
      if (pos && neg) return true;
    }
  }
  return false;
}

/**
 * The line parallel to `line` that splits population exactly at `target` (fraction on side A).
 * Uses the weighted quantile of point positions along the line's normal. O(N log N).
 */
export function perfectLine(points: readonly number[], line: ChopLine, target = 0.5): ChopLine {
  const n = normalOf(line);
  const count = points.length / 3;
  const proj = new Array<{ t: number; w: number }>(count);
  let total = 0;
  for (let i = 0, k = 0; i < points.length; i += 3, k++) {
    proj[k] = { t: n.x * points[i] + n.y * points[i + 1], w: points[i + 2] };
    total += points[i + 2];
  }
  // Side A is "t > c", so walk from the largest t downwards until A holds `target` of the people.
  proj.sort((p, q) => q.t - p.t);
  let acc = 0;
  let cStar = proj[proj.length - 1]?.t ?? 0;
  for (let k = 0; k < proj.length; k++) {
    acc += proj[k].w;
    if (acc >= target * total) {
      const next = proj[k + 1]?.t ?? proj[k].t;
      cStar = (proj[k].t + next) / 2;
      break;
    }
  }
  const shift = cStar - (n.x * line.a.x + n.y * line.a.y);
  return {
    a: { x: line.a.x + n.x * shift, y: line.a.y + n.y * shift },
    b: { x: line.b.x + n.x * shift, y: line.b.y + n.y * shift },
  };
}

// ---------------------------------------------------------------------------
// Cuts: a straight line, or a freehand curve. Both are extended to infinity at
// their ends, so any cut that crosses the land splits it into two sides.
// ---------------------------------------------------------------------------

export type Cut = { kind: "line"; line: ChopLine } | { kind: "curve"; pts: Pt[] };

/** Unit direction at the start (pointing backwards, off the curve) and at the end (pointing forwards). */
function endTangents(pts: Pt[]): { d0: Pt; d1: Pt } {
  const pick = (from: number, step: number): Pt => {
    const p = pts[from];
    for (let i = from + step; i >= 0 && i < pts.length; i += step) {
      const dx = p.x - pts[i].x, dy = p.y - pts[i].y;
      const len = Math.hypot(dx, dy);
      if (len > 0.02) return { x: dx / len, y: dy / len };
    }
    const q = pts[step > 0 ? pts.length - 1 : 0];
    const dx = p.x - q.x, dy = p.y - q.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };
  return { d0: pick(0, 1), d1: pick(pts.length - 1, -1) };
}

/** The curve with both ends extended by `far` along their tangents. */
export function extendedCurve(pts: Pt[], far: number): Pt[] {
  const { d0, d1 } = endTangents(pts);
  const s = pts[0], e = pts[pts.length - 1];
  return [{ x: s.x + d0.x * far, y: s.y + d0.y * far }, ...pts, { x: e.x + d1.x * far, y: e.y + d1.y * far }];
}

/**
 * A polygon covering side A (even–odd fill). For a line: a huge half-plane quad on the
 * n = (-dy, dx) side, matching splitShare. For a curve: the extended curve closed by a far arc.
 */
export function cutPolygon(cut: Cut, far = 50): Pt[] {
  if (cut.kind === "line") {
    const { a, b } = cut.line;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = { x: dx / len, y: dy / len };
    const n = { x: -d.y, y: d.x };
    return [
      { x: a.x - d.x * far, y: a.y - d.y * far },
      { x: a.x + d.x * far, y: a.y + d.y * far },
      { x: a.x + d.x * far + n.x * far, y: a.y + d.y * far + n.y * far },
      { x: a.x - d.x * far + n.x * far, y: a.y - d.y * far + n.y * far },
    ];
  }
  const ext = extendedCurve(cut.pts, far);
  const cx = cut.pts.reduce((s, p) => s + p.x, 0) / cut.pts.length;
  const cy = cut.pts.reduce((s, p) => s + p.y, 0) / cut.pts.length;
  const R = far * 1.6;
  const a1 = Math.atan2(ext[ext.length - 1].y - cy, ext[ext.length - 1].x - cx);
  let a0 = Math.atan2(ext[0].y - cy, ext[0].x - cx);
  while (a0 <= a1) a0 += 2 * Math.PI; // always sweep the same way round
  const arc: Pt[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = a1 + ((a0 - a1) * i) / steps;
    arc.push({ x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) });
  }
  return [...ext, ...arc];
}

function inPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i], pj = poly[j];
    if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) inside = !inside;
  }
  return inside;
}

/** Fast "is this point on side A?" test for a cut. */
export function sideTest(cut: Cut): (x: number, y: number) => boolean {
  if (cut.kind === "line") {
    const n = normalOf(cut.line);
    const c = n.x * cut.line.a.x + n.y * cut.line.a.y;
    return (x, y) => n.x * x + n.y * y > c;
  }
  const poly = cutPolygon(cut);
  return (x, y) => inPolygon(x, y, poly);
}

export function splitShareCut(points: readonly number[], cut: Cut): number {
  if (cut.kind === "line") return splitShare(points, cut.line);
  const inA = sideTest(cut);
  let a = 0, total = 0;
  for (let i = 0; i < points.length; i += 3) {
    total += points[i + 2];
    if (inA(points[i], points[i + 1])) a += points[i + 2];
  }
  return total > 0 ? a / total : 0;
}

export function cutCrossesLand(rings: readonly number[][], cut: Cut): boolean {
  if (cut.kind === "line") return lineCrossesLand(rings, cut.line);
  if (cut.pts.length < 2) return false;
  const inA = sideTest(cut);
  let pos = false, neg = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      if (inA(ring[i], ring[i + 1])) pos = true;
      else neg = true;
      if (pos && neg) return true;
    }
  }
  return false;
}

/** Unit vector from side B towards side A (used to push the pieces apart). */
export function cutNormal(cut: Cut, points: readonly number[]): Pt {
  if (cut.kind === "line") return normalOf(cut.line);
  const p = cut.pts, s = p[0], e = p[p.length - 1];
  const len = Math.hypot(e.x - s.x, e.y - s.y) || 1;
  let n = { x: -(e.y - s.y) / len, y: (e.x - s.x) / len };
  // Flip so it points from B's population centre towards A's.
  const inA = sideTest(cut);
  let ax = 0, ay = 0, aw = 0, bx = 0, by = 0, bw = 0;
  for (let i = 0; i < points.length; i += 3) {
    const w = points[i + 2];
    if (inA(points[i], points[i + 1])) { ax += points[i] * w; ay += points[i + 1] * w; aw += w; }
    else { bx += points[i] * w; by += points[i + 1] * w; bw += w; }
  }
  if (aw > 0 && bw > 0 && (ax / aw - bx / bw) * n.x + (ay / aw - by / bw) * n.y < 0) n = { x: -n.x, y: -n.y };
  return n;
}

/** Distance from a point to the cut (for the column ripple). */
export function cutDistance(cut: Cut): (x: number, y: number) => number {
  if (cut.kind === "line") {
    const n = normalOf(cut.line);
    const c = n.x * cut.line.a.x + n.y * cut.line.a.y;
    return (x, y) => Math.abs(n.x * x + n.y * y - c);
  }
  const p = extendedCurve(cut.pts, 50);
  return (x, y) => {
    let best = Infinity;
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1].x, ay = p[i - 1].y, dx = p[i].x - ax, dy = p[i].y - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-12)));
      best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
    }
    return best;
  };
}

/**
 * The perfect version of the player's cut. A line gets shifted parallel (exact).
 * A curve gets slid along its chord normal until the split is 50/50 (binary search).
 */
export function perfectCut(points: readonly number[], cut: Cut, target = 0.5): Cut {
  if (cut.kind === "line") return { kind: "line", line: perfectLine(points, cut.line, target) };
  const p = cut.pts, s = p[0], e = p[p.length - 1];
  const len = Math.hypot(e.x - s.x, e.y - s.y) || 1;
  const n = { x: -(e.y - s.y) / len, y: (e.x - s.x) / len };
  const inA = sideTest(cut);
  const shareAt = (shift: number) => {
    let a = 0, total = 0;
    for (let i = 0; i < points.length; i += 3) {
      total += points[i + 2];
      if (inA(points[i] - n.x * shift, points[i + 1] - n.y * shift)) a += points[i + 2];
    }
    return total > 0 ? a / total : 0;
  };
  let lo = -1.5, hi = 1.5;
  const fLo = shareAt(lo) - target, fHi = shareAt(hi) - target;
  if (fLo * fHi > 0) return cut; // cannot bracket: leave as is
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if ((shareAt(mid) - target) * fLo > 0) lo = mid;
    else hi = mid;
  }
  const shift = (lo + hi) / 2;
  return { kind: "curve", pts: p.map((q) => ({ x: q.x + n.x * shift, y: q.y + n.y * shift })) };
}
