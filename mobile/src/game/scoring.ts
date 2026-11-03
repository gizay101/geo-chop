export type Grade = { name: string; emoji: string };

const GRADES: { maxError: number; grade: Grade }[] = [
  { maxError: 0.5, grade: { name: "Surgical", emoji: "✨" } },
  { maxError: 1.5, grade: { name: "Razor", emoji: "🔪" } },
  { maxError: 2.5, grade: { name: "Sharp", emoji: "🗡️" } },
  { maxError: 4, grade: { name: "Clean", emoji: "👌" } },
  { maxError: 7, grade: { name: "Rough", emoji: "🪓" } },
  { maxError: 15, grade: { name: "Hacked", emoji: "🥴" } },
  { maxError: Infinity, grade: { name: "Butchered", emoji: "🍖" } },
];

/** Score (0..100) from error in percentage points. Curve and grades: docs/PLAN.md §2.3 (tunable). */
export function scoreFor(errorPts: number): number {
  return Math.round(100 * Math.exp(-errorPts / 7));
}

export function gradeFor(errorPts: number): Grade {
  return GRADES.find((g) => errorPts < g.maxError)!.grade;
}
