import { useEffect } from "react";
import { View } from "react-native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { initSfx } from "@/audio/sfx";
import { FONT_ASSETS } from "@/ui/fonts";

const BG = "#0C0F15";

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONT_ASSETS);

  useEffect(() => {
    initSfx();
  }, []);

  // Fonts load in a moment; show the plain background until then (no flash of fallback text).
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: BG }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
