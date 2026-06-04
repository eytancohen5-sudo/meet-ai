import { create } from 'zustand';
import { AuthUser, getCurrentUser, signOut } from '../lib/auth';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isOwner: boolean;
  isManager: boolean;
  hydrate: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isOwner: false,
  isManager: false,

  hydrate: async () => {
    set({ isLoading: true });
    try {
      const user = await getCurrentUser();
      set({
        user,
        isOwner: user?.role === 'owner',
        isManager: user?.role === 'owner' || user?.role === 'manager',
      });
    } catch {
      set({ user: null, isOwner: false, isManager: false });
    } finally {
      set({ isLoading: false });
    }
  },

  setUser: (user) => set({
    user,
    isOwner: user?.role === 'owner',
    isManager: user?.role === 'owner' || user?.role === 'manager',
  }),

  logout: async () => {
    await signOut();
    set({ user: null, isOwner: false, isManager: false });
  },
}));
