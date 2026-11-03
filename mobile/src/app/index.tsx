import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { playSfx } from "@/audio/sfx";
import { entriesFor } from "@/data/packs";
import { puzzleNumber, ROUNDS_PER_DAY } from "@/game/daily";
import { getDaily, getStreak } from "@/store/progress";
import { useTheme, type Theme } from "@/ui/theme";

type Tile = { emoji: string; title: string; subtitle: string; href?: string; soon?: string };

export default function MainMenu() {
  const theme = useTheme();
  const s = makeStyles(theme);
  const no = puzzleNumber();
  const [daily, setDaily] = useState(() => getDaily(no));
  const [streak, setStreak] = useState(() => getStreak(no));

  // Refresh progress whenever we come back to the menu.
  useFocusEffect(
    useCallback(() => {
      setDaily(getDaily(no));
      setStreak(getStreak(no));
    }, [no]),
  );

  const played = daily.filter(Boolean).length;
  const finished = played === ROUNDS_PER_DAY;
  const total = daily.reduce((sum, r) => sum + (r?.score ?? 0), 0);

  const go = (href: string) => {
    playSfx("tap");
    router.push(href as never);
  };

  const tiles: Tile[] = [
    { emoji: "🗺️", title: "Countries", subtitle: `${entriesFor("countries").length} in packs of 4`, href: "/continents" },
    { emoji: "🏝️", title: "Islands", subtitle: `${entriesFor("islands").length} small islands`, href: "/batches?pack=islands" },
    { emoji: "🌍", title: "The World", subtitle: "Split humanity in half", href: "/play?mode=single&pack=world&iso=WLD" },
    { emoji: "🏆", title: "Friends League", subtitle: "Private leaderboards", soon: "Invite friends with a link and compete on the daily. Coming soon." },
    { emoji: "💰", title: "Economy", subtitle: `Split the GDP · ${entriesFor("economy").length}`, href: "/batches?pack=economy" },
    { emoji: "💎", title: "Billionaires", subtitle: "Where the money lives", href: "/play?mode=single&pack=billionaires&iso=USA" },
  ];

  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.hero}>
          <Text style={s.logo}>
            GEO <Text style={{ color: theme.sideA }}>CH</Text>
            <Text style={{ color: theme.sideB }}>OP</Text>
          </Text>
          <Text style={s.tagline}>Measure twice, chop once.</Text>
        </View>

        <Pressable onPress={() => go("/play?mode=daily")} style={({ pressed }) => [s.daily, pressed && s.pressed]}>
          <View style={s.dailyTop}>
            <Text style={s.dailyKicker}>DAILY CHOP #{no}</Text>
            <Text style={s.streak}>🔥 {streak.current}</Text>
          </View>
          <Text style={s.dailyTitle}>{finished ? "Done for today" : played > 0 ? "Keep going" : "Today's 5 countries"}</Text>
          <Text style={s.dailySub}>
            {finished
              ? `${total.toFixed(1)} / ${ROUNDS_PER_DAY * 100} · tap to see & share`
              : played > 0
                ? `${played} of ${ROUNDS_PER_DAY} chopped`
                : "Same puzzle for everyone. One chop per country."}
          </Text>
          <View style={s.dailyBtn}>
            <Text style={s.dailyBtnText}>{finished ? "View results" : played > 0 ? "Resume" : "Play"}</Text>
          </View>
        </Pressable>

        <View style={s.grid}>
          {tiles.map((t) => (
            <Pressable
              key={t.title}
              onPress={() => {
                if (t.href) go(t.href);
                else {
                  playSfx("tap");
                  Alert.alert(t.title, t.soon);
                }
              }}
              style={({ pressed }) => [s.tile, t.soon && s.tileSoon, pressed && s.pressed]}
            >
              <Text style={s.tileEmoji}>{t.emoji}</Text>
              <Text style={s.tileTitle}>{t.title}</Text>
              <Text style={s.tileSub}>{t.subtitle}</Text>
              {t.soon && <Text style={s.soonBadge}>SOON</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={s.footer}>
          Best streak {streak.best} · {streak.played} dailies played
        </Text>
        <Pressable hitSlop={10} onPress={() => go("/credits")}>
          <Text style={s.credits}>Credits</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.paper },
    content: { padding: 20, gap: 18 },
    hero: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
    logo: { fontSize: 46, fontWeight: "900", letterSpacing: 2, color: t.ink },
    tagline: { marginTop: 2, color: t.muted, fontSize: 14, fontWeight: "600" },
    daily: { backgroundColor: t.card, borderRadius: 22, padding: 20, gap: 6, borderWidth: 1, borderColor: t.gridMajor },
    dailyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    dailyKicker: { color: t.gold, fontWeight: "900", letterSpacing: 1.5, fontSize: 13 },
    streak: { color: t.ink, fontWeight: "800", fontSize: 15 },
    dailyTitle: { color: t.ink, fontSize: 26, fontWeight: "900" },
    dailySub: { color: t.muted, fontSize: 14 },
    dailyBtn: { marginTop: 10, backgroundColor: t.sideA, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
    dailyBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 18, letterSpacing: 1 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    tile: {
      width: "47.9%",
      backgroundColor: t.card,
      borderRadius: 18,
      padding: 16,
      gap: 2,
      borderWidth: 1,
      borderColor: t.gridMajor,
    },
    tileSoon: { opacity: 0.55 },
    tileEmoji: { fontSize: 28, marginBottom: 6 },
    tileTitle: { color: t.ink, fontWeight: "900", fontSize: 17 },
    tileSub: { color: t.muted, fontSize: 13 },
    soonBadge: {
      position: "absolute",
      top: 12,
      right: 12,
      color: t.paper,
      backgroundColor: t.muted,
      fontSize: 10,
      fontWeight: "900",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: "hidden",
    },
    pressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
    footer: { textAlign: "center", color: t.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
    credits: { textAlign: "center", color: t.muted, fontSize: 11, opacity: 0.6, textDecorationLine: "underline" },
  });
