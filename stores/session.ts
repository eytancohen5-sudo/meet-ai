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
  pauseSession: () => void;
  resumeSession: () => void;
  addTranscriptLine: (line: TranscriptLine) => void;
  updateContext: (contextId: string, contextName: string) => void;
  setElapsed: (seconds: number) => void;
  reset: () => void;
}

export const useActiveSession = create<ActiveSessionState>((set) => ({
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
