import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { playSfx } from "@/audio/sfx";
import { entryFor, flagOf, loadPack, PACK_INDEX, packKey, type PackEntry, type PackId } from "@/data/packs";
import { batchesFor } from "@/game/batches";
import { dailyCountries, puzzleNumber, ROUNDS_PER_DAY } from "@/game/daily";
import { gradeFor, ONSLAUGHT_MAX_ERROR } from "@/game/scoring";
import { getDaily, getOnslaughtBest, saveBatchBest, saveBest, saveDailyRound, saveOnslaughtBest, type RoundRecord } from "@/store/progress";
import type { Tool } from "@/render/ChopCanvas";
import { RoundView, type RoundResult } from "@/ui/RoundView";
import { useTheme, type Theme } from "@/ui/theme";

/**
 * /play?mode=daily
 * /play?mode=batch&pack=countries&continent=Europe&n=2
 * /play?mode=single&pack=world&iso=WLD
 */
export default function Play() {
  const p = useLocalSearchParams<{ mode?: string; iso?: string; pack?: PackId; continent?: string; n?: string }>();
  const pack = p.pack ?? "countries";
  const tool: Tool = "free";
  if (p.mode === "daily") return <Daily />;
  if (p.mode === "onslaught") return <Onslaught />;
  if (p.mode === "batch") return <BatchRun key={`${pack}-${p.continent}-${p.n}-${tool}`} pack={pack} continent={p.continent ?? ""} n={Number(p.n ?? 1)} tool={tool} />;
  return <Single iso={p.iso ?? "WLD"} pack={pack} tool={tool} />;
}

const PACK_LABEL: Record<PackId, string> = {
  world: "The World",
  countries: "Countries",
  islands: "Islands",
  economy: "Economy",
  billionaires: "Billionaires",
};

const toRecord = (r: RoundResult, pack?: string): RoundRecord => ({ iso: r.iso, shareA: r.shareA, error: r.error, score: r.score, cut: r.cut, pack });

function Single({ iso, pack, tool }: { iso: string; pack: PackId; tool: Tool }) {
  const country = useMemo(() => loadPack(iso, pack), [iso, pack]);
  const where = PACK_LABEL[pack];
  return (
    <RoundView
      country={country}
      tool={tool}
      label={where}
      allowRetry
      nextLabel="Done ✓"
      onBack={() => router.back()}
      onChopped={(r) => saveBest(packKey(pack, r.iso), r.score, tool)}
      onNext={() => router.back()}
    />
  );
}

/** A pack of 4: one chop per country, total out of 400. */
function BatchRun({ pack, continent, n, tool }: { pack: PackId; continent: string; n: number; tool: Tool }) {
  const batches = useMemo(() => batchesFor(pack, continent || undefined), [pack, continent]);
  const batch = batches[n - 1];
  const [round, setRound] = useState(0);
  const [records, setRecords] = useState<RoundRecord[]>([]);
  if (!batch) return null;
  const count = batch.entries.length;
  const where = continent || PACK_LABEL[pack];

  if (round >= count) {
    const next = batches[n];
    return (
      <Summary
        kicker={`${where.toUpperCase()} · ${batch.title.toUpperCase()}`}
        records={records}
        pack={pack}
        onHome={() => router.dismissAll()}
        primary={
          next
            ? {
                label: `${next.title} →`,
                onPress: () =>
                  router.replace(`/play?mode=batch&pack=${pack}&continent=${encodeURIComponent(continent)}&n=${n + 1}` as never),
              }
            : { label: "Back to packs", onPress: () => router.back() }
        }
        secondary={{
          label: "Play again",
          onPress: () => {
            setRecords([]);
            setRound(0);
          },
        }}
      />
    );
  }

  const entry = batch.entries[round];
  return (
    <RoundView
      key={`${batch.id}-${round}`}
      country={loadPack(entry.iso, pack)}
      tool={tool}
      label={`${where} · ${batch.title} · ${round + 1}/${count}`}
      allowRetry={false}
      nextLabel={round < count - 1 ? "Next country →" : "See results →"}
      onBack={() => router.back()}
      onChopped={(r) => {
        saveBest(packKey(pack, r.iso), r.score, tool);
        setRecords((rs) => {
          const all = [...rs, toRecord(r)];
          if (all.length === count) saveBatchBest(batch.id, all.reduce((s, x) => s + x.score, 0), tool);
          return all;
        });
      }}
      onNext={() => setRound((x) => x + 1)}
    />
  );
}

