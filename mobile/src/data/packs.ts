import type { CountryPack } from "@/game/types";
import { LOADERS, PACK_INDEX, type PackEntry, type PackId } from "./registry";

export { PACK_INDEX, type PackEntry, type PackId };

const cache = new Map<string, CountryPack>();

/** Load a pack by ISO code. Parsed on first use, then cached. */
export function loadPack(iso: string): CountryPack {
  let p = cache.get(iso);
  if (!p) {
    const load = LOADERS[iso];
    if (!load) throw new Error(`Unknown pack: ${iso}`);
    p = load();
    cache.set(iso, p);
  }
  return p;
}

export const entriesFor = (pack: PackId) =>
  PACK_INDEX.filter((e) => e.pack === pack).sort((a, b) => a.name.localeCompare(b.name));

export const entryFor = (iso: string) => PACK_INDEX.find((e) => e.iso === iso);

/** 🇯🇵 from "JP". The world gets a globe. */
export function flagOf(iso2: string): string {
  if (!/^[A-Z]{2}$/.test(iso2)) return "🌍";
  return String.fromCodePoint(...[...iso2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
