// FIND & SLICE: keep cutting the world map until only the target country is left.
// /find (hub) · /find?mode=daily · /find?mode=onslaught
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Canvas, DashPathEffect, FillType, Group, Path, Skia, type SkPath } from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Easing, useDerivedValue, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Storage from "expo-sqlite/kv-store";

import { playSfx } from "@/audio/sfx";
import { flagOf } from "@/data/packs";
import { puzzleNumber } from "@/game/daily";
import { cutPolygon, type Cut } from "@/game/geometry";
import type { Pt } from "@/game/types";
import { CountUp } from "@/ui/CountUp";
import { F } from "@/ui/fonts";
import { CropMarks } from "@/ui/menuArt";

const C = { bg: "#0C0F15", tile: "#141924", line: "#2A3142", ink: "#EEF1F7", muted: "#9099AD", orange: "#FF7A3D", teal: "#2EC4B6", gold: "#FFCB52", sand: "#E9DCC4", edge: "#9C7E52" };
const B = 1000; // base map units per normalised unit
const ROUNDS = 5;
const SURVIVE = 50;

// ---------------------------------------------------------------- data
type Feature = { id: string; name: string; iso2: string; continent: string; target: boolean; area: number; rings: number[][] };
type WorldMap = { width: number; height: number; land: number[][]; features: Feature[] };

let WORLD: WorldMap | null = null;
function world(): WorldMap {
  if (!WORLD) {
    const raw = require("../data/find/world.json");
    const s = B / raw.q;
    WORLD = { width: raw.width, height: raw.height, land: raw.land.map((r: number[]) => r.map((v) => v * s)), features: raw.features.map((f: Feature) => ({ ...f, rings: f.rings.map((r) => r.map((v) => v * s)) })) };
  }
  return WORLD;
}
const targets = () => world().features.filter((f) => f.target && f.area >= 1e-5);

function ringsPath(features: Feature[]): SkPath {
  const pb = Skia.PathBuilder.Make();
  for (const f of features) for (const r of f.rings) {
    pb.moveTo(r[0], r[1]);
    for (let i = 2; i < r.length; i += 2) pb.lineTo(r[i], r[i + 1]);
    pb.close();
  }
  return pb.setFillType(FillType.EvenOdd).build();
}

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(n: number, rand: () => number): Feature[] {
  const pool = targets().slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

const read = <T,>(k: string, d: T): T => {
  try {
    const v = Storage.getItemSync(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => Storage.setItemSync(k, JSON.stringify(v));

/** Grid-sampled score: how much of the kept land is the target, and how much of the target was kept. */
function scoreKept(kept: SkPath, target: SkPath, land: SkPath) {
  const t = target.computeTightBounds();
  const k = kept.computeTightBounds();
  const x0 = Math.min(t.x, Math.max(k.x, 0)), y0 = Math.min(t.y, Math.max(k.y, 0));
  const x1 = Math.max(t.x + t.width, Math.min(k.x + k.width, world().width * B));
  const y1 = Math.max(t.y + t.height, Math.min(k.y + k.height, world().height * B));
  const N = 110;
  const dx = (x1 - x0) / N, dy = (y1 - y0) / N;
  let inT = 0, hit = 0, over = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = x0 + (i + 0.5) * dx, y = y0 + (j + 0.5) * dy;
      const tt = target.contains(x, y);
      const kk = kept.contains(x, y);
      if (tt) {
        inT++;
        if (kk) hit++;
      } else if (kk && land.contains(x, y)) over++;
    }
  }
  const under = inT - hit;
  const iou = inT + over > 0 ? hit / (inT + over) : 0;
  return { score: Math.round(100 * iou * 10) / 10, overPct: inT ? (over / inT) * 100 : 0, underPct: inT ? (under / inT) * 100 : 0 };
}

const verdict = (s: number) => (s >= 90 ? "Surgical!" : s >= 70 ? "Clean cut" : s >= 45 ? "Rough cut" : "You are chopped!");

// ---------------------------------------------------------------- screen
export default function Find() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  if (mode === "daily") return <DailyFind />;
  if (mode === "onslaught") return <OnslaughtFind />;
  return <Hub />;
}

function Hub() {
  const no = puzzleNumber();
  const daily = read<number[]>(`find:daily:${no}`, []);
  const best = read<number>("find:onslaught:best", 0);
  const card = (title: string, sub: string, onPress: () => void) => (
    <Pressable onPress={() => { playSfx("tap"); onPress(); }} style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }]}>
      <CropMarks size={12} />
      <Text style={st.cardTitle}>{title}</Text>
      <Text style={st.muted}>{sub}</Text>
    </Pressable>
  );
  return (
    <SafeAreaView style={st.screen}>
      <Pressable hitSlop={12} onPress={() => router.back()}><Text style={st.back}>‹ Menu</Text></Pressable>
      <Text style={st.kicker}>FIND & SLICE</Text>
      <Text style={st.h1}>Cut the world down to one country</Text>
      <Text style={st.muted}>Keep slicing the map and drop the pieces you don't need. Press Finished when only the target is left.</Text>
      <View style={{ gap: 12, marginTop: 8 }}>
        {card(`Daily Find No. ${no}`, daily.length >= ROUNDS ? `Done · ${daily.reduce((a, b) => a + b, 0).toFixed(1)} / 500` : `${daily.length} of ${ROUNDS} found · same for everyone`, () => router.push("/find?mode=daily" as never))}
        {card("Onslaught", best ? `Best run · ${best} · keep scoring ${SURVIVE}+` : `Keep scoring ${SURVIVE}+ to survive`, () => router.push("/find?mode=onslaught" as never))}
      </View>
    </SafeAreaView>
  );
}