function shuffled<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Onslaught: random countries from every pack, until one cut is more than 15% off. */
function Onslaught() {
  const [run, setRun] = useState(0);
  const pool = useMemo<PackEntry[]>(() => shuffled(PACK_INDEX), [run]);
  const [round, setRound] = useState(0);
  const [records, setRecords] = useState<RoundRecord[]>([]);
  const [over, setOver] = useState(false);
  const survived = records.filter((r) => r.error <= ONSLAUGHT_MAX_ERROR).length;
  const bestBefore = useMemo(() => getOnslaughtBest(), [run]);

  if (over) {
    const best = Math.max(bestBefore, survived);
    return (
      <Summary
        kicker="ONSLAUGHT · RUN OVER"
        bigValue={`${survived}`}
        bigOf={survived === 1 ? " country" : " countries"}
        sub={survived > bestBefore ? "New best run!" : `Best run: ${best}`}
        records={records}
        pack="countries"
        primary={{
          label: "Try again",
          onPress: () => {
            setRecords([]);
            setRound(0);
            setOver(false);
            setRun((n) => n + 1);
          },
        }}
        secondary={{ label: "Home", onPress: () => router.dismissAll() }}
      />
    );
  }

  const entry = pool[round % pool.length];
  return (
    <RoundView
      key={`onslaught-${run}-${round}`}
      country={loadPack(entry.iso, entry.pack)}
      label={`Onslaught · ${survived} survived · stay within ${ONSLAUGHT_MAX_ERROR}%`}
      allowRetry={false}
      nextLabel="Next country →"
      nextLabelFor={(r) => (r.error <= ONSLAUGHT_MAX_ERROR ? "Next country →" : "Run over · see results")}
      onBack={() => router.back()}
      onChopped={(r) => {
        saveBest(packKey(entry.pack, r.iso), r.score);
        const all = [...records, toRecord(r, entry.pack)];
        setRecords(all);
        saveOnslaughtBest(all.filter((x) => x.error <= ONSLAUGHT_MAX_ERROR).length);
      }}
      onNext={() => {
        const lastRec = records[records.length - 1];
        if (lastRec && lastRec.error > ONSLAUGHT_MAX_ERROR) setOver(true);
        else setRound((x) => x + 1);
      }}
    />
  );
}

function Daily() {
  const no = puzzleNumber();
  const isos = useMemo(() => dailyCountries(no), [no]);
  const [records, setRecords] = useState<RoundRecord[]>(() => getDaily(no));
  const firstOpen = records.findIndex((r, i) => i < ROUNDS_PER_DAY && !r);
  const [round, setRound] = useState(() => {
    const filled = records.filter(Boolean).length;
    return filled >= ROUNDS_PER_DAY ? ROUNDS_PER_DAY : firstOpen === -1 ? records.length : firstOpen;
  });

  if (round >= ROUNDS_PER_DAY) {
    return (
      <Summary
        kicker={`DAILY CHOP #${no}`}
        records={records}
        pack="countries"
        primary={{ label: "Share result", onPress: () => Share.share({ message: shareText(no, records) }) }}
        secondary={{ label: "Back to menu", onPress: () => router.back() }}
        foot="New puzzle at midnight."
      />
    );
  }

  return (
    <RoundView
      key={`daily-${no}-${round}`}
      country={loadPack(isos[round])}
      label={`Daily #${no} · Round ${round + 1} / ${ROUNDS_PER_DAY}`}
      allowRetry={false}
      nextLabel={round < ROUNDS_PER_DAY - 1 ? "Next round →" : "See results →"}
      onBack={() => router.back()}
      onChopped={(r) => {
        saveDailyRound(no, round, toRecord(r), ROUNDS_PER_DAY);
        saveBest(packKey("countries", r.iso), r.score);
        setRecords(getDaily(no));
      }}
      onNext={() => setRound((x) => x + 1)}
    />
  );
}

