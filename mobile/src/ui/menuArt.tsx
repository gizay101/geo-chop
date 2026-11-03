// Illustrations and icons for the main menu (design "B · Cut-mark grid").
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from "react-native-svg";

const SAND = "#E9DCC4";
const EDGE = "#9C7E52";
const ORANGE = "#FF7A3D";
const TEAL = "#2EC4B6";

/** Orange L-shaped crop marks in the four corners of a tile. */
export function CropMarks({ size = 10, color = ORANGE }: { size?: number; color?: string }) {
  const base = { position: "absolute" as const, width: size, height: size, borderColor: color };
  return (
    <>
      <View pointerEvents="none" style={[base, { top: 6, left: 6, borderTopWidth: 2, borderLeftWidth: 2 }]} />
      <View pointerEvents="none" style={[base, { top: 6, right: 6, borderTopWidth: 2, borderRightWidth: 2 }]} />
      <View pointerEvents="none" style={[base, { bottom: 6, left: 6, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
      <View pointerEvents="none" style={[base, { bottom: 6, right: 6, borderBottomWidth: 2, borderRightWidth: 2 }]} />
    </>
  );
}

/** Faint 32 px grid behind the whole menu, like the in-game ground. */
export function GridBackground({ color = "#141A24" }: { color?: string }) {
  const lines = Array.from({ length: 40 }, (_, i) => i * 32);
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines.map((v) => (
        <Line key={`v${v}`} x1={v} y1={0} x2={v} y2={2000} stroke={color} strokeWidth={1} />
      ))}
      {lines.map((v) => (
        <Line key={`h${v}`} x1={0} y1={v} x2={2000} y2={v} stroke={color} strokeWidth={1} />
      ))}
    </Svg>
  );
}

/** A country slab cut in two, with population columns on each half. */
export function SlabArt({ width = 96, height = 80 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 120 100">
      <G transform="translate(-3 4)">
        <Polygon points="34,41 86,67 60,80 8,54" transform="translate(0 7)" fill={EDGE} />
        <Polygon points="34,41 86,67 60,80 8,54" fill={SAND} />
        <Rect x={40} y={34} width={7} height={22} fill={TEAL} />
        <Rect x={24} y={44} width={7} height={12} fill={TEAL} />
        <Rect x={56} y={54} width={7} height={12} fill={TEAL} />
      </G>
      <G transform="translate(3 -4)">
        <Polygon points="60,28 112,54 86,67 34,41" transform="translate(0 7)" fill={EDGE} />
        <Polygon points="60,28 112,54 86,67 34,41" fill={SAND} />
        <Rect x={64} y={24} width={7} height={24} fill={ORANGE} />
        <Rect x={84} y={38} width={7} height={12} fill={ORANGE} />
      </G>
      <Line x1={22} y1={44} x2={102} y2={84} stroke="#FFFFFF" strokeWidth={1.5} strokeOpacity={0.85} />
    </Svg>
  );
}

export type IconName = "countries" | "islands" | "world" | "economy" | "billionaires" | "friends" | "home" | "packs" | "stats" | "settings" | "flame";

/** 24-unit stroke icons. */
export function Icon({ name, size = 30, color = "#EEF1F7" }: { name: IconName; size?: number; color?: string }) {
  const p = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let body: React.ReactNode = null;
  switch (name) {
    case "countries":
      body = (<><Path {...p} d="M3 6l6-2.5 6 2.5 6-2.5v15l-6 2.5-6-2.5-6 2.5z" /><Path {...p} d="M9 3.5v15M15 6v15" /></>);
      break;
    case "islands":
      body = (<><Path {...p} d="M4 15c2.5-4 5.5-6 8-6s5.5 2 8 6" /><Path {...p} d="M12 9V4l4 1.5L12 7" /><Path {...p} d="M2 19c1.7 0 1.7-1 3.3-1s1.7 1 3.4 1 1.7-1 3.3-1 1.7 1 3.3 1 1.7-1 3.4-1 1.6 1 3.3 1" /></>);
      break;
    case "world":
      body = (<><Circle {...p} cx={12} cy={12} r={9} /><Ellipse {...p} cx={12} cy={12} rx={4} ry={9} /><Path {...p} d="M3 12h18" /><Path {...p} stroke={ORANGE} d="M4 20L20 4" /></>);
      break;
    case "economy":
      body = (<><Ellipse {...p} cx={9} cy={18} rx={6} ry={2.5} /><Path {...p} d="M3 18v-3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v3" /><Ellipse {...p} cx={15} cy={8} rx={6} ry={2.5} /><Path {...p} d="M9 8v3.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V8" /></>);
      break;
    case "billionaires":
      body = (<><Path {...p} d="M6 3h12l4 6-10 12L2 9z" /><Path {...p} d="M2 9h20M9 3l3 6 3-6M12 9v12" /></>);
      break;
    case "friends":
      body = (<><Circle {...p} cx={9} cy={8} r={3.5} /><Path {...p} d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><Circle {...p} cx={17} cy={9} r={2.5} /><Path {...p} d="M17.5 14.5c2 .4 3.4 2 4 4.5" /></>);
      break;
    case "home":
      body = (<><Path {...p} strokeWidth={2} d="M4 10l8-6 8 6v10H4z" /><Path {...p} strokeWidth={2} d="M10 20v-6h4v6" /></>);
      break;
    case "packs":
      body = (<><Rect {...p} strokeWidth={2} x={4} y={4} width={7} height={7} rx={1.5} /><Rect {...p} strokeWidth={2} x={13} y={4} width={7} height={7} rx={1.5} /><Rect {...p} strokeWidth={2} x={4} y={13} width={7} height={7} rx={1.5} /><Rect {...p} strokeWidth={2} x={13} y={13} width={7} height={7} rx={1.5} /></>);
      break;
    case "stats":
      body = <Path {...p} strokeWidth={2} d="M5 20V12M12 20V5M19 20v-9" />;
      break;
    case "settings":
      body = (<><Path {...p} strokeWidth={2} d="M4 7h10M18 7h2M4 17h4M12 17h8" /><Circle {...p} strokeWidth={2} cx={16} cy={7} r={2} /><Circle {...p} strokeWidth={2} cx={10} cy={17} r={2} /></>);
      break;
    case "flame":
      body = <Path fill={color} d="M12 2c1.2 3.6 5 5.4 5 10a5 5 0 0 1-10 0c0-2.2 1.1-3.8 2.4-4.8.2 1.9 1.3 2.9 2.4 3.1-.9-2.9-.6-5.6.2-8.3z" />;
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
