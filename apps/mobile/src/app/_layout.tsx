/**
 * Root layout (Expo Router): every file in src/app is a screen, and this
 * layout stacks them. The game screen draws its own header.
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../ui/theme';

export default function RootLayout() {
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
