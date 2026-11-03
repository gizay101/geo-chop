import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { initSfx } from "@/audio/sfx";

export default function RootLayout() {
  useEffect(() => {
    initSfx();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0C0F15" }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0C0F15" } }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
