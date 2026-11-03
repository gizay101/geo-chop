export type Grade = { name: string; emoji: string };

/** Every percentage point off costs this many points (out of 100). */
export const POINTS_PER_PCT = 4;

const GRADES: { maxError: number; grade: Grade }[] = [
  { maxError: 0.5, grade: { name: "Surgical", emoji: "✨" } },
  { maxError: 1.5, grade: { name: "Razor", emoji: "🔪" } },
  { maxError: 2.5, grade: { name: "Sharp", emoji: "🗡️" } },
  { maxError: 5, grade: { name: "Clean", emoji: "👌" } },
  { maxError: 10, grade: { name: "Rough", emoji: "🪓" } },
  { maxError: 18, grade: { name: "Hacked", emoji: "🥴" } },
  { maxError: Infinity, grade: { name: "Butchered", emoji: "🍖" } },
];

/**
 * Score out of 100, one decimal: lose POINTS_PER_PCT per percentage point off.
 * e.g. 48.7% / 51.3% → 1.3 off → 94.8 points. 25+ percentage points off → 0.
 */
export function scoreFor(errorPts: number): number {
  return Math.max(0, Math.round((100 - POINTS_PER_PCT * errorPts) * 10) / 10);
}

export function gradeFor(errorPts: number): Grade {
  return GRADES.find((g) => errorPts < g.maxError)!.grade;
}
