/*
 * SafeAreaView edges for tab screens — bottom is deliberately omitted because
 * the tab bar owns the bottom inset. Under the new architecture (Fabric),
 * react-native-safe-area-context applies full-WINDOW insets regardless of the
 * view's position on screen, so a default bottom edge would add a ~34pt dead
 * strip above the 85pt tab bar.
 *
 * Modal / pageSheet / presented SafeAreaViews intentionally keep their DEFAULT
 * edges — detached hierarchies fall back to position-aware self insets. Do not
 * "fix" them to use this constant.
 *
 * app/places.tsx (a full-screen stack push) shares this set — pre-existing,
 * deliberate behavior.
 */
export const TAB_SCREEN_EDGES = ['top', 'left', 'right'] as const;
