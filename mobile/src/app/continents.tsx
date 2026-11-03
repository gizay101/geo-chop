import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { playSfx } from "@/audio/sfx";
import type { PackId } from "@/data/packs";
import { batchesFor, CONTINENT_EMOJI, continentsFor } from "@/game/batches";
import { getBatchBest } from "@/store/progress";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useTheme, type Theme } from "@/ui/theme";

/** Countries (or Freehand) → pick a continent. */
export default function Continents() {
  const t = useTheme();
  const s = makeStyles(t);
  const { pack = "countries", tool = "line" } = useLocalSearchParams<{ pack?: PackId; tool?: string }>();
  const continents = continentsFor(pack);
  const [done, setDone] = useState<Record<string, number>>({});

  useFocusEffect(
    useCallback(() => {
      setDone(
        Object.fromEntries(
          continents.map((c) => [c.name, batchesFor(pack, c.name).filter((b) => getBatchBest(b.id, tool) !== null).length]),
        ),
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pack, tool]),
  );

  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      <ScreenHeader title={tool === "free" ? "Freehand" : "Countries"} back="‹ Menu" />
      <ScrollView contentContainerStyle={s.list}>
        {continents.map((c) => {
          const packs = batchesFor(pack, c.name).length;
          return (
            <Pressable
              key={c.name}
              onPress={() => {
                playSfx("tap");
                router.push(`/batches?pack=${pack}&continent=${encodeURIComponent(c.name)}&tool=${tool}` as never);
              }}
              style={({ pressed }) => [s.card, pressed && s.pressed]}
            >
              <Text style={s.emoji}>{CONTINENT_EMOJI[c.name] ?? "🌐"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{c.name}</Text>
                <Text style={s.sub}>
                  {c.count} countries · {packs} packs
                </Text>
              </View>
              <Text style={s.progress}>
                {done[c.name] ?? 0}/{packs}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.paper },
    list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      backgroundColor: t.card,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: t.gridMajor,
    },
    emoji: { fontSize: 34 },
    name: { color: t.ink, fontSize: 20, fontWeight: "900" },
    sub: { color: t.muted, fontSize: 13, marginTop: 2 },
    progress: { color: t.gold, fontSize: 16, fontWeight: "900" },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  });
