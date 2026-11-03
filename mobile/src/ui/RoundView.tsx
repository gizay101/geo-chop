import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { playSfx } from "@/audio/sfx";
import { flagOf, METRIC_WORDS } from "@/data/packs";
import { cutCrossesLand, perfectCut, splitShareCut, type Cut } from "@/game/geometry";
import { gradeFor, scoreFor, type Grade } from "@/game/scoring";
import { FIREWORKS_MAX_ERROR, T } from "@/game/timeline";
import type { CountryPack } from "@/game/types";
import { ChopCanvas, type Tool } from "@/render/ChopCanvas";
import { CountUp } from "@/ui/CountUp";
import { useTheme, type Theme } from "@/ui/theme";

export type RoundResult = {
  iso: string;
  cut: Cut;
  shareA: number;
  error: number;
  score: number;
  grade: Grade;
};

type Props = {
  country: CountryPack;
  /** Straight line (default) or freehand curve. */
  tool?: Tool;
  /** e.g. "Daily #12 · Round 2 / 5". */
  label: string;
  /** Practice allows re-chopping; the Daily is one chop per round. */
  allowRetry: boolean;
  nextLabel: string;
  onBack: () => void;
  /** Called once per chop, as soon as the result is known. */
  onChopped?: (r: RoundResult) => void;
  onNext: () => void;
};

