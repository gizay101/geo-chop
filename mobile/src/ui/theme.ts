// "Night table" look: near-black ground with a faint grid; sand-coloured country slab.
// (Light palette from docs/PLAN.md §3.2 is kept for later as an option.)
const night = {
  paper: "#0C0F15", // background
  gridMinor: "#151A24",
  gridMajor: "#222938",
  land: "#E9DCC4",
  landEdge: "#9C7E52",
  ink: "#EEF1F7", // text, buttons
  inkOnLand: "#0C0F15",
  sideA: "#FF7A3D",
  sideB: "#2EC4B6",
  blade: "#FFFFFF",
  gold: "#FFCB52",
  muted: "#7E879B",
  card: "#171C27",
};

export type Theme = typeof night;

export function useTheme(): Theme {
  return night;
}
