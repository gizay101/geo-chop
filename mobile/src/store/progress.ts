// Local player data (on device only). docs/NEXT_STEPS.md §2.
import Storage from "expo-sqlite/kv-store";

import type { Cut } from "@/game/geometry";

export type RoundRecord = { iso: string; shareA: number; error: number; score: number; cut: Cut };

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => Storage.setItemSync(key, JSON.stringify(value));

// ---- daily ----
export function getDaily(no: number): RoundRecord[] {
  return readJson<RoundRecord[]>(`daily:${no}`, []);
}

export function saveDailyRound(no: number, round: number, rec: RoundRecord, totalRounds: number) {
  const rounds = getDaily(no);
  rounds[round] = rec;
  writeJson(`daily:${no}`, rounds);
  if (rounds.filter(Boolean).length === totalRounds) {
    const done = new Set(readJson<number[]>("dailyDone", []));
    done.add(no);
    writeJson("dailyDone", [...done].sort((a, b) => a - b));
  }
}

export function getStreak(today: number): { current: number; best: number; played: number } {
  const done = new Set(readJson<number[]>("dailyDone", []));
  let current = 0;
  for (let n = done.has(today) ? today : today - 1; done.has(n); n--) current++;
  let best = 0;
  let run = 0;
  let prev = -Infinity;
  for (const n of [...done].sort((a, b) => a - b)) {
    run = n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  return { current, best, played: done.size };
}

// ---- best score per pack ("countries/JPN", "economy/JPN", ...), separately for freehand ----
const bestKey = (id: string, tool: string) => (tool === "free" ? `best:free:${id}` : `best:${id}`);

export function getBest(id: string, tool = "free"): number | null {
  return readJson<number | null>(bestKey(id, tool), null);
}

// ---- best total per pack of 4 ----
const batchKey = (id: string, tool: string) => `batch:${tool}:${id}`;

export function getBatchBest(id: string, tool = "free"): number | null {
  return readJson<number | null>(batchKey(id, tool), null);
}

export function saveBatchBest(id: string, total: number, tool = "free") {
  const prev = getBatchBest(id, tool);
  if (prev === null || total > prev) writeJson(batchKey(id, tool), total);
}

export function saveBest(id: string, score: number, tool = "free") {
  const prev = getBest(id, tool);
  if (prev === null || score > prev) writeJson(bestKey(id, tool), score);
}
