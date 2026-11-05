// Main menu: design "B · Cut-mark grid" (docs canvas "GEO CHOP Main Menu").
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { playSfx } from "@/audio/sfx";
import { entriesFor } from "@/data/packs";
import { batchesFor, continentsFor } from "@/game/batches";
import { puzzleNumber, ROUNDS_PER_DAY } from "@/game/daily";
import { getDaily, getLastChop, getOnslaughtBest, getStreak } from "@/store/progress";
import { F } from "@/ui/fonts";
import { CropMarks, GridBackground, Icon, SlabArt, type IconName } from "@/ui/menuArt";

const C = {
  bg: "#0C0F15",
  tile: "#141924",
  line: "#2A3142",
  ink: "#EEF1F7",
  muted: "#9099AD",
  orange: "#FF7A3D",
  teal: "#2EC4B6",
  gold: "#FFCB52",
};

type Tile = { n: string; icon: IconName; title: string; sub: string; href?: string; badge?: "NEW" | "SOON" };

export default function MainMenu() {
  const no = puzzleNumber();
  const [daily, setDaily] = useState(() => getDaily(no));
  const [streak, setStreak] = useState(() => getStreak(no));
  const [last, setLast] = useState(() => getLastChop());
  const [onslaught, setOnslaught] = useState(() => getOnslaughtBest());

  useFocusEffect(
    useCallback(() => {
      setDaily(getDaily(no));
      setStreak(getStreak(no));
      setLast(getLastChop());
      setOnslaught(getOnslaughtBest());
    }, [no]),
  );

  const played = daily.filter(Boolean).length;
  const finished = played >= ROUNDS_PER_DAY;
  const total = daily.reduce((sum, r) => sum + (r?.score ?? 0), 0);
  const countryPacks = continentsFor("countries").reduce((s, c) => s + batchesFor("countries", c.name).length, 0);
  const billionaires = entriesFor("billionaires")[0]?.total ?? 0;

  const go = (href: string) => {
    playSfx("tap");
    router.push(href as never);
  };
  const soon = (title: string, text: string) => {
    playSfx("tap");
    Alert.alert(title, text);
  };

  const tiles: Tile[] = [
    { n: "001", icon: "countries", title: "Countries", sub: `${entriesFor("countries").length} · ${countryPacks} packs of 4`, href: "/continents" },
    { n: "002", icon: "islands", title: "Islands", sub: `${entriesFor("islands").length} · ${batchesFor("islands").length} packs`, href: "/batches?pack=islands" },
    { n: "003", icon: "world", title: "The World", sub: "8.2 billion people", href: "/play?mode=single&pack=world&iso=WLD" },
    { n: "004", icon: "economy", title: "Economy", sub: `Split the GDP · ${entriesFor("economy").length}`, href: "/batches?pack=economy" },
    { n: "005", icon: "billionaires", title: "Billionaires", sub: `USA · ${billionaires}`, href: "/play?mode=single&pack=billionaires&iso=USA" },
    { n: "006", icon: "bolt", title: "Onslaught", sub: onslaught > 0 ? `Best run · ${onslaught}` : "Survive within 15%", href: "/play?mode=onslaught", badge: "NEW" },
  ];

  const segments = Array.from({ length: ROUNDS_PER_DAY }, (_, i) => i < played);

  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      <GridBackground />
      <ScrollView contentContainerStyle={s.content} bounces={false}>
        <View style={s.header}>
          <Text style={s.logo}>
            GEO <Text style={{ color: C.orange }}>CH</Text>
            <Text style={{ color: C.teal }}>OP</Text>
          </Text>
          <View style={s.streak} accessibilityLabel={`${streak.current} day streak`}>
            <Icon name="flame" size={15} color={C.bg} />
            <Text style={s.streakText}>{streak.current} day streak</Text>
          </View>
        </View>

        <Text style={s.label}>TODAY</Text>
        <Pressable onPress={() => go("/play?mode=daily")} style={({ pressed }) => [s.tile, s.daily, pressed && s.pressed]}>
          <CropMarks size={12} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.index}>000 · DAILY</Text>
            <Text style={s.dailyTitle}>Daily Chop No. {no}</Text>
            <View style={s.segments} accessibilityLabel={`${played} of ${ROUNDS_PER_DAY} played`}>
              {segments.map((on, i) => (
                <View key={i} style={[s.segment, { backgroundColor: on ? C.orange : C.line }]} />
              ))}
            </View>
            <Text style={s.sub}>
              {finished
                ? `Done · ${total.toFixed(1)} / ${ROUNDS_PER_DAY * 100} · tap to share`
                : played > 0
                  ? `${played} of ${ROUNDS_PER_DAY} chopped · new puzzle at midnight`
                  : "Same 5 countries for everyone today"}
            </Text>
          </View>
          <SlabArt />
        </Pressable>

        <Pressable onPress={() => go("/find")} style={({ pressed }) => [s.tile, s.daily, { minHeight: 96 }, pressed && s.pressed]}>
          <CropMarks size={12} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.index}>NEW · FIND & SLICE</Text>
            <Text style={s.dailyTitle}>Cut the world down to one country</Text>
            <Text style={s.sub}>Daily + Onslaught</Text>
          </View>
          <Icon name="world" size={40} />
        </Pressable>

        <Text style={s.label}>MODES</Text>
        <View style={s.grid}>
          {tiles.map((t) => {
            const locked = t.badge === "SOON";
            return (
              <Pressable
                key={t.n}
                accessibilityRole="button"
                onPress={() => (t.href ? go(t.href) : soon(t.title, "Invite friends with a link and compete on the daily. Coming soon."))}
                style={({ pressed }) => [s.tile, s.modeTile, locked && s.lockedTile, pressed && s.pressed]}
              >
                {!locked && <CropMarks />}
                <View style={s.tileTop}>
                  <Text style={[s.index, locked && { color: C.muted }]}>{t.n}</Text>
                  {t.badge === "NEW" && <Text style={s.badgeNew}>NEW</Text>}
                  {locked && <Text style={s.badgeSoon}>SOON</Text>}
                </View>
                <View style={{ marginTop: 10 }}>
                  <Icon name={t.icon} color={locked ? C.muted : C.ink} />
                </View>
                <View style={{ marginTop: "auto" }}>
                  <Text style={[s.tileTitle, locked && { color: "#C3C9D6" }]}>{t.title}</Text>
                  <Text style={s.sub}>{t.sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={[s.tile, s.lastChop]}>
          <Text style={s.lastLabel}>LAST{"\n"}CHOP</Text>
          {last ? (
            <>
              <Text style={s.lastName} numberOfLines={1}>
                {last.name}
              </Text>
              <View style={s.splitBar} accessibilityLabel={`${(last.shareA * 100).toFixed(1)} and ${(100 - last.shareA * 100).toFixed(1)} percent`}>
                <View style={{ flex: last.shareA, backgroundColor: C.orange }} />
                <View style={{ flex: 1 - last.shareA, backgroundColor: C.teal }} />
              </View>
              <Text style={s.lastScore}>{last.score.toFixed(1)}</Text>
            </>
          ) : (
            <Text style={s.sub}>Your last cut will show here.</Text>
          )}
        </View>
      </ScrollView>

      <View style={s.tabBar}>
        <View style={s.tabHome}>
          <Icon name="home" size={18} color={C.orange} />
          <Text style={s.tabHomeText}>HOME</Text>
        </View>
        <Pressable accessibilityLabel="Packs" onPress={() => go("/continents")} style={s.tabBtn}>
          <Icon name="packs" size={22} color="#C3C9D6" />
        </Pressable>
        <Pressable accessibilityLabel="Stats" onPress={() => soon("Stats", "Your streaks and score history. Coming soon.")} style={s.tabBtn}>
          <Icon name="stats" size={22} color="#C3C9D6" />
        </Pressable>
        <Pressable accessibilityLabel="Settings and credits" onPress={() => go("/credits")} style={s.tabBtn}>
          <Icon name="settings" size={22} color="#C3C9D6" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 44 },
  logo: { fontFamily: F.display, fontSize: 26, letterSpacing: 1, color: C.ink },
  streak: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.orange },
  streakText: { fontFamily: F.bold, fontSize: 14, color: C.bg },
  label: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.5, color: C.muted },
  tile: { backgroundColor: C.tile, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  daily: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 120, paddingVertical: 16, paddingHorizontal: 18 },
  index: { fontFamily: F.mono, fontSize: 12, color: C.orange },
  dailyTitle: { fontFamily: F.display, fontSize: 22, color: C.ink },
  segments: { flexDirection: "row", gap: 4, maxWidth: 170 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  sub: { fontFamily: F.body, fontSize: 12, color: C.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  modeTile: { width: "48.6%", height: 132, paddingVertical: 14, paddingHorizontal: 16 },
  lockedTile: { backgroundColor: "#10141C", borderStyle: "dashed" },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tileTitle: { fontFamily: F.bold, fontSize: 17, color: C.ink },
  badgeNew: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.bg, backgroundColor: C.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  badgeSoon: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.muted, borderWidth: 1, borderColor: "#3A4256", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  lastChop: { flexDirection: "row", alignItems: "center", gap: 12, height: 52, paddingHorizontal: 14 },
  lastLabel: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.muted, width: 44, lineHeight: 12 },
  lastName: { fontFamily: F.bold, fontSize: 15, color: C.ink, maxWidth: 90 },
  splitBar: { flex: 1, flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden" },
  lastScore: { fontFamily: F.bold, fontSize: 15, color: C.gold, fontVariant: ["tabular-nums"] },
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 60,
    marginHorizontal: 18,
    marginBottom: 8,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: C.tile,
    borderWidth: 1,
    borderColor: C.line,
  },
  tabHome: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: C.orange },
  tabHomeText: { fontFamily: F.mono, fontSize: 12, letterSpacing: 1, color: C.orange },
  tabBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
