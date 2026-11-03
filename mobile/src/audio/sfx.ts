import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

// Synthesised by pipeline/sfx/make_sfx.py.
const SOURCES = {
  tap: require("../../assets/sfx/tap.wav"),
  slice: require("../../assets/sfx/slice.wav"),
  rise: require("../../assets/sfx/rise.wav"),
  countup: require("../../assets/sfx/countup.wav"),
  fireworks: require("../../assets/sfx/fireworks.wav"),
  success: require("../../assets/sfx/success.wav"),
  error: require("../../assets/sfx/error.wav"),
} as const;

export type Sfx = keyof typeof SOURCES;

const VOLUME: Record<Sfx, number> = {
  tap: 0.5,
  slice: 1,
  rise: 0.35,
  countup: 0.7,
  fireworks: 0.8,
  success: 0.7,
  error: 0.7,
};

let players: Partial<Record<Sfx, AudioPlayer>> | null = null;

/** Create the players once. They live for the whole app session. */
export function initSfx() {
  if (players) return;
  // Prototype choice: play even when the iPhone's silent switch is on, and mix with music.
  // A sound on/off setting comes later (docs/PLAN.md §3.7).
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" }).catch(() => {});
  players = {};
  for (const name of Object.keys(SOURCES) as Sfx[]) {
    const p = createAudioPlayer(SOURCES[name]);
    p.volume = VOLUME[name];
    players[name] = p;
  }
}

export function playSfx(name: Sfx) {
  const p = players?.[name];
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {
    // Sound is a nicety; never let it break the game.
  }
}
