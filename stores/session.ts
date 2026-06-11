import { create } from 'zustand';
import { TranscriptLine, Session } from '../types';

interface ActiveSessionState {
  sessionId: string | null;
  isRecording: boolean;
  isPaused: boolean;
  currentContextId: string | null;
  currentContextName: string | null;
  participantIds: string[];
  transcriptLines: TranscriptLine[];
  elapsedSeconds: number;

  startSession: (id: string, contextId: string | null, contextName: string | null, participantIds: string[]) => void;
  stopSession: () => void;
  /**
   * ADR-008: THE liveness test. This store is in-memory only (no persistence),
   * so after a cold start it is empty — a persisted 'recording'/'paused' status
   * alone can never look live. Live capture and the red Home banner may only
   * engage when this returns true; everything else is a corpse to recover.
   */
  isLiveSession: (id: string) => boolean;
  pauseSession: () => void;
  resumeSession: () => void;
  addTranscriptLine: (line: TranscriptLine) => void;
  updateContext: (contextId: string, contextName: string) => void;
  setElapsed: (seconds: number) => void;
  reset: () => void;
}

export const useActiveSession = create<ActiveSessionState>((set, get) => ({
  sessionId: null,
  isRecording: false,
  isPaused: false,
  currentContextId: null,
  currentContextName: null,
  participantIds: [],
  transcriptLines: [],
  elapsedSeconds: 0,

  startSession: (id, contextId, contextName, participantIds) =>
    set({ sessionId: id, isRecording: true, isPaused: false, currentContextId: contextId, currentContextName: contextName, participantIds, transcriptLines: [], elapsedSeconds: 0 }),

  stopSession: () => set({ isRecording: false }),

  isLiveSession: (id) => {
    const s = get();
    return s.sessionId === id && s.isRecording;
  },

  pauseSession: () => set({ isPaused: true }),

  resumeSession: () => set({ isPaused: false }),

  addTranscriptLine: (line) => set((state) => ({ transcriptLines: [...state.transcriptLines, line] })),

  updateContext: (contextId, contextName) => set({ currentContextId: contextId, currentContextName: contextName }),

  setElapsed: (seconds) => set({ elapsedSeconds: seconds }),

  reset: () => set({
    sessionId: null, isRecording: false, isPaused: false,
    currentContextId: null, currentContextName: null,
    participantIds: [], transcriptLines: [], elapsedSeconds: 0,
  }),
}));
