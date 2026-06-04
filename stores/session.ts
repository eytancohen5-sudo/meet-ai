import { create } from 'zustand';
import { TranscriptLine, Session } from '../types';

interface ActiveSessionState {
  sessionId: string | null;
  isRecording: boolean;
  isPaused: boolean;
  currentLocationId: string | null;
  currentLocationName: string | null;
  participantIds: string[];
  transcriptLines: TranscriptLine[];
  elapsedSeconds: number;

  startSession: (id: string, locationId: string | null, locationName: string | null, participantIds: string[]) => void;
  stopSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  addTranscriptLine: (line: TranscriptLine) => void;
  updateLocation: (locationId: string, locationName: string) => void;
  setElapsed: (seconds: number) => void;
  reset: () => void;
}

export const useActiveSession = create<ActiveSessionState>((set) => ({
  sessionId: null,
  isRecording: false,
  isPaused: false,
  currentLocationId: null,
  currentLocationName: null,
  participantIds: [],
  transcriptLines: [],
  elapsedSeconds: 0,

  startSession: (id, locationId, locationName, participantIds) =>
    set({ sessionId: id, isRecording: true, isPaused: false, currentLocationId: locationId, currentLocationName: locationName, participantIds, transcriptLines: [], elapsedSeconds: 0 }),

  stopSession: () => set({ isRecording: false }),

  pauseSession: () => set({ isPaused: true }),

  resumeSession: () => set({ isPaused: false }),

  addTranscriptLine: (line) => set((state) => ({ transcriptLines: [...state.transcriptLines, line] })),

  updateLocation: (locationId, locationName) => set({ currentLocationId: locationId, currentLocationName: locationName }),

  setElapsed: (seconds) => set({ elapsedSeconds: seconds }),

  reset: () => set({
    sessionId: null, isRecording: false, isPaused: false,
    currentLocationId: null, currentLocationName: null,
    participantIds: [], transcriptLines: [], elapsedSeconds: 0,
  }),
}));