function DailyFind() {
  const no = puzzleNumber();
  const list = useMemo(() => pick(ROUNDS, seeded(no * 7919 + 17)), [no]);
  const [scores, setScores] = useState<number[]>(() => read<number[]>(`find:daily:${no}`, []));
  const round = scores.length;
  if (round >= ROUNDS) {
    return <End title={`DAILY FIND No. ${no}`} big={`${scores.reduce((a, b) => a + b, 0).toFixed(1)}`} of=" / 500" lines={list.map((f, i) => `${flagOf(f.iso2)}  ${f.name} · ${scores[i]?.toFixed(1)}`)} again={null} />;
  }
  return (
    <FindRound
      key={round}
      target={list[round]}
      label={`Daily Find · ${round + 1} / ${ROUNDS}`}
      onDone={(s) => {
        const next = [...scores, s];
        write(`find:daily:${no}`, next);
        setScores(next);
      }}
      nextLabel={round < ROUNDS - 1 ? "Next country →" : "See results →"}
    />
  );
}

function OnslaughtFind() {
  const [run, setRun] = useState(0);
  const list = useMemo(() => pick(targets().length, Math.random), [run]);
  const [scores, setScores] = useState<number[]>([]);
  const [over, setOver] = useState(false);
  const survived = scores.filter((s) => s >= SURVIVE).length;
  if (over) {
    const best = read<number>("find:onslaught:best", 0);
    return <End title="ONSLAUGHT · YOU ARE CHOPPED!" big={`${survived}`} of={survived === 1 ? " country" : " countries"} lines={[`Best run: ${best}`]} again={() => { setScores([]); setOver(false); setRun((r) => r + 1); }} />;
  }
  return (
    <FindRound
      key={`${run}-${scores.length}`}
      target={list[scores.length % list.length]}
      label={`Onslaught · ${survived} survived · score ${SURVIVE}+`}
      onDone={(s) => {
        const next = [...scores, s];
        const surv = next.filter((x) => x >= SURVIVE).length;
        if (surv > read<number>("find:onslaught:best", 0)) write("find:onslaught:best", surv);
        setScores(next);
        if (s < SURVIVE) setOver(true);
      }}
      nextLabel="Next country →"
      deferDone
    />
  );
}

