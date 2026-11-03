import React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/ui/ScreenHeader";
import { useTheme } from "@/ui/theme";

// Required by the CC BY licences of the datasets (docs/DATA_SOURCES.md). Kept out of the way.
const CREDITS: [string, string][] = [
  ["Population", "GHS-POP R2023A 2025, European Commission Joint Research Centre (Schiavina et al. 2023). CC BY 4.0."],
  ["Economy", "Kummu et al. 2025, gridded GDP (PPP) v4, 2024. Scientific Data 12:178. CC BY 4.0."],
  ["Billionaires", "Wikidata (CC0). City-level, approximate."],
  ["Maps & city names", "Made with Natural Earth (public domain)."],
  ["Sounds", "Made for GEO CHOP, plus \"paper rip fast\" by tanweraman (Pixabay)."],
];

export default function Credits() {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.paper }} edges={["top", "bottom"]}>
      <ScreenHeader title="Credits" />
      <ScrollView contentContainerStyle={styles.body}>
        {CREDITS.map(([title, text]) => (
          <Text key={title} style={[styles.item, { color: t.muted }]}>
            <Text style={{ color: t.ink, fontWeight: "800" }}>{title}: </Text>
            {text}
          </Text>
        ))}
        <Text style={[styles.item, { color: t.muted }]}>
          Data has been re-projected and aggregated for gameplay. Boundaries are simplified and do not imply any official
          position.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  item: { fontSize: 14, lineHeight: 20 },
});
