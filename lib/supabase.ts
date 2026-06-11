import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// Secure token storage adapter for React Native
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let client: SupabaseClient | null = null;

/**
 * Lazy, guarded Supabase client accessor.
 *
 * MUST stay lazy: expo-router eagerly loads the shelved app/(member)/ route
 * graph at startup, which pulls this module in. A module-scope createClient()
 * with empty env values (Release bundles export with EXPO_NO_DOTENV=1) throws
 * "supabaseUrl is required." before any UI renders and kills the app
 * (sentinel T11-1). Env values are therefore read and validated only when a
 * shelved Supabase feature actually invokes this getter — never at module load.
 *
 * The multi-user layer is shelved; if it is ever un-shelved, the env-var
 * sourcing strategy must go back to sentinel first (T0 ENV-5).
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. The multi-user layer is shelved; set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY before using Supabase features.'
    );
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // handled manually via deep link
    },
  });

  return client;
}