function shareText(no: number, records: RoundRecord[]): string {
  const total = records.reduce((s, r) => s + r.score, 0);
  const rows = records.map((r) => {
    const e = entryFor(r.iso);
    const filled = Math.max(0, Math.min(5, Math.round(r.score / 20)));
    return `${flagOf(e?.iso2 ?? "")} ${"🟩".repeat(filled)}${"⬜".repeat(5 - filled)} ${r.score.toFixed(1)}`;
  });
  return [`GEO CHOP #${no} 🔪 ${total.toFixed(1)}/${ROUNDS_PER_DAY * 100}`, ...rows].join("\n");
}

type Action = { label: string; onPress: () => void };

function Summary({
  kicker,
  records,
  pack,
  primary,
  secondary,
  onHome,
  bigValue,
  bigOf,
  sub,
  foot,
}: {
  kicker: string;
  records: RoundRecord[];
  pack: PackId;
  primary: Action;
  secondary: Action;
  /** Adds a Home button (back to the main menu). */
  onHome?: () => void;
  /** Override the big number (default: total score out of rounds × 100). */
  bigValue?: string;
  bigOf?: string;
  sub?: string;
  foot?: string;
}) {
  const theme = useTheme();
  const s = makeStyles(theme);
  const total = records.reduce((sum, r) => sum + r.score, 0);

  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.kicker}>{kicker}</Text>
        <Text style={s.total}>
          {bigValue ?? total.toFixed(1)}
          <Text style={s.totalOf}>{bigOf ?? ` / ${records.length * 100}`}</Text>
        </Text>
        {sub ? <Text style={s.subline}>{sub}</Text> : null}
        <View style={s.rows}>
          {records.map((r, i) => {
            const e = entryFor(r.iso, (r.pack as PackId | undefined) ?? pack);
            const g = gradeFor(r.error);
            return (
              <View key={i} style={s.row}>
                <Text style={s.flag}>{flagOf(e?.iso2 ?? "")}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{e?.name ?? r.iso}</Text>
                  <Text style={s.sub}>
                    {g.emoji} {g.name} · {(r.shareA * 100).toFixed(1)}% / {(100 - r.shareA * 100).toFixed(1)}%
                  </Text>
                </View>
                <Text style={s.score}>{r.score.toFixed(1)}</Text>
              </View>
            );
          })}
        </View>
        <Pressable
          onPress={() => {
            playSfx("tap");
            primary.onPress();
          }}
          style={({ pressed }) => [s.primary, pressed && s.pressed]}
        >
          <Text style={s.primaryText}>{primary.label}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            playSfx("tap");
            secondary.onPress();
          }}
          style={({ pressed }) => [s.ghost, pressed && s.pressed]}
        >
          <Text style={s.ghostText}>{secondary.label}</Text>
        </Pressable>
        {onHome ? (
          <Pressable
            onPress={() => {
              playSfx("tap");
              onHome();
            }}
            style={({ pressed }) => [s.ghost, pressed && s.pressed]}
          >
            <Text style={s.ghostText}>Home</Text>
          </Pressable>
        ) : null}
        {foot ? <Text style={s.foot}>{foot}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.paper },
    content: { padding: 20, gap: 14, paddingTop: 36 },
    kicker: { color: t.gold, fontWeight: "900", letterSpacing: 1.5, textAlign: "center" },
    total: { color: t.ink, fontSize: 56, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
    totalOf: { color: t.muted, fontSize: 24 },
    subline: { color: t.gold, fontSize: 16, fontWeight: "800", textAlign: "center" },
    rows: { gap: 8, marginTop: 6 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: t.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: t.gridMajor,
    },
    flag: { fontSize: 28 },
    name: { color: t.ink, fontSize: 17, fontWeight: "800" },
    sub: { color: t.muted, fontSize: 12, marginTop: 2 },
    score: { color: t.gold, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
    primary: { backgroundColor: t.sideA, borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 8 },
    primaryText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
    ghost: { borderWidth: 2, borderColor: t.ink, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
    ghostText: { color: t.ink, fontSize: 16, fontWeight: "800" },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    foot: { color: t.muted, textAlign: "center", fontSize: 12 },
  });
