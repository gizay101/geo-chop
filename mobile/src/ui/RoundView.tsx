import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { playSfx } from "@/audio/sfx";
import { flagOf, METRIC_WORDS } from "@/data/packs";
import { cutCrossesLand, isCleanFreehandCut, perfectCut, splitShareCut, type Cut } from "@/game/geometry";
import { gradeFor, scoreFor, type Grade } from "@/game/scoring";
import { FIREWORKS_MAX_ERROR, T } from "@/game/timeline";
import type { CountryPack } from "@/game/types";
import { ChopCanvas, type Tool } from "@/render/ChopCanvas";
import { saveLastChop } from "@/store/progress";
import { CountUp } from "@/ui/CountUp";
import { useTheme, type Theme } from "@/ui/theme";

/** Economy and billionaire rounds get a coloured heading so the player knows what they are splitting. */
const GOAL_TINT: Record<string, { backgroundColor: string; color: string } | undefined> = {
  gdp: { backgroundColor: "#FFCB52", color: "#0C0F15" },
  billionaires: { backgroundColor: "#B7A6FF", color: "#0C0F15" },
};

/** Hidden for now (2026-11-03); the perfect-cut logic stays. */
const SHOW_PERFECT_BUTTON = false;

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
  /** Freehand (default; the only tool in the game) or the old straight line. */
  tool?: Tool;
  /** e.g. "Daily #12 · Round 2 / 5". */
  label: string;
  /** Practice allows re-chopping; the Daily is one chop per round. */
  allowRetry: boolean;
  nextLabel: string;
  /** Optional: a label that depends on the result (Onslaught: next vs. run over). */
  nextLabelFor?: (r: RoundResult) => string;
  onBack: () => void;
  /** Called once per chop, as soon as the result is known. */
  onChopped?: (r: RoundResult) => void;
  onNext: () => void;
};

/** One round: aim, chop, 3D reveal, score. */
export function RoundView({ country, tool = "free", label, allowRetry, nextLabel, nextLabelFor, onBack, onChopped, onNext }: Props) {
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
  // Freehand: no button. A clean stroke (starts and ends off the land) chops the moment you let go.
  const freeHint = tool === "free" && cut && !isCleanFreehandCut(country.rings, cut);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const chop = (c: Cut | null = cut) => {
    if (!c || !cutCrossesLand(country.rings, c)) return;
    const cut = c;
    const shareA = splitShareCut(country.points, cut);
    const error = Math.abs(shareA * 100 - 50);
    const r: RoundResult = { iso: country.iso, cut, shareA, error, score: scoreFor(error), grade: gradeFor(error) };
    playSfx("slice");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResult(r);
    saveLastChop({ iso: country.iso, pack: country.pack, name: country.name, shareA, score: r.score });
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

  useEffect(() => {
    if (tool === "free" && cut && !result && isCleanFreehandCut(country.rings, cut)) chop(cut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cut, tool]);

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

  const win = useWindowDimensions();
  const s = makeStyles(theme, win.width > win.height);

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
        <Text style={[s.goal, GOAL_TINT[country.metric]]}>{METRIC_WORDS[country.metric ?? "population"].goal}</Text>
        <Text style={s.note}>{country.note ?? ""}</Text>
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
                ? freeHint
                  ? "Start and finish your cut off the land."
                  : "Slice right through the land in one stroke."
                : cut
                  ? canChop
                    ? "Drag the dots to adjust, then chop."
                    : "Your line has to cross the land."
                  : "Drag across the map to draw your line."}
            </Text>
            {tool === "line" && (
              <Pressable
                onPress={() => chop()}
                disabled={!canChop}
                style={({ pressed }) => [s.chopBtn, !canChop && s.btnDisabled, pressed && s.pressed]}
              >
                <Text style={s.chopText}>CHOP 🔪</Text>
              </Pressable>
            )}
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
                  {SHOW_PERFECT_BUTTON && (
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
                  )}
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
                  <Text style={s.chopText}>{result && nextLabelFor ? nextLabelFor(result) : nextLabel}</Text>
                </Pressable>
              </Animated.View>
            ) : null}
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme, w = false) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.paper },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: w ? 0 : 8 },
    back: { fontSize: 17, fontWeight: "800", color: t.ink },
    label: { fontSize: 13, fontWeight: "700", color: t.muted },
    titleRow: { alignItems: "center", paddingTop: w ? 0 : 10, marginTop: w ? -20 : 0, paddingHorizontal: 16 },
    country: { fontSize: w ? 20 : 28, fontWeight: "900", color: t.ink, textAlign: "center" },
    goal: {
      marginTop: w ? 2 : 6,
      fontSize: w ? 12 : 14,
      fontWeight: "700",
      color: t.ink,
      backgroundColor: t.card,
      paddingHorizontal: 12,
      paddingVertical: w ? 2 : 5,
      borderRadius: 999,
      overflow: "hidden",
    },
    note: { marginTop: w ? 0 : 6, fontSize: 11, color: t.muted, minHeight: w ? 0 : 14 },
    canvas: { flex: 1 },
    bottom: { height: w ? 150 : 214, paddingHorizontal: 20, paddingBottom: w ? 4 : 12, gap: w ? 4 : 10, justifyContent: "flex-end" },
    resultBox: { gap: w ? 2 : 8 },
    actions: { gap: w ? 4 : 10 },
    help: { textAlign: "center", color: t.muted, fontSize: w ? 12 : 14 },
    chopBtn: { backgroundColor: t.ink, borderRadius: 16, paddingVertical: w ? 8 : 16, alignItems: "center" },
    chopText: { color: t.paper, fontSize: w ? 16 : 20, fontWeight: "900", letterSpacing: 1 },
    btnDisabled: { opacity: 0.3 },
    pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
    splitRow: { flexDirection: "row", justifyContent: "center", alignItems: "baseline", gap: 14 },
    pct: { fontSize: w ? 26 : 40, fontWeight: "900", fontVariant: ["tabular-nums"] },
    vs: { fontSize: w ? 22 : 32, color: t.muted },
    scoreRow: { flexDirection: "row", justifyContent: "center", alignItems: "baseline", flexWrap: "wrap" },
    scoreNum: { fontSize: 22, fontWeight: "900", color: t.gold, fontVariant: ["tabular-nums"] },
    scoreOf: { fontSize: 16, fontWeight: "700", color: t.muted },
    grade: { fontSize: 16, fontWeight: "800", color: t.ink },
    muted: { color: t.muted, fontWeight: "500", fontSize: 13 },
    btnRow: { flexDirection: "row", gap: 10 },
    ghostBtn: { flex: 1, borderWidth: 2, borderColor: t.ink, borderRadius: 14, paddingVertical: w ? 5 : 10, alignItems: "center" },
    ghostText: { color: t.ink, fontWeight: "800" },
  });
