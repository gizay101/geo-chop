import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { playSfx } from "@/audio/sfx";
import { entryFor, flagOf, loadPack } from "@/data/packs";
import { dailyCountries, puzzleNumber, ROUNDS_PER_DAY } from "@/game/daily";
import { gradeFor } from "@/game/scoring";
import { getDaily, saveBest, saveDailyRound, type RoundRecord } from "@/store/progress";
import { RoundView } from "@/ui/RoundView";
import { useTheme, type Theme } from "@/ui/theme";

/** /play?mode=daily  or  /play?mode=single&iso=JPN */
export default function Play() {
  const { mode = "single", iso = "JPN" } = useLocalSearchParams<{ mode?: string; iso?: string }>();
  return mode === "daily" ? <Daily /> : <Single iso={iso} />;
}

function Single({ iso }: { iso: string }) {
  const country = useMemo(() => loadPack(iso), [iso]);
  const label = country.pack === "world" ? "The World" : country.pack === "islands" ? "Islands · practice" : "Countries · practice";
  return (
    <RoundView
      country={country}
      label={label}
      allowRetry
      nextLabel="Done ✓"
      onBack={() => router.back()}
      onChopped={(r) => saveBest(r.iso, r.score)}
      onNext={() => router.back()}
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

  if (round >= ROUNDS_PER_DAY) return <DailySummary no={no} records={records} />;

  const country = loadPack(isos[round]);
  return (
    <RoundView
      key={`daily-${no}-${round}`}
      country={country}
      label={`Daily #${no} · Round ${round + 1} / ${ROUNDS_PER_DAY}`}
      allowRetry={false}
      nextLabel={round < ROUNDS_PER_DAY - 1 ? "Next round →" : "See results →"}
      onBack={() => router.back()}
      onChopped={(r) => {
        const rec: RoundRecord = { iso: r.iso, shareA: r.shareA, error: r.error, score: r.score, line: r.line };
        saveDailyRound(no, round, rec, ROUNDS_PER_DAY);
        saveBest(r.iso, r.score);
        setRecords(getDaily(no));
      }}
      onNext={() => setRound((n) => n + 1)}
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

function DailySummary({ no, records }: { no: number; records: RoundRecord[] }) {
  const theme = useTheme();
  const s = makeStyles(theme);
  const total = records.reduce((sum, r) => sum + r.score, 0);

  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.kicker}>DAILY CHOP #{no}</Text>
        <Text style={s.total}>
          {total.toFixed(1)}
          <Text style={s.totalOf}> / {ROUNDS_PER_DAY * 100}</Text>
        </Text>
        <View style={s.rows}>
          {records.map((r, i) => {
            const e = entryFor(r.iso);
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
            Share.share({ message: shareText(no, records) });
          }}
          style={({ pressed }) => [s.primary, pressed && s.pressed]}
        >
          <Text style={s.primaryText}>Share result</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            playSfx("tap");
            router.back();
          }}
          style={({ pressed }) => [s.ghost, pressed && s.pressed]}
        >
          <Text style={s.ghostText}>Back to menu</Text>
        </Pressable>
        <Text style={s.foot}>New puzzle at midnight.</Text>
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
