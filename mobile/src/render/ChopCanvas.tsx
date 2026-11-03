import React, { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import {
  Canvas,
  Circle,
  createPicture,
  DashPathEffect,
  FillType,
  Group,
  Line,
  Path,
  PathOp,
  Picture,
  Skia,
  type SkPath,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import type { ChopLine, CountryPack, Pt } from "@/game/types";
import type { Theme } from "@/ui/theme";
import {
  buildColumns,
  type Cam,
  camAt,
  type CamFinal,
  camTransform,
  drawColumns,
  finalCamera,
  type Fit,
  project,
  SEPARATION,
  SLAB_THICKNESS,
} from "./columns3d";

const PAD = 28;
const HANDLE_R = 9;
const HANDLE_HIT = 36;
const MIN_LINE = 24;
const FAR = 4000;
const LABEL_W = 84;

type Props = {
  country: CountryPack;
  theme: Theme;
  /** After a chop, the line is frozen and the 3D split is shown. */
  chopped: ChopLine | null;
  /** Fraction of population on side A (for the floating labels). */
  shareA: number | null;
  perfect: ChopLine | null;
  /** Changing this value clears the line. */
  resetKey: number;
  onLineChange: (line: ChopLine | null) => void;
};

const IDENTITY_FINAL: CamFinal = { cx: 0, cy: 0, theta: 0, phi: 0, k: 1, ox: 0, oy: 0 };

export function ChopCanvas({ country, theme, chopped, shareA, perfect, resetKey, onLineChange }: Props) {
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

  // ---------------- aiming ----------------
  const ax = useSharedValue(0);
  const ay = useSharedValue(0);
  const bx = useSharedValue(0);
  const by = useSharedValue(0);
  const lineAlpha = useSharedValue(0);
  const line = useRef<{ a: Pt; b: Pt } | null>(null);
  const drag = useRef<{ mode: "a" | "b" | "new" | "orbit"; dx: number; dy: number } | null>(null);

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

  // ---------------- chop animation state ----------------
  const flash = useSharedValue(0);
  const sep = useSharedValue(0);
  const tilt = useSharedValue(0);
  const rise = useSharedValue(0);
  const orbit = useSharedValue(0);
  const pitch = useSharedValue(0);
  const orbitStart = useRef({ orbit: 0, pitch: 0 });
  const viewRef = useRef({ orbit: 0, pitch: 0 });

  const hmax = Math.max(40, 0.2 * Math.min(size.w, size.h));

  const scene = useMemo(() => {
    if (!chopped || size.w === 0) return null;
    const a = toScreen(chopped.a);
    const b = toScreen(chopped.b);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = { x: dx / len, y: dy / len };
    const n = { x: -d.y, y: d.x }; // side-A normal (same convention as geometry.ts)

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
    const final = finalCamera(country, fit, size.w, size.h, hmax);
    const model = buildColumns(country, fit, chopped, theme.sideA, theme.sideB, hmax);
    // Draw the piece that ends up further from the viewer first.
    const depthOf = (sign: number) => Math.sin(final.theta) * n.x * sign + Math.cos(final.theta) * n.y * sign;
    const aIsBack = depthOf(1) < depthOf(-1);
    return { a, d, n, pieceA, pieceB, final, model, aIsBack };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chopped, countryPath, fit, country, theme, hmax]);

  useEffect(() => {
    orbit.value = 0;
    pitch.value = 0;
    viewRef.current = { orbit: 0, pitch: 0 };
    if (scene) {
      flash.value = 1;
      flash.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) });
      sep.value = 0;
      sep.value = withSpring(1, { damping: 10, stiffness: 120 });
      tilt.value = 0;
      tilt.value = withDelay(250, withTiming(1, { duration: 950, easing: Easing.inOut(Easing.cubic) }));
      rise.value = 0;
      rise.value = withDelay(850, withTiming(1, { duration: 1400, easing: Easing.linear }));
      const t = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 900);
      return () => clearTimeout(t);
    }
    flash.value = 0; sep.value = 0; tilt.value = 0; rise.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  const finalCam = scene?.final ?? IDENTITY_FINAL;
  const cam = useDerivedValue<Cam>(() => camAt(finalCam, tilt.value, orbit.value, pitch.value), [finalCam]);
  const camT = useDerivedValue(() => camTransform(cam.value));

  const model = scene?.model ?? null;
  const picture = useDerivedValue(
    () =>
      createPicture(
        (canvas) => {
          if (model) drawColumns(canvas, model, cam.value, rise.value, sep.value);
        },
        { width: Math.max(1, size.w), height: Math.max(1, size.h) },
      ),
    [model, size.w, size.h],
  );

  // ---------------- gestures ----------------
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      if (chopped) {
        drag.current = { mode: "orbit", dx: 0, dy: 0 };
        orbitStart.current = { ...viewRef.current };
        return;
      }
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
      if (!d) return;
      if (d.mode === "orbit") {
        const o = orbitStart.current.orbit + e.translationX * 0.008;
        const p = Math.max(-0.6, Math.min(0.3, orbitStart.current.pitch - e.translationY * 0.004));
        viewRef.current = { orbit: o, pitch: p };
        orbit.value = o;
        pitch.value = p;
        return;
      }
      const l = line.current;
      if (!l) return;
      const p = clamp({ x: e.x + d.dx, y: e.y + d.dy });
      if (d.mode === "a") setLine(p, l.b);
      else setLine(l.a, p);
    })
    .onFinalize(() => {
      const d = drag.current;
      drag.current = null;
      if (!d || d.mode === "orbit") return;
      const l = line.current;
      if (!l || Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) < MIN_LINE) {
        clearLine();
        onLineChange(null);
        return;
      }
      onLineChange({ a: toNorm(l.a), b: toNorm(l.b) });
    });

  // ---------------- derived drawing values for the aim line ----------------
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
  const bladeWidth = useDerivedValue(() => 1 + 5 * flash.value);

  const perfectGround = useMemo(() => {
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

  const pieces = scene
    ? [
        { path: scene.pieceA, tint: theme.sideA, sign: 1 },
        { path: scene.pieceB, tint: theme.sideB, sign: -1 },
      ]
    : [];
  if (scene && !scene.aIsBack) pieces.reverse();

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {size.w > 0 && (
        <GestureDetector gesture={pan}>
          <View style={styles.fill}>
            <Canvas style={styles.fill}>
              {!scene ? (
                <FlatSlab path={countryPath} theme={theme} />
              ) : (
                <>
                  {pieces.map(
                    (p, i) =>
                      p.path && (
                        <SlabPiece
                          key={i}
                          path={p.path}
                          tint={p.tint}
                          theme={theme}
                          cam={cam}
                          camT={camT}
                          sep={sep}
                          nx={scene.n.x * p.sign}
                          ny={scene.n.y * p.sign}
                        />
                      ),
                  )}
                  <Group transform={camT}>
                    <Line
                      p1={{ x: scene.a.x - scene.d.x * FAR, y: scene.a.y - scene.d.y * FAR }}
                      p2={{ x: scene.a.x + scene.d.x * FAR, y: scene.a.y + scene.d.y * FAR }}
                      color={theme.blade}
                      style="stroke"
                      strokeWidth={bladeWidth}
                      opacity={flash}
                    />
                    {perfectGround && (
                      <Line p1={perfectGround.p1} p2={perfectGround.p2} color={theme.gold} style="stroke" strokeWidth={2.5}>
                        <DashPathEffect intervals={[10, 6]} />
                      </Line>
                    )}
                  </Group>
                  <Picture picture={picture} />
                </>
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

            {scene && shareA !== null && (
              <>
                <FloatingLabel
                  text={`${(shareA * 100).toFixed(1)}%`}
                  color={theme.sideA}
                  anchor={scene.model.labelA}
                  nx={scene.n.x}
                  ny={scene.n.y}
                  cam={cam}
                  sep={sep}
                  rise={rise}
                  lift={hmax * 0.55}
                />
                <FloatingLabel
                  text={`${(100 - shareA * 100).toFixed(1)}%`}
                  color={theme.sideB}
                  anchor={scene.model.labelB}
                  nx={-scene.n.x}
                  ny={-scene.n.y}
                  cam={cam}
                  sep={sep}
                  rise={rise}
                  lift={hmax * 0.55}
                />
              </>
            )}
          </View>
        </GestureDetector>
      )}
    </View>
  );
}

/** The flat country before the chop: a darker offset edge underneath, then the land on top. */
function FlatSlab({ path, theme }: { path: SkPath; theme: Theme }) {
  return (
    <Group>
      <Group transform={[{ translateY: 4 }]}>
        <Path path={path} color={theme.landEdge} />
      </Group>
      <Path path={path} color={theme.land} />
      <Path path={path} color={theme.landEdge} style="stroke" strokeWidth={1} />
    </Group>
  );
}

type PieceProps = {
  path: SkPath;
  tint: string;
  theme: Theme;
  cam: SharedValue<Cam>;
  camT: SharedValue<ReturnType<typeof camTransform>>;
  sep: SharedValue<number>;
  nx: number;
  ny: number;
};

/** One half of the country as a thick slab, moved through the 3D camera. */
function SlabPiece({ path, tint, theme, cam, camT, sep, nx, ny }: PieceProps) {
  const sepT = useDerivedValue(
    () => [{ translateX: nx * SEPARATION * sep.value }, { translateY: ny * SEPARATION * sep.value }],
    [nx, ny],
  );
  // Three stacked copies of the edge make the slab look solid at any tilt.
  const e1 = useDerivedValue(() => [{ translateY: 3 + 0.34 * SLAB_THICKNESS * cam.value.k * Math.sin(cam.value.phi) }]);
  const e2 = useDerivedValue(() => [{ translateY: 3 + 0.67 * SLAB_THICKNESS * cam.value.k * Math.sin(cam.value.phi) }]);
  const e3 = useDerivedValue(() => [{ translateY: 3 + SLAB_THICKNESS * cam.value.k * Math.sin(cam.value.phi) }]);
  return (
    <Group>
      {[e3, e2, e1].map((e, i) => (
        <Group key={i} transform={e}>
          <Group transform={camT}>
            <Group transform={sepT}>
              <Path path={path} color={theme.landEdge} />
            </Group>
          </Group>
        </Group>
      ))}
      <Group transform={camT}>
        <Group transform={sepT}>
          <Path path={path} color={theme.land} />
          <Path path={path} color={tint} opacity={0.14} />
          <Path path={path} color={theme.landEdge} style="stroke" strokeWidth={1} />
        </Group>
      </Group>
    </Group>
  );
}

type LabelProps = {
  text: string;
  color: string;
  anchor: Pt;
  nx: number;
  ny: number;
  cam: SharedValue<Cam>;
  sep: SharedValue<number>;
  rise: SharedValue<number>;
  lift: number;
};

/** A percentage chip that floats above one piece and follows the camera. */
function FloatingLabel({ text, color, anchor, nx, ny, cam, sep, rise, lift }: LabelProps) {
  const style = useAnimatedStyle(() => {
    const p = project(
      cam.value,
      anchor.x + nx * SEPARATION * sep.value,
      anchor.y + ny * SEPARATION * sep.value,
      lift,
    );
    const t = Math.max(0, Math.min(1, (rise.value - 0.35) / 0.4));
    return {
      opacity: t,
      transform: [{ translateX: p.x - LABEL_W / 2 }, { translateY: p.y - 18 - 10 * (1 - t) }, { scale: 0.8 + 0.2 * t }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.label, { backgroundColor: color }, style]}>
      <Text style={styles.labelText}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  label: {
    position: "absolute",
    left: 0,
    top: 0,
    width: LABEL_W,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  labelText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16, fontVariant: ["tabular-nums"] },
});
