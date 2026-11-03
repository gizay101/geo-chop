import React, { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import {
  BlurMask,
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
  Rect,
  RoundedRect,
  Skia,
  type SkPath,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { playSfx } from "@/audio/sfx";
import { cutNormal, cutPolygon, extendedCurve, isCleanFreehandCut, type Cut } from "@/game/geometry";
import { T } from "@/game/timeline";
import type { CountryPack, Pt } from "@/game/types";
import { CountUp } from "@/ui/CountUp";
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
import { drawSparks, makeSparks, type Spark } from "./fireworks";

const PAD = 28;
const HANDLE_R = 9;
const HANDLE_HIT = 36;
const MIN_LINE = 24;
const FAR = 4000;
const LABEL_W = 84;
const GRID = 32;
const GRID_EXTENT = 2400;
/** Freehand: minimum spacing between recorded stroke points (px) and maximum points kept. */
const STROKE_STEP = 5;
const STROKE_MAX = 400;
/** Ink per cut: this many times the country's on-screen diagonal, plus room to start/end off the land. */
const INK_PER_DIAGONAL = 1.5;
const INK_MARGIN = 80;
/** The World is very wide on a phone: start zoomed in. Players can pinch between 1x and MAX_ZOOM. */
const WORLD_ZOOM = 1.7;
const MAX_ZOOM = 6;

export type Tool = "line" | "free";

type Props = {
  country: CountryPack;
  theme: Theme;
  /** Straight line with draggable ends, or a freehand stroke. */
  tool: Tool;
  /** After a chop, the cut is frozen and the 3D split plays. */
  chopped: Cut | null;
  /** Fraction of population on side A (for the floating labels). */
  shareA: number | null;
  perfect: Cut | null;
  /** Fire a small fireworks show at T.SCORE. */
  celebrate: boolean;
  /** Changing this value clears the cut. */
  resetKey: number;
  onCutChange: (cut: Cut | null) => void;
};

const IDENTITY_FINAL: CamFinal = { cx: 0, cy: 0, theta: 0, phi: 0, k: 1, ox: 0, oy: 0 };

function polylinePath(pts: Pt[]): SkPath {
  const pb = Skia.PathBuilder.Make();
  pts.forEach((p, i) => (i === 0 ? pb.moveTo(p.x, p.y) : pb.lineTo(p.x, p.y)));
  return pb.build();
}

export function ChopCanvas({ country, theme, tool, chopped, shareA, perfect, celebrate, resetKey, onCutChange }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const baseFit = useMemo<Fit>(() => {
    const s = Math.max(1, Math.min((size.w - 2 * PAD) / country.width, (size.h - 2 * PAD) / country.height));
    return { s, ox: (size.w - s * country.width) / 2, oy: (size.h - s * country.height) / 2 };
  }, [size, country]);

  // Pinch-zoom / two-finger pan while aiming. The gesture moves a live transform; on release it is
  // committed into `view`, which every drawing and the cut maths use.
  const [view, setView] = useState<Fit | null>(null);
  useEffect(() => {
    if (country.pack !== "world" || size.w === 0) {
      setView(null);
      return;
    }
    const cx = size.w / 2, cy = size.h / 2;
    setView({ s: baseFit.s * WORLD_ZOOM, ox: cx + (baseFit.ox - cx) * WORLD_ZOOM, oy: cy + (baseFit.oy - cy) * WORLD_ZOOM });
  }, [baseFit, country.pack, size.w, size.h]);
  const fit = view ?? baseFit;

  const gz = useSharedValue(1);
  const gtx = useSharedValue(0);
  const gty = useSharedValue(0);
  const gfx = useSharedValue(0);
  const gfy = useSharedValue(0);
  const liveT = useDerivedValue(() => [
    { translateX: gfx.value + gtx.value },
    { translateY: gfy.value + gty.value },
    { scale: gz.value },
    { translateX: -gfx.value },
    { translateY: -gfy.value },
  ]);
  useEffect(() => {
    gz.value = 1;
    gtx.value = 0;
    gty.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const pinching = useRef(false);
  const clampZoom = (g: number) => Math.max(baseFit.s / fit.s, Math.min((MAX_ZOOM * baseFit.s) / fit.s, g));
  const commitView = () => {
    if (!pinching.current) return;
    pinching.current = false;
    const g = clampZoom(gz.value);
    setView({
      s: fit.s * g,
      ox: (fit.ox - gfx.value) * g + gfx.value + gtx.value,
      oy: (fit.oy - gfy.value) * g + gfy.value + gty.value,
    });
  };

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

  // Background grid in ground space, so it tilts and spins with the map.
  const grid = useMemo(() => {
    const minor = Skia.PathBuilder.Make();
    const major = Skia.PathBuilder.Make();
    const cx = size.w / 2, cy = size.h / 2;
    for (let i = -GRID_EXTENT; i <= GRID_EXTENT; i += GRID) {
      const pb = Math.round(i / GRID) % 4 === 0 ? major : minor;
      pb.moveTo(cx + i, cy - GRID_EXTENT).lineTo(cx + i, cy + GRID_EXTENT);
      pb.moveTo(cx - GRID_EXTENT, cy + i).lineTo(cx + GRID_EXTENT, cy + i);
    }
    return { minor: minor.build(), major: major.build() };
  }, [size]);

  // ---------------- aiming: straight line ----------------
  const ax = useSharedValue(0);
  const ay = useSharedValue(0);
  const bx = useSharedValue(0);
  const by = useSharedValue(0);
  const lineAlpha = useSharedValue(0);
  const line = useRef<{ a: Pt; b: Pt } | null>(null);
  const drag = useRef<{ mode: "a" | "b" | "new" | "stroke" | "orbit"; dx: number; dy: number } | null>(null);

  const setLine = (a: Pt, b: Pt) => {
    line.current = { a, b };
    ax.value = a.x; ay.value = a.y; bx.value = b.x; by.value = b.y;
    lineAlpha.value = 1;
  };

  // ---------------- aiming: freehand stroke ----------------
  const stroke = useRef<Pt[]>([]);
  const nope = useSharedValue(0);
  const strokeLen = useRef(0);
  const inkLeft = useSharedValue(1);
  const inkBudget = INK_PER_DIAGONAL * Math.hypot(country.width, country.height) * fit.s + INK_MARGIN;
  const strokePath = useSharedValue<SkPath>(Skia.Path.Make());
  const strokeExt = useSharedValue<SkPath>(Skia.Path.Make());

  const setStroke = (pts: Pt[], withExtensions: boolean) => {
    stroke.current = pts;
    strokePath.value = polylinePath(pts);
    if (withExtensions && pts.length > 1) {
      const ext = extendedCurve(pts, FAR);
      strokeExt.value = Skia.PathBuilder.Make()
        .moveTo(ext[0].x, ext[0].y).lineTo(pts[0].x, pts[0].y)
        .moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y).lineTo(ext[ext.length - 1].x, ext[ext.length - 1].y)
        .build();
    } else {
      strokeExt.value = Skia.Path.Make();
    }
    lineAlpha.value = 1;
  };

  const clearAim = () => {
    line.current = null;
    stroke.current = [];
    strokePath.value = Skia.Path.Make();
    strokeExt.value = Skia.Path.Make();
    lineAlpha.value = 0;
  };

  useEffect(() => {
    clearAim();
    onCutChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, country.iso, tool]);

  const clamp = (p: Pt): Pt => ({ x: Math.max(0, Math.min(size.w, p.x)), y: Math.max(0, Math.min(size.h, p.y)) });

  // ---------------- chop animation state ----------------
  const sweep = useSharedValue(0);
  const flash = useSharedValue(0);
  const shake = useSharedValue(0);
  const sep = useSharedValue(0);
  const tilt = useSharedValue(0);
  const rise = useSharedValue(0);
  const orbit = useSharedValue(0);
  const pitch = useSharedValue(0);
  const fireT = useSharedValue(0);
  const orbitStart = useRef({ orbit: 0, pitch: 0 });
  const spinning = useRef(false);

  const hmax = Math.max(40, 0.2 * Math.min(size.w, size.h));

  const scene = useMemo(() => {
    if (!chopped || size.w === 0) return null;
    // Side-A region as a Skia path, then boolean ops give the two pieces.
    const poly = cutPolygon(chopped, FAR / fit.s).map(toScreen);
    const half = Skia.PathBuilder.Make()
      .addPoly(poly.map((p) => Skia.Point(p.x, p.y)), true)
      .setFillType(FillType.EvenOdd)
      .build();
    const pieceA = Skia.Path.MakeFromOp(countryPath, half, PathOp.Intersect);
    const pieceB = Skia.Path.MakeFromOp(countryPath, half, PathOp.Difference);
    const n = cutNormal(chopped, country.points); // B → A, same orientation on screen

    // The blade only needs to travel across the country, not the whole screen.
    let blade: Pt[];
    if (chopped.kind === "line") {
      const a = toScreen(chopped.line.a), b = toScreen(chopped.line.b);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const d = { x: dx / len, y: dy / len };
      let tMin = Infinity, tMax = -Infinity;
      for (const ring of country.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const t = (fit.ox + ring[i] * fit.s - a.x) * d.x + (fit.oy + ring[i + 1] * fit.s - a.y) * d.y;
          tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
        }
      }
      blade = [
        { x: a.x + d.x * (tMin - 30), y: a.y + d.y * (tMin - 30) },
        { x: a.x + d.x * (tMax + 30), y: a.y + d.y * (tMax + 30) },
      ];
    } else {
      blade = extendedCurve(chopped.pts.map(toScreen), 30);
    }

    const final = finalCamera(country, fit, size.w, size.h, hmax);
    const model = buildColumns(country, fit, chopped, theme.sideA, theme.sideB, hmax);
    return { n, pieceA, pieceB, final, model, bladePath: polylinePath(blade) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chopped, countryPath, fit, country, theme, hmax]);

  const startSpin = () => {
    spinning.current = true;
    const from = orbit.value;
    orbit.value = withRepeat(withTiming(from + 2 * Math.PI, { duration: T.SPIN_PERIOD, easing: Easing.linear }), -1);
  };

  useEffect(() => {
    cancelAnimation(orbit);
    orbit.value = 0;
    pitch.value = 0;
    spinning.current = false;
    fireT.value = 0;
    if (!scene) {
      sweep.value = 0; flash.value = 0; shake.value = 0; sep.value = 0; tilt.value = 0; rise.value = 0;
      return;
    }
    sweep.value = 0;
    sweep.value = withTiming(1, { duration: T.SWEEP, easing: Easing.in(Easing.quad) });
    flash.value = 0;
    flash.value = withDelay(
      T.IMPACT,
      withSequence(withTiming(1, { duration: 0 }), withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) })),
    );
    shake.value = 0;
    shake.value = withDelay(T.IMPACT, withTiming(1, { duration: 320, easing: Easing.linear }));
    sep.value = 0;
    sep.value = withDelay(T.IMPACT, withSpring(1, { damping: 11, stiffness: 90 }));
    tilt.value = 0;
    tilt.value = withDelay(T.TILT_START, withTiming(1, { duration: T.TILT_DURATION, easing: Easing.inOut(Easing.cubic) }));
    rise.value = 0;
    rise.value = withDelay(T.RISE_START, withTiming(1, { duration: T.RISE_DURATION, easing: Easing.linear }));

    const timers = [
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), T.IMPACT),
      setTimeout(() => startSpin(), T.TILT_START + T.TILT_DURATION),
      setTimeout(() => {
        playSfx("rise");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }, T.RISE_START),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Fireworks
  const [sparks, setSparks] = useState<Spark[] | null>(null);
  useEffect(() => {
    if (!celebrate || !scene) {
      setSparks(null);
      return;
    }
    const timer = setTimeout(() => {
      setSparks(makeSparks(size.w / 2, size.h * 0.32, size.w * 0.7, [theme.gold, theme.sideA, theme.sideB, "#FFFFFF"]));
      fireT.value = 0;
      fireT.value = withTiming(2.3, { duration: 2300, easing: Easing.linear });
      playSfx("fireworks");
    }, T.SCORE);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate, scene]);

  const finalCam = scene?.final ?? IDENTITY_FINAL;
  const cam = useDerivedValue<Cam>(() => camAt(finalCam, tilt.value, orbit.value, pitch.value), [finalCam]);
  const camT = useDerivedValue(() => camTransform(cam.value));
  const shakeT = useDerivedValue(() => {
    const s = shake.value;
    const amp = s > 0 && s < 1 ? 5 * (1 - s) : 0;
    return [{ translateX: Math.sin(s * 38) * amp }, { translateY: Math.cos(s * 31) * amp * 0.6 }];
  });

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
  const firePicture = useDerivedValue(
    () =>
      createPicture(
        (canvas) => {
          if (sparks) drawSparks(canvas, sparks, fireT.value);
        },
        { width: Math.max(1, size.w), height: Math.max(1, size.h) },
      ),
    [sparks, size.w, size.h],
  );

  // Blade sweep: a bright streak whose head runs along the cut (works for lines and curves).
  const bladeStart = useDerivedValue(() => Math.max(0, sweep.value - 0.45));
  const bladeEnd = useDerivedValue(() => sweep.value);
  const bladeOpacity = useDerivedValue(() => (sweep.value > 0 && sweep.value < 1 ? 1 : 0));
  const cutGlow = useDerivedValue(() => 1.5 + 4 * flash.value);

  // Draw order of the two slabs: whichever is further from the camera goes first.
  const snx = scene?.n.x ?? 0, sny = scene?.n.y ?? 0;
  const aIsBack = useDerivedValue(() => {
    const c = cam.value;
    return Math.sin(c.theta) * snx + Math.cos(c.theta) * sny < 0 ? 1 : 0;
  }, [snx, sny]);
  const bIsBack = useDerivedValue(() => 1 - aIsBack.value);

  /** Wrong move: a quick red blink, a buzz and a warning haptic. */
  const signalNope = () => {
    nope.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 380 }));
    playSfx("error");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const finishStroke = () => {
    const pts = stroke.current;
    if (pts.length < 3 || strokeLen.current < MIN_LINE * 1.5) {
      clearAim();
      onCutChange(null);
      return;
    }
    const cut: Cut = { kind: "curve", pts: pts.map(toNorm) };
    // Out of ink but still a clean cut? Then it simply chops. Otherwise: nope.
    if (!isCleanFreehandCut(country.rings, cut)) signalNope();
    setStroke(pts, true);
    onCutChange(cut);
  };

  // ---------------- gestures ----------------
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .enabled(!chopped)
    .onBegin((e) => {
      pinching.current = true;
      drag.current = null;
      clearAim();
      onCutChange(null);
      gfx.value = e.focalX;
      gfy.value = e.focalY;
    })
    .onUpdate((e) => {
      gz.value = clampZoom(e.scale);
    })
    .onFinalize(commitView);
  const pan2 = Gesture.Pan()
    .runOnJS(true)
    .enabled(!chopped)
    .minPointers(2)
    .onUpdate((e) => {
      gtx.value = e.translationX;
      gty.value = e.translationY;
    })
    .onFinalize(commitView);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => {
      if (chopped) {
        drag.current = { mode: "orbit", dx: 0, dy: 0 };
        cancelAnimation(orbit);
        orbitStart.current = { orbit: orbit.value, pitch: pitch.value };
        return;
      }
      if (tool === "free") {
        drag.current = { mode: "stroke", dx: 0, dy: 0 };
        strokeLen.current = 0;
        inkLeft.value = 1;
        setStroke([{ x: e.x, y: e.y }], false);
        Haptics.selectionAsync();
        playSfx("tap");
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
        playSfx("tap");
      }
    })
    .onUpdate((e) => {
      const d = drag.current;
      if (!d) return;
      if (d.mode === "orbit") {
        orbit.value = orbitStart.current.orbit + e.translationX * 0.008;
        pitch.value = Math.max(-0.6, Math.min(0.3, orbitStart.current.pitch - e.translationY * 0.004));
        return;
      }
      if (d.mode === "stroke") {
        const pts = stroke.current;
        const last = pts[pts.length - 1];
        let p = clamp({ x: e.x, y: e.y });
        const seg = Math.hypot(p.x - last.x, p.y - last.y);
        if (pts.length >= STROKE_MAX || seg < STROKE_STEP) return;
        const left = inkBudget - strokeLen.current;
        if (seg >= left) {
          // Out of ink: end the stroke exactly where the ink runs out, then judge it as if released.
          const t = Math.max(0, left / seg);
          p = { x: last.x + (p.x - last.x) * t, y: last.y + (p.y - last.y) * t };
          strokeLen.current = inkBudget;
          inkLeft.value = 0;
          stroke.current = [...pts, p];
          drag.current = null;
          finishStroke();
          return;
        }
        strokeLen.current += seg;
        inkLeft.value = 1 - strokeLen.current / inkBudget;
        setStroke([...pts, p], false);
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
      if (!d || pinching.current) return;
      if (d.mode === "orbit") {
        if (spinning.current) startSpin(); // keep spinning from wherever the player left it
        return;
      }
      if (d.mode === "stroke") {
        finishStroke();
        return;
      }
      const l = line.current;
      if (!l || Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) < MIN_LINE) {
        clearAim();
        onCutChange(null);
        return;
      }
      onCutChange({ kind: "line", line: { a: toNorm(l.a), b: toNorm(l.b) } });
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

  const nopeOpacity = useDerivedValue(() => nope.value * 0.28);
  const INK_BAR_W = Math.max(0, size.w - 2 * PAD);
  const inkWidth = useDerivedValue(() => INK_BAR_W * inkLeft.value, [INK_BAR_W]);
  const inkColor = useDerivedValue(() => (inkLeft.value < 0.2 ? theme.sideA : theme.ink), [theme]);

  const perfectPath = useMemo(() => {
    if (!perfect) return null;
    if (perfect.kind === "line") {
      const a = toScreen(perfect.line.a), b = toScreen(perfect.line.b);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return polylinePath([
        { x: a.x - (dx / len) * FAR, y: a.y - (dy / len) * FAR },
        { x: b.x + (dx / len) * FAR, y: b.y + (dy / len) * FAR },
      ]);
    }
    return polylinePath(extendedCurve(perfect.pts.map(toScreen), FAR));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfect, fit]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const slab = (path: SkPath | null, tint: string, sign: number, key: string) =>
    path &&
    scene && (
      <SlabPiece
        key={key}
        path={path}
        tint={tint}
        theme={theme}
        cam={cam}
        camT={camT}
        sep={sep}
        nx={scene.n.x * sign}
        ny={scene.n.y * sign}
      />
    );

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {size.w > 0 && (
        <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, pan2)}>
          <View style={styles.fill}>
            <Canvas style={styles.fill}>
              <Group transform={shakeT}>
                <Group transform={camT}>
                  <Path path={grid.minor} color={theme.gridMinor} style="stroke" strokeWidth={1} />
                  <Path path={grid.major} color={theme.gridMajor} style="stroke" strokeWidth={1} />
                </Group>

                {!scene ? (
                  <Group transform={liveT}>
                    <FlatSlab path={countryPath} theme={theme} />
                  </Group>
                ) : (
                  <>
                    <Group opacity={aIsBack}>
                      {slab(scene.pieceA, theme.sideA, 1, "a1")}
                      {slab(scene.pieceB, theme.sideB, -1, "b1")}
                    </Group>
                    <Group opacity={bIsBack}>
                      {slab(scene.pieceB, theme.sideB, -1, "b2")}
                      {slab(scene.pieceA, theme.sideA, 1, "a2")}
                    </Group>
                    <Group transform={camT}>
                      {/* Glowing cut left behind by the blade */}
                      <Path
                        path={scene.bladePath}
                        color={theme.blade}
                        style="stroke"
                        strokeWidth={cutGlow}
                        strokeJoin="round"
                        opacity={flash}
                      >
                        <BlurMask blur={3} style="solid" />
                      </Path>
                      {perfectPath && (
                        <Path path={perfectPath} color={theme.gold} style="stroke" strokeWidth={2.5} strokeJoin="round">
                          <DashPathEffect intervals={[10, 6]} />
                        </Path>
                      )}
                    </Group>
                    <Picture picture={picture} />
                    {/* The blade itself */}
                    <Group opacity={bladeOpacity}>
                      <Path
                        path={scene.bladePath}
                        start={bladeStart}
                        end={bladeEnd}
                        color={theme.blade}
                        style="stroke"
                        strokeWidth={10}
                        strokeCap="round"
                        strokeJoin="round"
                        opacity={0.35}
                      >
                        <BlurMask blur={8} style="normal" />
                      </Path>
                      <Path
                        path={scene.bladePath}
                        start={bladeStart}
                        end={bladeEnd}
                        color={theme.blade}
                        style="stroke"
                        strokeWidth={3}
                        strokeCap="round"
                        strokeJoin="round"
                      />
                    </Group>
                  </>
                )}

                {!chopped && tool === "line" && (
                  <Group opacity={lineAlpha}>
                    <Line p1={far1} p2={far2} color={theme.ink} style="stroke" strokeWidth={1.5} opacity={0.3}>
                      <DashPathEffect intervals={[6, 6]} />
                    </Line>
                    {/* dark outline keeps the line readable on both the sand land and the black ground */}
                    <Line p1={p1} p2={p2} color={theme.inkOnLand} style="stroke" strokeWidth={6} strokeCap="round" />
                    <Line p1={p1} p2={p2} color={theme.ink} style="stroke" strokeWidth={3} strokeCap="round" />
                    <Circle c={p1} r={HANDLE_R + 1.5} color={theme.inkOnLand} />
                    <Circle c={p1} r={HANDLE_R} color={theme.ink} />
                    <Circle c={p1} r={HANDLE_R - 3.5} color={theme.sideA} />
                    <Circle c={p2} r={HANDLE_R + 1.5} color={theme.inkOnLand} />
                    <Circle c={p2} r={HANDLE_R} color={theme.ink} />
                    <Circle c={p2} r={HANDLE_R - 3.5} color={theme.sideB} />
                  </Group>
                )}

                {!chopped && tool === "free" && (
                  <Group>
                    {/* ink left for this cut */}
                    <RoundedRect x={PAD} y={8} width={INK_BAR_W} height={4} r={2} color={theme.gridMajor} />
                    <RoundedRect x={PAD} y={8} width={inkWidth} height={4} r={2} color={inkColor} opacity={0.8} />
                  </Group>
                )}

                {!chopped && tool === "free" && (
                  <Group opacity={lineAlpha} transform={liveT}>
                    <Path path={strokeExt} color={theme.ink} style="stroke" strokeWidth={1.5} opacity={0.3}>
                      <DashPathEffect intervals={[6, 6]} />
                    </Path>
                    <Path path={strokePath} color={theme.inkOnLand} style="stroke" strokeWidth={6} strokeCap="round" strokeJoin="round" />
                    <Path path={strokePath} color={theme.ink} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" />
                  </Group>
                )}
              </Group>
              <Picture picture={firePicture} />
              <Rect x={0} y={0} width={size.w} height={size.h} color={theme.sideA} opacity={nopeOpacity} />
            </Canvas>

            {scene && shareA !== null && (
              <>
                <FloatingLabel
                  value={shareA * 100}
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
                  value={100 - shareA * 100}
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
      <Group transform={[{ translateY: 5 }]}>
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
          <Path path={path} color={tint} opacity={0.16} />
          <Path path={path} color={theme.landEdge} style="stroke" strokeWidth={1} />
        </Group>
      </Group>
    </Group>
  );
}

type LabelProps = {
  value: number;
  color: string;
  anchor: Pt;
  nx: number;
  ny: number;
  cam: SharedValue<Cam>;
  sep: SharedValue<number>;
  rise: SharedValue<number>;
  lift: number;
};

/** A percentage chip that floats above one piece, follows the camera and counts up. */
function FloatingLabel({ value, color, anchor, nx, ny, cam, sep, rise, lift }: LabelProps) {
  const style = useAnimatedStyle(() => {
    const p = project(
      cam.value,
      anchor.x + nx * SEPARATION * sep.value,
      anchor.y + ny * SEPARATION * sep.value,
      lift,
    );
    const t = Math.max(0, Math.min(1, (rise.value - 0.3) / 0.3));
    return {
      opacity: t,
      transform: [{ translateX: p.x - LABEL_W / 2 }, { translateY: p.y - 18 - 10 * (1 - t) }, { scale: 0.8 + 0.2 * t }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.label, { backgroundColor: color }, style]}>
      <CountUp to={value} suffix="%" delay={T.COUNT_START} duration={T.COUNT_DURATION} style={styles.labelText} />
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
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  labelText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16, fontVariant: ["tabular-nums"] },
});
