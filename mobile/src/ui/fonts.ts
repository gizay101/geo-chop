import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { DMMono_500Medium } from "@expo-google-fonts/dm-mono";
import { DMSans_400Regular, DMSans_700Bold } from "@expo-google-fonts/dm-sans";

/** Loaded once in the root layout (useFonts). */
export const FONT_ASSETS = { BricolageGrotesque_800ExtraBold, DMSans_400Regular, DMSans_700Bold, DMMono_500Medium };

export const F = {
  display: "BricolageGrotesque_800ExtraBold",
  body: "DMSans_400Regular",
  bold: "DMSans_700Bold",
  mono: "DMMono_500Medium",
} as const;
