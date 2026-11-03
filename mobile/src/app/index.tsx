import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { COUNTRIES } from "@/data/countries";
import { lineCrossesLand, perfectLine, splitShare } from "@/game/geometry";
import { gradeFor, scoreFor, type Grade } from "@/game/scoring";
import type { ChopLine } from "@/game/types";
import { ChopCanvas } from "@/render/ChopCanvas";
import { useTheme, type Theme } from "@/ui/theme";

type Result = {
  line: ChopLine;
  shareA: number;
  error: number;
  score: number;
  grade: Grade;
  perfect: ChopLine;
};

/** Prototype round screen: one country, one chop. */
export default function RoundScreen() {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [line, setLine] = useState<ChopLine | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showPerfect, setShowPerfect] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const country = COUNTRIES[index];
  const canChop = !!line && lineCrossesLand(country.rings, line);

  const onLineChange = useCallback((l: ChopLine | null) => setLine(l), []);

  const chop = () => {
    if (!line || !canChop) return;
    const shareA = splitShare(country.points, line);
    const error = Math.abs(shareA * 100 - 50);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setResult({
      line,
      shareA,
      error,
      score: scoreFor(error),
      grade: gradeFor(error),
      perfect: perfectLine(country.points, line),
    });
    setTimeout(() => {
      Haptics.notificationAsync(
        error < 2.5 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );
    }, 900);
  };

  const reset = (nextIndex = index) => {
    setResult(null);
    setShowPerfect(false);
    setLine(null);
    setIndex(nextIndex);
    setResetKey((k) => k + 1);
  };

  const s = makeStyles(theme);

  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      <View style={s.header}>
        <Text style={s.logo}>
          GEO <Text style={{ color: theme.sideA }}>CH</Text>
          <Text style={{ color: theme.sideB }}>OP</Text>
        </Text>
        <Text style={s.round}>
          {index + 1} / {COUNTRIES.length}
        </Text>
      </View>

      <View style={s.titleRow}>
        <Text style={s.country}>{country.name}</Text>
        <Text style={s.goal}>Chop the population in half</Text>
        {country.placeholder && <Text style={s.placeholder}>Prototype · placeholder population data</Text>}
      </View>

      <View style={s.canvas}>
        <ChopCanvas
          country={country}
          theme={theme}
          chopped={result?.line ?? null}
          perfect={showPerfect ? result?.perfect ?? null : null}
          resetKey={resetKey}
          onLineChange={onLineChange}
        />
      </View>

      {!result ? (
        <View style={s.bottom}>
          <Text style={s.help}>
            {line ? (canChop ? "Drag the dots to adjust, then chop." : "Your line has to cross the country.") : "Drag across the map to draw your line."}
          </Text>
          <Pressable
            onPress={chop}
            disabled={!canChop}
            style={({ pressed }) => [s.chopBtn, !canChop && s.btnDisabled, pressed && s.pressed]}
          >
            <Text style={s.chopText}>CHOP 🔪</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.bottom}>
          <View style={s.splitRow}>
            <Text style={[s.pct, { color: theme.sideA }]}>{(result.shareA * 100).toFixed(1)}%</Text>
            <Text style={s.vs}>|</Text>
            <Text style={[s.pct, { color: theme.sideB }]}>{(100 - result.shareA * 100).toFixed(1)}%</Text>
          </View>
          <Text style={s.score}>
            {result.grade.emoji} {result.grade.name} · {result.score} pts
            <Text style={s.muted}>  ({result.error.toFixed(1)} off)</Text>
          </Text>
          <View style={s.btnRow}>
            <Pressable onPress={() => setShowPerfect((v) => !v)} style={({ pressed }) => [s.ghostBtn, pressed && s.pressed]}>
              <Text style={s.ghostText}>{showPerfect ? "Hide" : "Show"} perfect chop</Text>
            </Pressable>
            <Pressable onPress={() => reset()} style={({ pressed }) => [s.ghostBtn, pressed && s.pressed]}>
              <Text style={s.ghostText}>Chop again</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => reset((index + 1) % COUNTRIES.length)}
            style={({ pressed }) => [s.chopBtn, pressed && s.pressed]}
          >
            <Text style={s.chopText}>Next country →</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.paper },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 8 },
    logo: { fontSize: 22, fontWeight: "900", letterSpacing: 1, color: t.ink },
    round: { fontSize: 14, fontWeight: "700", color: t.muted },
    titleRow: { alignItems: "center", paddingTop: 14 },
    country: { fontSize: 30, fontWeight: "900", color: t.ink },
    goal: {
      marginTop: 6,
      fontSize: 14,
      fontWeight: "700",
      color: t.ink,
      backgroundColor: t.card,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      overflow: "hidden",
    },
    placeholder: { marginTop: 6, fontSize: 11, color: t.muted },
    canvas: { flex: 1 },
    bottom: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
    help: { textAlign: "center", color: t.muted, fontSize: 14 },
    chopBtn: { backgroundColor: t.ink, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
    chopText: { color: t.paper, fontSize: 20, fontWeight: "900", letterSpacing: 1 },
    btnDisabled: { opacity: 0.3 },
    pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
    splitRow: { flexDirection: "row", justifyContent: "center", alignItems: "baseline", gap: 14 },
    pct: { fontSize: 40, fontWeight: "900", fontVariant: ["tabular-nums"] },
    vs: { fontSize: 32, color: t.muted },
    score: { textAlign: "center", fontSize: 18, fontWeight: "800", color: t.ink },
    muted: { color: t.muted, fontWeight: "500", fontSize: 14 },
    btnRow: { flexDirection: "row", gap: 10 },
    ghostBtn: { flex: 1, borderWidth: 2, borderColor: t.ink, borderRadius: 14, paddingVertical: 10, alignItems: "center" },
    ghostText: { color: t.ink, fontWeight: "800" },
  });
