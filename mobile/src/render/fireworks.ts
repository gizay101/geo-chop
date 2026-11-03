import { Skia, type SkCanvas } from "@shopify/react-native-skia";

export type Spark = { x: number; y: number; vx: number; vy: number; delay: number; color: string; size: number };

/** Three small bursts above the given area. Positions in screen px. */
export function makeSparks(cx: number, cy: number, spreadX: number, colors: string[]): Spark[] {
  const sparks: Spark[] = [];
  const bursts = [
    { x: cx - spreadX * 0.45, y: cy - 30, delay: 0 },
    { x: cx + spreadX * 0.4, y: cy - 60, delay: 0.35 },
    { x: cx + spreadX * 0.05, y: cy - 110, delay: 0.75 },
  ];
  for (const b of bursts) {
    const n = 34;
    const speed = 70 + Math.random() * 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const v = speed * (0.6 + Math.random() * 0.4);
      sparks.push({
        x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        delay: b.delay, color: colors[i % colors.length], size: 1.6 + Math.random() * 1.6,
      });
    }
  }
  return sparks;
}

const LIFE = 1.3; // seconds per spark
const GRAVITY = 90; // px/s²

/** Draw sparks at time `t` seconds since the first burst. */
export function drawSparks(canvas: SkCanvas, sparks: Spark[], t: number) {
  "worklet";
  if (t <= 0) return;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    const lt = t - s.delay;
    if (lt <= 0 || lt >= LIFE) continue;
    const u = lt / LIFE;
    const drag = 1 - u * 0.5;
    const x = s.x + s.vx * lt * drag;
    const y = s.y + s.vy * lt * drag + 0.5 * GRAVITY * lt * lt;
    const tx = s.x + s.vx * Math.max(0, lt - 0.08) * drag;
    const ty = s.y + s.vy * Math.max(0, lt - 0.08) * drag + 0.5 * GRAVITY * Math.max(0, lt - 0.08) ** 2;
    paint.setColor(Skia.Color(s.color));
    paint.setAlphaf((1 - u) * (1 - u));
    paint.setStrokeWidth(s.size * 0.7);
    canvas.drawLine(tx, ty, x, y, paint);
    canvas.drawCircle(x, y, s.size * (1 - u * 0.6), paint);
  }
}
