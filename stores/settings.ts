import { create } from 'zustand';
import { getSetting, setSetting } from '../lib/database';

interface SettingsState {
  anthropicApiKey: string;
  ownerName: string;
  isLoaded: boolean;
  load: () => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  setOwnerName: (name: string) => Promise<void>;
}

export const useSettings = create<SettingsState>((set) => ({
  anthropicApiKey: '',
  ownerName: 'Owner',
  isLoaded: false,

  load: async () => {
    const [apiKey, ownerName] = await Promise.all([
      getSetting('anthropic_api_key'),
      getSetting('owner_name'),
    ]);
    set({
      anthropicApiKey: apiKey ?? process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '',
      ownerName: ownerName ?? 'Owner',
      isLoaded: true,
    });
  },

  setApiKey: async (key: string) => {
    await setSetting('anthropic_api_key', key);
    set({ anthropicApiKey: key });
  },

  setOwnerName: async (name: string) => {
    await setSetting('owner_name', name);
    set({ ownerName: name });
  },
}));