function End({ title, big, of, lines, again }: { title: string; big: string; of: string; lines: string[]; again: (() => void) | null }) {
  return (
    <SafeAreaView style={[st.screen, { justifyContent: "center" }]}>
      <Text style={[st.kicker, { textAlign: "center" }]}>{title}</Text>
      <Text style={st.big}>{big}<Text style={st.bigOf}>{of}</Text></Text>
      {lines.map((l) => <Text key={l} style={[st.muted, { textAlign: "center", fontSize: 15 }]}>{l}</Text>)}
      {again && <Pressable onPress={() => { playSfx("tap"); again(); }} style={st.primary}><Text style={st.primaryText}>Try again</Text></Pressable>}
      <Pressable onPress={() => { playSfx("tap"); router.dismissAll(); }} style={st.ghost}><Text style={st.ghostText}>Home</Text></Pressable>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- one round
type Phase = "cut" | "choose" | "result";

function FindRound({ target, label, onDone, nextLabel, deferDone }: { target: Feature; label: string; onDone: (score: number) => void; nextLabel: string; deferDone?: boolean }) {
  const map = world();
  const land = useMemo(() => ringsPath([{ rings: map.land } as Feature]), [map]);
  const targetPath = useMemo(() => ringsPath([target]), [target]);
  const full = useMemo(() => Skia.PathBuilder.Make().addRect(Skia.XYWHRect(-40, -40, map.width * B + 80, map.height * B + 80)).build(), [map]);

  const [kept, setKept] = useState<SkPath>(full);
  const [pieces, setPieces] = useState<[SkPath, SkPath] | null>(null);
  const [dropped, setDropped] = useState<SkPath | null>(null);
  const [phase, setPhase] = useState<Phase>("cut");
  const [cuts, setCuts] = useState(0);
  const [history, setHistory] = useState<SkPath[]>([]);
  const [result, setResult] = useState<ReturnType<typeof scoreKept> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // view: screen = v + base * s
  const vs = useSharedValue(1);
  const vx = useSharedValue(0);
  const vy = useSharedValue(0);
  const fitAll = (w: number, h: number) => {
    const s = Math.min((w - 24) / (map.width * B), (h - 24) / (map.height * B));
    vs.value = s;
    vx.value = (w - map.width * B * s) / 2;
    vy.value = (h - map.height * B * s) / 2;
    return s;
  };
  const minS = useRef(0.01);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
    minS.current = fitAll(width, height) * 0.8; // also refits after the phone rotates
  };
  const viewT = useDerivedValue(() => [{ translateX: vx.value }, { translateY: vy.value }, { scale: vs.value }]);
  const reveal = useSharedValue(0);
  const revealFill = useDerivedValue(() => 0.45 * reveal.value);
  const line = useDerivedValue(() => 2.5 / vs.value);
  const drop = useSharedValue(0);
  const dropT = useDerivedValue(() => [{ translateY: drop.value * 300 }]);
  const dropO = useDerivedValue(() => 1 - drop.value);

  const stroke = useRef<Pt[]>([]);
  const strokePath = useSharedValue<SkPath>(Skia.Path.Make());
  const pinching = useRef(false);
  const g0 = useRef({ s: 1, x: 0, y: 0, fx: 0, fy: 0 });
  const toBase = (x: number, y: number): Pt => ({ x: (x - vx.value) / vs.value, y: (y - vy.value) / vs.value });

  const doCut = (pts: Pt[]) => {
    const cut: Cut = { kind: "curve", pts };
    const poly = cutPolygon(cut, 1e6);
    const half = Skia.PathBuilder.Make().addPoly(poly.map((p) => Skia.Point(p.x, p.y)), true).setFillType(FillType.EvenOdd).build();
    const a = Skia.Path.MakeFromOp(kept, half, 1 /* Intersect */);
    const b = Skia.Path.MakeFromOp(kept, half, 0 /* Difference */);
    const big = (p: SkPath | null) => !!p && !p.isEmpty() && p.computeTightBounds().width > 1;
    if (!big(a) || !big(b)) {
      playSfx("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    playSfx("slice");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setPieces([a!, b!]);
    setPhase("choose");
  };

  const choose = (x: number, y: number) => {
    if (!pieces) return;
    const p = toBase(x, y);
    const hit = pieces[0].contains(p.x, p.y) ? 0 : pieces[1].contains(p.x, p.y) ? 1 : -1;
    if (hit >= 0) removePiece(hit as 0 | 1);
  };

  /** 0 = the orange piece, 1 = the green (teal) piece. */
  const removePiece = (i: 0 | 1) => {
    if (!pieces) return;
    playSfx("tap");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDropped(pieces[i]);
    setHistory((h) => [...h, kept]);
    setKept(pieces[1 - i]);
    // zoom to the land that is left
    const left = Skia.Path.MakeFromOp(pieces[1 - i], land, 1 /* Intersect */);
    if (left && !left.isEmpty()) zoomTo(left.computeTightBounds(), 60);
    setPieces(null);
    setCuts((c) => c + 1);
    setPhase("cut");
    drop.value = 0;
    drop.value = withTiming(1, { duration: 500, easing: Easing.in(Easing.quad) });
    setTimeout(() => setDropped(null), 520);
  };

  const zoomTo = (b: { x: number; y: number; width: number; height: number }, pad: number) => {
    const s = Math.min((size.w - pad) / Math.max(b.width, 1), (size.h - pad) / Math.max(b.height, 1), minS.current * 30);
    vs.value = withTiming(s, { duration: 600 });
    vx.value = withTiming(size.w / 2 - (b.x + b.width / 2) * s, { duration: 600 });
    vy.value = withTiming(size.h / 2 - (b.y + b.height / 2) * s, { duration: 600 });
  };

  const undo = () => {
    playSfx("tap");
    if (phase === "choose") {
      setPieces(null);
      setPhase("cut");
      return;
    }
    const prev = history[history.length - 1];
    if (!prev) return;
    setKept(prev);
    setHistory((h) => h.slice(0, -1));
    setCuts((c) => Math.max(0, c - 1));
  };

  const finish = () => {
    const r = scoreKept(kept, targetPath, land);
    setResult(r);
    setPhase("result");
    playSfx("countup");
    setTimeout(() => {
      playSfx(r.score >= 70 ? "success" : r.score < 45 ? "error" : "tap");
      Haptics.notificationAsync(r.score >= 70 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    }, 1400);
    // zoom to the target so the player sees how close they were
    // Reveal: zoom into the real country, then fade its outline in.
    zoomTo(targetPath.computeTightBounds(), 80);
    reveal.value = 0;
    reveal.value = withDelay(550, withTiming(1, { duration: 700 }));
    if (!deferDone) onDoneLater.current = () => onDone(r.score);
    else onDoneLater.current = () => onDone(r.score);
  };
  const onDoneLater = useRef<() => void>(() => {});

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin((e) => {
      pinching.current = true;
      stroke.current = [];
      strokePath.value = Skia.Path.Make();
      g0.current = { s: vs.value, x: vx.value, y: vy.value, fx: e.focalX, fy: e.focalY };
    })
    .onUpdate((e) => {
      const g = g0.current;
      const s = Math.max(minS.current, Math.min(minS.current * 40, g.s * e.scale));
      vs.value = s;
      vx.value = e.focalX - (g.fx - g.x) * (s / g.s);
      vy.value = e.focalY - (g.fy - g.y) * (s / g.s);
    })
    .onFinalize(() => {
      setTimeout(() => (pinching.current = false), 50);
    });

  // One finger: a quick swipe cuts; press and hold (~0.25 s) then drag moves the map.
  const touch = useRef<{ mode: "pending" | "draw" | "move"; x: number; y: number; vx: number; vy: number; timer?: ReturnType<typeof setTimeout> }>({ mode: "pending", x: 0, y: 0, vx: 0, vy: 0 });
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => {
      const t = touch.current;
      clearTimeout(t.timer);
      touch.current = { mode: "pending", x: e.x, y: e.y, vx: vx.value, vy: vy.value };
      touch.current.timer = setTimeout(() => {
        if (touch.current.mode === "pending" && !pinching.current) {
          touch.current.mode = "move";
          Haptics.selectionAsync();
        }
      }, 250);
    })
    .onUpdate((e) => {
      const t = touch.current;
      if (pinching.current) return;
      if (t.mode === "move") {
        vx.value = t.vx + (e.x - t.x);
        vy.value = t.vy + (e.y - t.y);
        return;
      }
      if (t.mode === "pending") {
        if (Math.hypot(e.x - t.x, e.y - t.y) < 8 || phase !== "cut") return;
        clearTimeout(t.timer);
        t.mode = "draw";
        stroke.current = [toBase(t.x, t.y)];
      }
      if (phase !== "cut" || !stroke.current.length) return;
      const p = toBase(e.x, e.y);
      const last = stroke.current[stroke.current.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) * vs.value < 5) return;
      stroke.current.push(p);
      const pb = Skia.PathBuilder.Make();
      stroke.current.forEach((q, i) => (i ? pb.lineTo(q.x, q.y) : pb.moveTo(q.x, q.y)));
      strokePath.value = pb.build();
    })
    .onFinalize((e) => {
      const t = touch.current;
      clearTimeout(t.timer);
      const mode = t.mode;
      t.mode = "pending";
      if (pinching.current || mode === "move") return;
      if (phase === "choose") return choose(e.x, e.y);
      const pts = stroke.current;
      stroke.current = [];
      strokePath.value = Skia.Path.Make();
      if (phase === "cut" && pts.length >= 3) doCut(pts);
    });

  const { width: winW, height: winH } = useWindowDimensions();
  const wide = winW > winH;
  const help =
    phase === "cut" ? (cuts ? "Keep cutting, or press Finished." : "Swipe to slice · hold then drag to move · pinch to zoom")
    : phase === "choose" ? "Remove orange or green (or tap a piece)." : "";

  const headerEl = (
    <>
      <View style={st.top}>
        <Pressable hitSlop={12} onPress={() => router.back()}><Text style={st.back}>‹ Back</Text></Pressable>
        <Text style={st.label} numberOfLines={1}>{label}</Text>
      </View>
      <View style={st.banner}>
        <Text style={st.kicker}>FIND & CUT OUT</Text>
        <Text style={st.target} numberOfLines={1}>{flagOf(target.iso2)} {target.name}</Text>
        <Text style={[st.muted, { textAlign: "center" }]}>{help}</Text>
      </View>
    </>
  );

  const mapEl = (
      <View style={st.mapBox} onLayout={onLayout}>
        {size.w > 0 && (
          <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
            <Canvas style={{ flex: 1 }}>
              <Group transform={viewT}>
                <Path path={land} color={C.sand} opacity={0.12} />
                <Group clip={kept}>
                  <Path path={land} color={C.sand} />
                </Group>
                {pieces && (
                  <>
                    <Group clip={pieces[0]}><Path path={land} color={C.orange} opacity={0.45} /></Group>
                    <Group clip={pieces[1]}><Path path={land} color={C.teal} opacity={0.45} /></Group>
                    <Path path={pieces[0]} color={C.orange} style="stroke" strokeWidth={line} />
                    <Path path={pieces[1]} color={C.teal} style="stroke" strokeWidth={line} />
                  </>
                )}
                {!pieces && <Path path={kept} color={C.ink} style="stroke" strokeWidth={line} opacity={0.6}><DashPathEffect intervals={[10, 8]} /></Path>}
                {dropped && (
                  <Group transform={dropT} opacity={dropO}>
                    <Group clip={dropped}><Path path={land} color={C.orange} opacity={0.6} /></Group>
                  </Group>
                )}
                {phase === "result" && (
                  <>
                    <Path path={targetPath} color={C.gold} opacity={revealFill} />
                    <Path path={targetPath} color={C.gold} style="stroke" strokeWidth={line} opacity={reveal} />
                  </>
                )}
                <Path path={strokePath} color={C.ink} style="stroke" strokeWidth={line} strokeCap="round" strokeJoin="round" />
              </Group>
            </Canvas>
          </GestureDetector>
        )}
      </View>
  );

  const bottomEl = (
      <View style={st.bottom}>
        {phase === "choose" ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={() => removePiece(0)} style={({ pressed }) => [st.primary, { flex: 2, backgroundColor: C.orange }, pressed && { opacity: 0.85 }]}>
              <Text style={st.primaryText}>{wide ? "Orange" : "Remove orange"}</Text>
            </Pressable>
            <Pressable onPress={undo} style={({ pressed }) => [st.ghost, { flex: 1, marginTop: 0 }, pressed && { opacity: 0.85 }]}>
              <Text style={st.ghostText}>↶</Text>
            </Pressable>
            <Pressable onPress={() => removePiece(1)} style={({ pressed }) => [st.primary, { flex: 2, backgroundColor: C.teal }, pressed && { opacity: 0.85 }]}>
              <Text style={st.primaryText}>{wide ? "Green" : "Remove green"}</Text>
            </Pressable>
          </View>
        ) : phase === "cut" ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              disabled={history.length === 0}
              onPress={undo}
              style={({ pressed }) => [st.ghost, { flex: 1, marginTop: 0 }, history.length === 0 && { opacity: 0.35 }, pressed && { opacity: 0.85 }]}
            >
              <Text style={st.ghostText}>↶ Undo</Text>
            </Pressable>
            <Pressable
              disabled={cuts === 0 || phase !== "cut"}
              onPress={() => { playSfx("tap"); finish(); }}
              style={({ pressed }) => [st.primary, { flex: 2 }, (cuts === 0 || phase !== "cut") && { opacity: 0.35 }, pressed && { opacity: 0.85 }]}
            >
              <Text style={st.primaryText}>Finished ✓</Text>
            </Pressable>
          </View>
        ) : (
          result && (
            <>
              <View style={st.scoreRow}>
                <CountUp to={result.score} delay={200} duration={1200} style={st.score} />
                <Text style={st.bigOf}> / 100</Text>
                <Text style={st.verdict}>  {verdict(result.score)}</Text>
              </View>
              <Text style={[st.muted, { textAlign: "center" }]}>
                Over-cut {result.overPct.toFixed(0)}% · Under-cut {result.underPct.toFixed(0)}% · {cuts} cuts
              </Text>
              <Pressable onPress={() => { playSfx("tap"); onDoneLater.current(); }} style={st.primary}>
                <Text style={st.primaryText}>{deferDone && result.score < SURVIVE ? "Run over · results" : nextLabel}</Text>
              </Pressable>
            </>
          )
        )}
      </View>
  );

  return wide ? (
    <SafeAreaView style={[st.screen, { flexDirection: "row", paddingHorizontal: 8 }]} edges={["top", "bottom", "left", "right"]}>
      <View style={{ flex: 1, paddingVertical: 6 }}>{mapEl}</View>
      <View style={{ width: 280, justifyContent: "space-between", paddingVertical: 4, gap: 8 }}>
        <View style={{ gap: 8 }}>{headerEl}</View>
        {bottomEl}
      </View>
    </SafeAreaView>
  ) : (
    <SafeAreaView style={st.screen} edges={["top", "bottom", "left", "right"]}>
      {headerEl}
      {mapEl}
      {bottomEl}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16, gap: 8 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 6 },
  back: { fontFamily: F.bold, fontSize: 17, color: C.ink },
  label: { fontFamily: F.mono, fontSize: 11, color: C.muted, flexShrink: 1, marginLeft: 12 },
  banner: { alignItems: "center", gap: 2 },
  kicker: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.5, color: C.orange },
  target: { fontFamily: F.display, fontSize: 30, color: C.ink },
  h1: { fontFamily: F.display, fontSize: 28, color: C.ink },
  muted: { fontFamily: F.body, fontSize: 13, color: C.muted },
  mapBox: { flex: 1, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: "#0A0D12", overflow: "hidden" },
  bottom: { gap: 8, paddingBottom: 8 },
  primary: { backgroundColor: C.orange, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  primaryText: { fontFamily: F.bold, color: C.bg, fontSize: 18 },
  ghost: { borderWidth: 2, borderColor: C.ink, borderRadius: 16, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  ghostText: { fontFamily: F.bold, color: C.ink, fontSize: 16 },
  scoreRow: { flexDirection: "row", justifyContent: "center", alignItems: "baseline" },
  score: { fontFamily: F.display, fontSize: 40, color: C.gold, fontVariant: ["tabular-nums"] },
  bigOf: { fontFamily: F.bold, fontSize: 18, color: C.muted },
  verdict: { fontFamily: F.bold, fontSize: 18, color: C.ink },
  card: { backgroundColor: C.tile, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 20, gap: 4 },
  cardTitle: { fontFamily: F.display, fontSize: 22, color: C.ink },
  big: { fontFamily: F.display, fontSize: 64, color: C.ink, textAlign: "center" },
});
