import type { CountryPack } from "@/game/types";
import { LOADERS, PACK_INDEX, type Metric, type PackEntry, type PackId } from "./registry";

export { PACK_INDEX, type Metric, type PackEntry, type PackId };

const cache = new Map<string, CountryPack>();

/** Stable id of a pack, e.g. "countries/JPN" or "economy/JPN". */
export const packKey = (pack: string, iso: string) => `${pack}/${iso}`;

/** Load a pack. Parsed on first use, then cached. */
export function loadPack(iso: string, pack: PackId = "countries"): CountryPack {
  const key = packKey(pack, iso);
  let p = cache.get(key);
  if (!p) {
    const load = LOADERS[key];
    if (!load) throw new Error(`Unknown pack: ${key}`);
    p = decode(load());
    cache.set(key, p);
  }
  return p;
}

/** Packs ship with integer coordinates (0..q) to keep the app small; the game works in 0..1 floats. */
function decode(raw: CountryPack & { q?: number }): CountryPack {
  const q = raw.q;
  if (!q) return raw;
  const s = 1 / q;
  const points = raw.points.slice();
  for (let i = 0; i < points.length; i += 3) {
    points[i] *= s;
    points[i + 1] *= s;
  }
  return {
    ...raw,
    rings: raw.rings.map((r) => r.map((v) => v * s)),
    points,
    cities: raw.cities.map((c) => ({ ...c, x: c.x * s, y: c.y * s })),
  };
}

export const entriesFor = (pack: PackId) =>
  PACK_INDEX.filter((e) => e.pack === pack).sort((a, b) => a.name.localeCompare(b.name));

export const entryFor = (iso: string, pack: PackId = "countries") => PACK_INDEX.find((e) => e.iso === iso && e.pack === pack);

/** 🇯🇵 from "JP". The world gets a globe. */
export function flagOf(iso2: string): string {
  if (!/^[A-Z]{2}$/.test(iso2)) return "🌍";
  return String.fromCodePoint(...[...iso2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** What is being split, in words. */
export const METRIC_WORDS: Record<Metric, { goal: string; unit: string }> = {
  population: { goal: "Chop the population in half", unit: "people" },
  gdp: { goal: "Economy: chop the GDP in half", unit: "GDP" },
  billionaires: { goal: "Billionaires: chop them in half", unit: "billionaires" },
};

/** "125M people", "$5.9T GDP", "232 billionaires". */
export function formatTotal(metric: Metric, n: number): string {
  const short = (v: number) =>
    v >= 1e12 ? `${(v / 1e12).toFixed(1)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : `${Math.round(v)}`;
  if (metric === "gdp") return `$${short(n)} GDP`;
  if (metric === "billionaires") return `${Math.round(n)} billionaires`;
  return `${short(n)} people`;
}
