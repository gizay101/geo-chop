import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { playSfx } from "@/audio/sfx";
import { entriesFor, flagOf, type PackId } from "@/data/packs";
import { getBest } from "@/store/progress";
import { useTheme, type Theme } from "@/ui/theme";

const TITLES: Record<string, string> = { countries: "Countries", islands: "Islands" };

/** Pick a country or island to practise. */
export default function Browse() {
  const theme = useTheme();
  const s = makeStyles(theme);
  const { pack = "countries" } = useLocalSearchParams<{ pack?: PackId }>();
  const entries = entriesFor(pack);
  const [best, setBest] = useState<Record<string, number | null>>({});

  useFocusEffect(
    useCallback(() => {
      setBest(Object.fromEntries(entries.map((e) => [e.iso, getBest(e.iso)])));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pack]),
  );

  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      <View style={s.header}>
        <Pressable
          hitSlop={12}
          onPress={() => {
            playSfx("tap");
            router.back();
          }}
        >
          <Text style={s.back}>‹ Menu</Text>
        </Pressable>
        <Text style={s.title}>{TITLES[pack] ?? pack}</Text>
        <View style={{ width: 60 }} />
      </View>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.iso}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const b = best[item.iso];
          return (
            <Pressable
              onPress={() => {
                playSfx("tap");
                router.push(`/play?mode=single&iso=${item.iso}` as never);
              }}
              style={({ pressed }) => [s.row, pressed && s.pressed]}
            >
              <Text style={s.flag}>{flagOf(item.iso2)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={s.sub}>
                  {formatPop(item.population)} people{item.note ? ` · ${item.note}` : ""}
                </Text>
              </View>
              <Text style={[s.best, b == null && s.bestNone]}>{b == null ? "–" : b.toFixed(1)}</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function formatPop(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  return `${Math.round(n / 1e3)}K`;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.paper },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10 },
    back: { fontSize: 17, fontWeight: "800", color: t.ink, width: 60 },
    title: { fontSize: 20, fontWeight: "900", color: t.ink },
    list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: t.card,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: t.gridMajor,
    },
    flag: { fontSize: 28 },
    name: { color: t.ink, fontSize: 17, fontWeight: "800" },
    sub: { color: t.muted, fontSize: 12, marginTop: 2 },
    best: { color: t.gold, fontSize: 17, fontWeight: "900", fontVariant: ["tabular-nums"] },
    bestNone: { color: t.muted },
    pressed: { opacity: 0.8 },
  });
