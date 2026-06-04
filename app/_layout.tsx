import '../global.css';
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getDb } from '../lib/database';
import { useSettings } from '../stores/settings';

export default function RootLayout() {
  const loadSettings = useSettings(s => s.load);

  useEffect(() => {
    getDb().then(() => loadSettings());
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="session/new"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="session/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="review/[id]"
          options={{ headerShown: false }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
