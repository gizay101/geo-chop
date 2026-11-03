import { entriesFor } from "@/data/packs";

/** Puzzle #1 is 3 Nov 2026 (the player's local date). */
const EPOCH_UTC = Date.UTC(2026, 10, 3);
export const ROUNDS_PER_DAY = 5;

export function puzzleNumber(now = new Date()): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - EPOCH_UTC) / 86_400_000) + 1;
}

/** murmur3 finaliser: spreads consecutive puzzle numbers into unrelated seeds. */
function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The same 5 countries for everyone on a given puzzle number. */
export function dailyCountries(no: number): string[] {
  // Microstates and atolls are fun in packs but too fiddly for the shared daily.
  const pool = entriesFor("countries")
    .filter((e) => e.total >= 2_000_000)
    .map((e) => e.iso);
  const rand = mulberry32(mix(no + 0x9e3779b9));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, ROUNDS_PER_DAY);
}
