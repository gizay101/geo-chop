import { entriesFor, type PackEntry, type PackId } from "@/data/packs";

/** Countries are played in packs of 4, ordered easy → hard within a continent. */
export const BATCH_SIZE = 4;

export type Batch = { id: string; index: number; title: string; level: string; pack: PackId; entries: PackEntry[] };

export const CONTINENT_ORDER = ["Europe", "Asia", "Africa", "North America", "South America", "Oceania"] as const;

export const CONTINENT_EMOJI: Record<string, string> = {
  Europe: "🏰",
  Asia: "🏯",
  Africa: "🦁",
  "North America": "🗽",
  "South America": "🦜",
  Oceania: "🐨",
};

const LEVELS = ["Easy", "Medium", "Hard", "Expert"];

export function batchesFor(pack: PackId, continent?: string): Batch[] {
  const list = entriesFor(pack)
    .filter((e) => !continent || e.continent === continent)
    .sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name));
  const chunks: PackEntry[][] = [];
  for (let i = 0; i < list.length; i += BATCH_SIZE) chunks.push(list.slice(i, i + BATCH_SIZE));
  // A lonely last country joins the previous pack rather than being a pack of one.
  if (chunks.length > 1 && chunks[chunks.length - 1].length === 1) chunks[chunks.length - 2].push(...chunks.pop()!);
  return chunks.map((entries, index) => ({
    id: `${pack}:${continent ?? "all"}:${index + 1}`,
    index,
    title: `Pack ${index + 1}`,
    level: LEVELS[Math.min(LEVELS.length - 1, Math.floor((index / Math.max(1, chunks.length)) * LEVELS.length))],
    pack,
    entries,
  }));
}

export function continentsFor(pack: PackId): { name: string; count: number }[] {
  const all = entriesFor(pack);
  return CONTINENT_ORDER.map((name) => ({ name, count: all.filter((e) => e.continent === name).length })).filter((c) => c.count > 0);
}
