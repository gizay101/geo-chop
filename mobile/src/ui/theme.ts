import { useColorScheme } from "react-native";

// Palette from docs/PLAN.md §3.2.
const light = {
  paper: "#F3EEE4",
  land: "#E6D6B8",
  landEdge: "#BFA67A",
  ink: "#1C2233",
  sideA: "#FF7A3D",
  sideB: "#1FB5A8",
  blade: "#FFFFFF",
  gold: "#E0A21B",
  muted: "#8A8F9C",
  card: "#FFFFFF",
};

const dark: typeof light = {
  paper: "#0F1626",
  land: "#2A3550",
  landEdge: "#18203A",
  ink: "#E9EDF5",
  sideA: "#FF8A50",
  sideB: "#33CFC1",
  blade: "#FFFFFF",
  gold: "#FFCB52",
  muted: "#7E879B",
  card: "#1A2338",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
