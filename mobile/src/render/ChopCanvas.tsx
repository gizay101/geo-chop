import React, { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import {
  Canvas,
  Circle,
  DashPathEffect,
  FillType,
  Group,
  Line,
  Path,
  PathOp,
  Skia,
  type SkPath,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Easing, useDerivedValue, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import type { ChopLine, CountryPack, Pt } from "@/game/types";
import type { Theme } from "@/ui/theme";

const PAD = 28;
const HANDLE_R = 9;
const HANDLE_HIT = 36;
const MIN_LINE = 24;
const SEPARATION = 9;
const FAR = 4000;

type Fit = { s: number; ox: number; oy: number };

type Props = {
  country: CountryPack;
  theme: Theme;
  /** After a chop, the line is frozen and the split is shown. */
  chopped: ChopLine | null;
  perfect: ChopLine | null;
  /** Changing this value clears the line. */
  resetKey: number;
  onLineChange: (line: ChopLine | null) => void;
};

export function ChopCanvas({ country, theme, chopped, perfect, resetKey, onLineChange }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fit = useMemo<Fit>(() => {
    const s = Math.max(1, Math.min((size.w - 2 * PAD) / country.width, (size.h - 2 * PAD) / country.height));
    return { s, ox: (size.w - s * country.width) / 2, oy: (size.h - s * country.height) / 2 };
  }, [size, country]);

  const toScreen = (p: Pt): Pt => ({ x: fit.ox + p.x * fit.s, y: fit.oy + p.y * fit.s });
  const toNorm = (p: Pt): Pt => ({ x: (p.x - fit.ox) / fit.s, y: (p.y - fit.oy) / fit.s });

  const countryPath = useMemo(() => {
    const pb = Skia.PathBuilder.Make();
    for (const ring of country.rings) {
      pb.moveTo(fit.ox + ring[0] * fit.s, fit.oy + ring[1] * fit.s);
      for (let i = 2; i < ring.length; i += 2) pb.lineTo(fit.ox + ring[i] * fit.s, fit.oy + ring[i + 1] * fit.s);
      pb.close();
    }
    pb.setFillType(FillType.EvenOdd);
    return pb.build();
  }, [country, fit]);

  // ---- the line being aimed (screen coordinates) ----
  const ax = useSharedValue(0);
  const ay = useSharedValue(0);
  const bx = useSharedValue(0);
  const by = useSharedValue(0);
  const lineAlpha = useSharedValue(0);
  const line = useRef<{ a: Pt; b: Pt } | null>(null);
  const drag = useRef<{ mode: "a" | "b" | "new"; dx: number; dy: number } | null>(null);

  const setLine = (a: Pt, b: Pt) => {
    line.current = { a, b };
    ax.value = a.x; ay.value = a.y; bx.value = b.x; by.value = b.y;
    lineAlpha.value = 1;
  };
  const clearLine = () => {
    line.current = null;
    lineAlpha.value = 0;
  };

  useEffect(() => {
    clearLine();
    onLineChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, country.iso]);

  const clamp = (p: Pt): Pt => ({ x: Math.max(0, Math.min(size.w, p.x)), y: Math.max(0, Math.min(size.h, p.y)) });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .enabled(!chopped)
    .onBegin((e) => {
      const l = line.current;
      if (l && Math.hypot(e.x - l.a.x, e.y - l.a.y) < HANDLE_HIT) {
        drag.current = { mode: "a", dx: l.a.x - e.x, dy: l.a.y - e.y };
      } else if (l && Math.hypot(e.x - l.b.x, e.y - l.b.y) < HANDLE_HIT) {
        drag.current = { mode: "b", dx: l.b.x - e.x, dy: l.b.y - e.y };
      } else {
        drag.current = { mode: "new", dx: 0, dy: 0 };
        setLine({ x: e.x, y: e.y }, { x: e.x, y: e.y });
        Haptics.selectionAsync();
      }
    })
    .onUpdate((e) => {
      const d = drag.current;
      const l = line.current;
      if (!d || !l) return;
      const p = clamp({ x: e.x + d.dx, y: e.y + d.dy });
      if (d.mode === "a") setLine(p, l.b);
      else setLine(l.a, p);
    })
    .onFinalize(() => {
      const l = line.current;
      drag.current = null;
      if (!l || Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) < MIN_LINE) {
        clearLine();
        onLineChange(null);
        return;
      }
      onLineChange({ a: toNorm(l.a), b: toNorm(l.b) });
    });

  // ---- derived drawing values for the aim line ----
  const p1 = useDerivedValue(() => ({ x: ax.value, y: ay.value }));
  const p2 = useDerivedValue(() => ({ x: bx.value, y: by.value }));
  const far1 = useDerivedValue(() => {
    const dx = bx.value - ax.value, dy = by.value - ay.value;
    const len = Math.hypot(dx, dy) || 1;
    return { x: ax.value - (dx / len) * FAR, y: ay.value - (dy / len) * FAR };
  });
  const far2 = useDerivedValue(() => {
    const dx = bx.value - ax.value, dy = by.value - ay.value;
    const len = Math.hypot(dx, dy) || 1;
    return { x: bx.value + (dx / len) * FAR, y: by.value + (dy / len) * FAR };
  });

  // ---- the chop: split pieces + population dots ----
  const split = useMemo(() => {
    if (!chopped || size.w === 0) return null;
    const a = toScreen(chopped.a);
    const b = toScreen(chopped.b);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = { x: dx / len, y: dy / len };
    const n = { x: -d.y, y: d.x }; // side A normal (same convention as geometry.ts)

    const half = Skia.PathBuilder.Make()
      .addPoly(
        [
          Skia.Point(a.x - d.x * FAR, a.y - d.y * FAR),
          Skia.Point(a.x + d.x * FAR, a.y + d.y * FAR),
          Skia.Point(a.x + d.x * FAR + n.x * FAR, a.y + d.y * FAR + n.y * FAR),
          Skia.Point(a.x - d.x * FAR + n.x * FAR, a.y - d.y * FAR + n.y * FAR),
        ],
        true,
      )
      .build();
    const pieceA = Skia.Path.MakeFromOp(countryPath, half, PathOp.Intersect);
    const pieceB = Skia.Path.MakeFromOp(countryPath, half, PathOp.Difference);

    // Population dots, coloured by side.
    const pts = country.points;
    let maxW = 0;
    for (let i = 2; i < pts.length; i += 3) maxW = Math.max(maxW, pts[i]);
    const nc = { x: -(chopped.b.y - chopped.a.y), y: chopped.b.x - chopped.a.x };
    const c = nc.x * chopped.a.x + nc.y * chopped.a.y;
    const dotsA = Skia.PathBuilder.Make();
    const dotsB = Skia.PathBuilder.Make();
    const rScale = Math.min(6, Math.max(3, fit.s / 70));
    for (let i = 0; i < pts.length; i += 3) {
      const r = 0.6 + rScale * Math.sqrt(pts[i + 2] / maxW);
      const sx = fit.ox + pts[i] * fit.s, sy = fit.oy + pts[i + 1] * fit.s;
      (nc.x * pts[i] + nc.y * pts[i + 1] > c ? dotsA : dotsB).addCircle(sx, sy, r);
    }
    return { a, b, n, d, pieceA, pieceB, dotsA: dotsA.build(), dotsB: dotsB.build() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chopped, countryPath, fit, country]);

  const sep = useSharedValue(0);
  const reveal = useSharedValue(0);
  const flash = useSharedValue(0);
  const nx = useSharedValue(0);
  const ny = useSharedValue(0);

  useEffect(() => {
    if (split) {
      nx.value = split.n.x;
      ny.value = split.n.y;
      flash.value = 1;
      flash.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) });
      sep.value = 0;
      sep.value = withSpring(1, { damping: 9, stiffness: 140 });
      reveal.value = 0;
      reveal.value = withDelay(250, withTiming(1, { duration: 700 }));
    } else {
      sep.value = 0;
      reveal.value = 0;
      flash.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split]);

  const transformA = useDerivedValue(() => [
    { translateX: nx.value * SEPARATION * sep.value },
    { translateY: ny.value * SEPARATION * sep.value },
  ]);
  const transformB = useDerivedValue(() => [
    { translateX: -nx.value * SEPARATION * sep.value },
    { translateY: -ny.value * SEPARATION * sep.value },
  ]);
  const bladeWidth = useDerivedValue(() => 1 + 5 * flash.value);

  const perfectScreen = useMemo(() => {
    if (!perfect) return null;
    const a = toScreen(perfect.a), b = toScreen(perfect.b);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      p1: { x: a.x - (dx / len) * FAR, y: a.y - (dy / len) * FAR },
      p2: { x: b.x + (dx / len) * FAR, y: b.y + (dy / len) * FAR },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfect, fit]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {size.w > 0 && (
        <GestureDetector gesture={pan}>
          <Canvas style={styles.fill}>
            {!split ? (
              <Slab path={countryPath} theme={theme} />
            ) : (
              <>
                <Group transform={transformA}>
                  {split.pieceA && <Slab path={split.pieceA} theme={theme} tint={theme.sideA} />}
                  <Path path={split.dotsA} color={theme.sideA} opacity={reveal} />
                </Group>
                <Group transform={transformB}>
                  {split.pieceB && <Slab path={split.pieceB} theme={theme} tint={theme.sideB} />}
                  <Path path={split.dotsB} color={theme.sideB} opacity={reveal} />
                </Group>
                <Line
                  p1={{ x: split.a.x - split.d.x * FAR, y: split.a.y - split.d.y * FAR }}
                  p2={{ x: split.a.x + split.d.x * FAR, y: split.a.y + split.d.y * FAR }}
                  color={theme.blade}
                  style="stroke"
                  strokeWidth={bladeWidth}
                  opacity={flash}
                />
              </>
            )}

            {perfectScreen && (
              <Line p1={perfectScreen.p1} p2={perfectScreen.p2} color={theme.gold} style="stroke" strokeWidth={2.5}>
                <DashPathEffect intervals={[10, 6]} />
              </Line>
            )}

            {!chopped && (
              <Group opacity={lineAlpha}>
                <Line p1={far1} p2={far2} color={theme.ink} style="stroke" strokeWidth={1.5} opacity={0.35}>
                  <DashPathEffect intervals={[6, 6]} />
                </Line>
                <Line p1={p1} p2={p2} color={theme.ink} style="stroke" strokeWidth={3} strokeCap="round" />
                <Circle c={p1} r={HANDLE_R} color={theme.ink} />
                <Circle c={p1} r={HANDLE_R - 3} color={theme.paper} />
                <Circle c={p2} r={HANDLE_R} color={theme.ink} />
                <Circle c={p2} r={HANDLE_R - 3} color={theme.paper} />
              </Group>
            )}
          </Canvas>
        </GestureDetector>
      )}
    </View>
  );
}

/** The country "slab": a darker offset edge underneath, then the land on top. */
function Slab({ path, theme, tint }: { path: SkPath; theme: Theme; tint?: string }) {
  return (
    <Group>
      <Group transform={[{ translateY: 4 }]}>
        <Path path={path} color={theme.landEdge} />
      </Group>
      <Path path={path} color={theme.land} />
      {tint && <Path path={path} color={tint} opacity={0.12} />}
      <Path path={path} color={theme.landEdge} style="stroke" strokeWidth={1} />
    </Group>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
