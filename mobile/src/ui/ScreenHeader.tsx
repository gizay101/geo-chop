import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { playSfx } from "@/audio/sfx";
import { useTheme } from "@/ui/theme";

/** "‹ Back   Title" bar used by the list screens. */
export function ScreenHeader({ title, back = "‹ Back" }: { title: string; back?: string }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        hitSlop={12}
        onPress={() => {
          playSfx("tap");
          router.back();
        }}
      >
        <Text style={[styles.back, { color: t.ink }]}>{back}</Text>
      </Pressable>
      <Text style={[styles.title, { color: t.ink }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 70 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10 },
  back: { fontSize: 17, fontWeight: "800", width: 70 },
  title: { fontSize: 20, fontWeight: "900", flexShrink: 1, textAlign: "center" },
});
