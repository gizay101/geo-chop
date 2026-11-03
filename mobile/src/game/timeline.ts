/** Milliseconds after pressing CHOP. One place to tune the whole reveal. */
export const T = {
  /** Blade sweeps along the line. */
  SWEEP: 300,
  /** Blade hits the board: shake, heavy haptic, pieces start separating. Matches the thunk in slice.wav. */
  IMPACT: 300,
  TILT_START: 650,
  TILT_DURATION: 1400,
  RISE_START: 1700,
  RISE_DURATION: 2000,
  /** Numbers start counting up. */
  COUNT_START: 2400,
  COUNT_DURATION: 1400,
  /** Score/grade land, and fireworks if the chop was good. */
  SCORE: 3850,
  /** Slow constant spin after the tilt: one full turn takes this long. */
  SPIN_PERIOD: 48000,
} as const;

/** Fireworks when the chop is within this many percentage points of 50/50. */
export const FIREWORKS_MAX_ERROR = 5;
