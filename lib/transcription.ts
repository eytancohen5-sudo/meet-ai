import * as FileSystem from 'expo-file-system/legacy';

export type TranscriptionResult = {
  text: string;
  startTime: number;
  endTime: number;
};

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

// Timing helpers (still managed externally by the screen)
let recordingStartTime = 0;
let pausedDuration = 0;
let pauseStartTime = 0;

export function markRecordingStart() {
  recordingStartTime = Date.now();
  pausedDuration = 0;
}

export function markPauseStart() {
  pauseStartTime = Date.now();
}

export function markResumed() {
  pausedDuration += Date.now() - pauseStartTime;
}

export function getRecordingElapsed(): number {
  if (!recordingStartTime) return 0;
  return (Date.now() - recordingStartTime - pausedDuration) / 1000;
}

export async function saveAudioToDocuments(uri: string, sessionId: string): Promise<string> {
  const dest = `${FileSystem.documentDirectory}sessions/${sessionId}.m4a`;
  await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}sessions/`, { intermediates: true });
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
