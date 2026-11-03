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
