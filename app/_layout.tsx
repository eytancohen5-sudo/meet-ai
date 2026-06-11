import '../global.css';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getDb } from '../lib/database';
import { useSettings } from '../stores/settings';

export default function RootLayout() {
  const loadSettings = useSettings(s => s.load);
  const [dbError, setDbError] = useState<string | null>(null);

  // T6 cold-start hardening: if open/migrate fails, surface a visible error
  // instead of a silent dead app. getDb() clears its promise cache on
  // rejection, so Retry genuinely re-attempts open+migrate.
  const initDb = useCallback(() => {
    setDbError(null);
    getDb()
      .then(() => {
        loadSettings();
      })
      .catch((err: unknown) => {
        setDbError(err instanceof Error ? err.message : String(err));
      });
  }, [loadSettings]);

  useEffect(() => {
    initDb();
  }, []);

  if (dbError !== null) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <View className="flex-1 items-center justify-center bg-bg px-8">
          <Text className="text-lg font-semibold text-recording mb-3 text-center">
            The app's data store failed to open
          </Text>
          <Text className="text-sm text-text-secondary text-center mb-2">
            Meet AI could not open its local database, so your sessions and
            settings are unavailable. Try again, or close and relaunch the app.
          </Text>
          <Text className="text-xs text-text-tertiary text-center mb-6">
            {dbError}
          </Text>
          <Pressable
            onPress={initDb}
            className="bg-brand-600 rounded-xl px-6 py-3 active:opacity-80"
          >
            <Text className="text-white font-semibold">Try again</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* Pre-flight half-height sheet (Phase 3 screen 5). Larger detent lets
            iOS expand the sheet when the keyboard appears for inline inputs. */}
        <Stack.Screen
          name="session/new"
          options={{
            presentation: 'formSheet',
            headerShown: false,
            sheetAllowedDetents: [0.5, 0.95],
            sheetInitialDetentIndex: 0,
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
        {/* gestureEnabled:false (R4): the live capture screen must never be
            leavable via the iOS back-swipe — unmount releases the recorder, and
            remounting from the Home banner would re-init capture over the
            session's audio (the ADR-008 overwrite class). The live layout has
            its own exits (Stop sheet, fatal-error End); the read-only
            recovery/pending layouts re-enable the gesture inline. */}
        <Stack.Screen
          name="session/[id]"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="review/[id]"
          options={{ headerShown: false }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
