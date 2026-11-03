import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { playSfx } from "@/audio/sfx";
import { entriesFor, flagOf, formatTotal, packKey, type PackId } from "@/data/packs";
import { getBest } from "@/store/progress";
import { useTheme, type Theme } from "@/ui/theme";

const TITLES: Record<string, string> = { countries: "Countries", islands: "Islands", economy: "Economy", billionaires: "Billionaires" };
const TOOL_TITLES: Record<string, string> = { free: "Freehand" };

/** Pick a country or island to practise. */
export default function Browse() {
  const theme = useTheme();
  const s = makeStyles(theme);
  const { pack = "countries", tool = "line" } = useLocalSearchParams<{ pack?: PackId; tool?: string }>();
  // Freehand works on everything: countries, islands and the world.
  const entries = useMemo(
    () => (tool === "free" ? [...entriesFor("world"), ...entriesFor("countries"), ...entriesFor("islands")] : entriesFor(pack)),
    [pack, tool],
  );
  const [best, setBest] = useState<Record<string, number | null>>({});

  useFocusEffect(
    useCallback(() => {
      setBest(Object.fromEntries(entries.map((e) => [packKey(e.pack, e.iso), getBest(packKey(e.pack, e.iso), tool)])));
    }, [entries, tool]),
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
        <Text style={s.title}>{TOOL_TITLES[tool] ?? TITLES[pack] ?? pack}</Text>
        <View style={{ width: 60 }} />
      </View>
      <FlatList
        data={entries}
        keyExtractor={(e) => packKey(e.pack, e.iso)}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const b = best[packKey(item.pack, item.iso)];
          return (
            <Pressable
              onPress={() => {
                playSfx("tap");
                router.push(`/play?mode=single&pack=${item.pack}&iso=${item.iso}&tool=${tool}` as never);
              }}
              style={({ pressed }) => [s.row, pressed && s.pressed]}
            >
              <Text style={s.flag}>{flagOf(item.iso2)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={s.sub}>
                  {formatTotal(item.metric, item.total)}{item.note ? ` · ${item.note}` : ""}
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
