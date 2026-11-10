/**
 * Root layout (Expo Router): every file in src/app is a screen, and this
 * layout stacks them. The game screen draws its own header. Saved data is
 * loaded here, once, before the first screen appears.
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { loadHouseWords } from '../game/houseWords';
import { loadSoloGame } from '../game/session';
import { loadStats } from '../game/stats';
import { colors } from '../ui/theme';

export default function RootLayout() {
  // Restore what was saved on the device before showing any screen.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.allSettled([loadSoloGame(), loadHouseWords(), loadStats()]).then(() =>
      setReady(true),
    );
  }, []);
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'MaitreMot' }} />
        <Stack.Screen name="game" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </>
  );
}
