import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

export type TranscriptionResult = {
  text: string;
  startTime: number;
  endTime: number;
};

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

let recording: Audio.Recording | null = null;
let recordingStartTime = 0;
let pausedDuration = 0;
let pauseStartTime = 0;

export async function requestAudioPermissions(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

export async function startRecording(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording: rec } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );
  recording = rec;
  recordingStartTime = Date.now();
  pausedDuration = 0;
}

export async function pauseRecording(): Promise<void> {
  if (!recording) return;
  await recording.pauseAsync();
  pauseStartTime = Date.now();
}

export async function resumeRecording(): Promise<void> {
  if (!recording) return;
  await recording.startAsync();
  pausedDuration += Date.now() - pauseStartTime;
}

export async function stopRecording(): Promise<string | null> {
  if (!recording) return null;
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  recording = null;

  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  return uri ?? null;
}

export function getRecordingElapsed(): number {
  if (!recording) return 0;
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