/** One round: aim, chop, 3D reveal, score. */
export function RoundView({ country, tool = "line", label, allowRetry, nextLabel, onBack, onChopped, onNext }: Props) {
  const theme = useTheme();
  const [cut, setCut] = useState<Cut | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [perfect, setPerfect] = useState<Cut | null>(null);
  const [done, setDone] = useState(false);
  const [showPerfect, setShowPerfect] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const canChop = !!cut && cutCrossesLand(country.rings, cut);
  const onCutChange = useCallback((c: Cut | null) => setCut(c), []);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const chop = () => {
    if (!cut || !canChop) return;
    const shareA = splitShareCut(country.points, cut);
    const error = Math.abs(shareA * 100 - 50);
    const r: RoundResult = { iso: country.iso, cut, shareA, error, score: scoreFor(error), grade: gradeFor(error) };
    playSfx("slice");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResult(r);
    onChopped?.(r);
    timers.current.push(
      setTimeout(() => playSfx("countup"), T.COUNT_START),
      setTimeout(() => {
        setDone(true);
        if (error <= FIREWORKS_MAX_ERROR) {
          playSfx("success");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }, T.SCORE),
    );
  };

  const retry = () => {
    clearTimers();
    playSfx("tap");
    setResult(null);
    setDone(false);
    setShowPerfect(false);
    setPerfect(null);
    setCut(null);
    setResetKey((k) => k + 1);
  };

  const s = makeStyles(theme);

  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      <View style={s.header}>
        <Pressable
          hitSlop={12}
          onPress={() => {
            playSfx("tap");
            onBack();
          }}
        >
          <Text style={s.back}>‹ Menu</Text>
        </Pressable>
        <Text style={s.label}>{label}</Text>
      </View>

      <View style={s.titleRow}>
        <Text style={s.country}>
          {flagOf(country.iso2)} {country.name}
        </Text>
        <Text style={s.goal}>{METRIC_WORDS[country.metric ?? "population"].goal}</Text>
        <Text style={s.note}>
          {[country.note, country.placeholder ? "placeholder data" : country.source?.split(",")[0]].filter(Boolean).join(" · ")}
        </Text>
      </View>

      <View style={s.canvas}>
        <ChopCanvas
          country={country}
          theme={theme}
          tool={tool}
          chopped={result?.cut ?? null}
          shareA={result?.shareA ?? null}
          perfect={showPerfect ? perfect : null}
          celebrate={!!result && result.error <= FIREWORKS_MAX_ERROR}
          resetKey={resetKey}
          onCutChange={onCutChange}
        />
      </View>

      {/* Fixed height so the canvas never resizes mid-animation. */}
      <View style={s.bottom}>
        {!result ? (
          <>
            <Text style={s.help}>
              {tool === "free"
                ? cut
                  ? canChop
                    ? "Happy with it? Chop! Or draw again."
                    : "Your cut has to cross the land."
                  : "Draw any cut with your finger."
                : cut
                  ? canChop
                    ? "Drag the dots to adjust, then chop."
                    : "Your line has to cross the land."
                  : "Drag across the map to draw your line."}
            </Text>
            <Pressable
              onPress={chop}
              disabled={!canChop}
              style={({ pressed }) => [s.chopBtn, !canChop && s.btnDisabled, pressed && s.pressed]}
            >
              <Text style={s.chopText}>CHOP 🔪</Text>
            </Pressable>
          </>
        ) : (
          <Animated.View entering={FadeIn.delay(T.COUNT_START - 150).duration(250)} style={s.resultBox}>
            <View style={s.splitRow}>
              <CountUp to={result.shareA * 100} suffix="%" delay={T.COUNT_START} duration={T.COUNT_DURATION} style={[s.pct, { color: theme.sideA }]} />
              <Text style={s.vs}>|</Text>
              <CountUp to={100 - result.shareA * 100} suffix="%" delay={T.COUNT_START} duration={T.COUNT_DURATION} style={[s.pct, { color: theme.sideB }]} />
            </View>
            <View style={s.scoreRow}>
              <CountUp to={result.score} delay={T.COUNT_START} duration={T.COUNT_DURATION} style={s.scoreNum} />
              <Text style={s.scoreOf}> / 100</Text>
              {done && (
                <Animated.Text entering={FadeIn.duration(300)} style={s.grade}>
                  {"  "}
                  {result.grade.emoji} {result.grade.name}
                  <Text style={s.muted}>  ({result.error.toFixed(1)}% off)</Text>
                </Animated.Text>
              )}
            </View>
            {done ? (
              <Animated.View entering={FadeIn.duration(300)} style={s.actions}>
                <View style={s.btnRow}>
                  <Pressable
                    onPress={() => {
                      playSfx("tap");
                      // Computed on demand: for freehand cuts this is a small search.
                      if (!perfect) setPerfect(perfectCut(country.points, result.cut));
                      setShowPerfect((v) => !v);
                    }}
                    style={({ pressed }) => [s.ghostBtn, pressed && s.pressed]}
                  >
                    <Text style={s.ghostText}>{showPerfect ? "Hide" : "Show"} perfect chop</Text>
                  </Pressable>
                  {allowRetry && (
                    <Pressable onPress={retry} style={({ pressed }) => [s.ghostBtn, pressed && s.pressed]}>
                      <Text style={s.ghostText}>Chop again</Text>
                    </Pressable>
                  )}
                </View>
                <Pressable
                  onPress={() => {
                    clearTimers();
                    playSfx("tap");
                    onNext();
                  }}
                  style={({ pressed }) => [s.chopBtn, pressed && s.pressed]}
                >
                  <Text style={s.chopText}>{nextLabel}</Text>
                </Pressable>
              </Animated.View>
            ) : null}
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.paper },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 8 },
    back: { fontSize: 17, fontWeight: "800", color: t.ink },
    label: { fontSize: 13, fontWeight: "700", color: t.muted },
    titleRow: { alignItems: "center", paddingTop: 10, paddingHorizontal: 16 },
    country: { fontSize: 28, fontWeight: "900", color: t.ink, textAlign: "center" },
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
    note: { marginTop: 6, fontSize: 11, color: t.muted, minHeight: 14 },
    canvas: { flex: 1 },
    bottom: { height: 214, paddingHorizontal: 20, paddingBottom: 12, gap: 10, justifyContent: "flex-end" },
    resultBox: { gap: 8 },
    actions: { gap: 10 },
    help: { textAlign: "center", color: t.muted, fontSize: 14 },
    chopBtn: { backgroundColor: t.ink, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
    chopText: { color: t.paper, fontSize: 20, fontWeight: "900", letterSpacing: 1 },
    btnDisabled: { opacity: 0.3 },
    pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
    splitRow: { flexDirection: "row", justifyContent: "center", alignItems: "baseline", gap: 14 },
    pct: { fontSize: 40, fontWeight: "900", fontVariant: ["tabular-nums"] },
    vs: { fontSize: 32, color: t.muted },
    scoreRow: { flexDirection: "row", justifyContent: "center", alignItems: "baseline", flexWrap: "wrap" },
    scoreNum: { fontSize: 22, fontWeight: "900", color: t.gold, fontVariant: ["tabular-nums"] },
    scoreOf: { fontSize: 16, fontWeight: "700", color: t.muted },
    grade: { fontSize: 16, fontWeight: "800", color: t.ink },
    muted: { color: t.muted, fontWeight: "500", fontSize: 13 },
    btnRow: { flexDirection: "row", gap: 10 },
    ghostBtn: { flex: 1, borderWidth: 2, borderColor: t.ink, borderRadius: 14, paddingVertical: 10, alignItems: "center" },
    ghostText: { color: t.ink, fontWeight: "800" },
  });
