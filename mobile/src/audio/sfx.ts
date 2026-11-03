import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

// Synthesised by pipeline/sfx/make_sfx.py, except slice-rip.mp3 (Pixabay, "paper rip fast" by tanweraman).
const SOURCES = {
  tap: require("../../assets/sfx/tap.wav"),
  slice: require("../../assets/sfx/slice-rip.mp3"),
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

/** Several players per sound, used in turn, so a sound can overlap itself and never waits on another. */
const POOL = 3;

let players: Record<Sfx, AudioPlayer[]> | null = null;
const nextIndex: Partial<Record<Sfx, number>> = {};

/** Create the players once. They live for the whole app session. */
export function initSfx() {
  if (players) return;
  // Play even with the iPhone's silent switch on, and mix with the player's music.
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" }).catch(() => {});
  const made = {} as Record<Sfx, AudioPlayer[]>;
  for (const name of Object.keys(SOURCES) as Sfx[]) {
    made[name] = Array.from({ length: POOL }, () => {
      const p = createAudioPlayer(SOURCES[name]);
      p.volume = VOLUME[name];
      return p;
    });
  }
  players = made;
}

export function playSfx(name: Sfx) {
  const list = players?.[name];
  if (!list) return;
  const i = (nextIndex[name] ?? 0) % list.length;
  nextIndex[name] = i + 1;
  const p = list[i];
  // seekTo is async: wait for the rewind before playing, or every other play is lost.
  p.seekTo(0)
    .then(() => p.play())
    .catch(() => {
      // Sound is a nicety; never let it break the game.
    });
}
