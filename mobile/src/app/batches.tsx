import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { playSfx } from "@/audio/sfx";
import { flagOf, type PackId } from "@/data/packs";
import { batchesFor } from "@/game/batches";
import { getBatchBest } from "@/store/progress";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useTheme, type Theme } from "@/ui/theme";

const TITLES: Record<string, string> = { countries: "Countries", islands: "Islands", economy: "Economy" };

/** Packs of 4 countries, easy → hard. */
export default function Batches() {
  const t = useTheme();
  const s = makeStyles(t);
  const { pack = "countries", continent = "", tool = "line" } = useLocalSearchParams<{
    pack?: PackId;
    continent?: string;
    tool?: string;
  }>();
  const batches = batchesFor(pack, continent || undefined);
  const [best, setBest] = useState<Record<string, number | null>>({});

  useFocusEffect(
    useCallback(() => {
      setBest(Object.fromEntries(batches.map((b) => [b.id, getBatchBest(b.id, tool)])));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pack, continent, tool]),
  );

  const levelColor: Record<string, string> = { Easy: t.sideB, Medium: t.gold, Hard: t.sideA, Expert: "#E5484D" };

  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      <ScreenHeader title={`${tool === "free" ? "✍️ " : ""}${continent || TITLES[pack] || pack}`} />
      <FlatList
        data={batches}
        keyExtractor={(b) => b.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const b = best[item.id];
          return (
            <Pressable
              onPress={() => {
                playSfx("tap");
                router.push(
                  `/play?mode=batch&pack=${pack}&continent=${encodeURIComponent(continent)}&n=${item.index + 1}&tool=${tool}` as never,
                );
              }}
              style={({ pressed }) => [s.card, pressed && s.pressed]}
            >
              <View style={s.top}>
                <Text style={s.title}>{item.title}</Text>
                <Text style={[s.level, { color: levelColor[item.level] ?? t.muted }]}>{item.level}</Text>
                <View style={{ flex: 1 }} />
                <Text style={[s.best, b == null && { color: t.muted }]}>
                  {b == null ? "New" : `${b.toFixed(1)} / ${item.entries.length * 100}`}
                </Text>
              </View>
              <Text style={s.flags}>{item.entries.map((e) => flagOf(e.iso2)).join("  ")}</Text>
              <Text style={s.names} numberOfLines={1}>
                {item.entries.map((e) => e.name).join(" · ")}
              </Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.paper },
    list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
    card: { backgroundColor: t.card, borderRadius: 18, padding: 16, gap: 8, borderWidth: 1, borderColor: t.gridMajor },
    top: { flexDirection: "row", alignItems: "center", gap: 10 },
    title: { color: t.ink, fontSize: 18, fontWeight: "900" },
    level: { fontSize: 12, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
    best: { color: t.gold, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
    flags: { fontSize: 30, letterSpacing: 2 },
    names: { color: t.muted, fontSize: 13 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  });
