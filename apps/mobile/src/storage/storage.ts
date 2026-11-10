/**
 * Saving data on the device (step 6).
 *
 * AsyncStorage is a simple key → text store: files on iOS / Android,
 * localStorage in a web browser. We store JSON, one key per kind of data,
 * each with a version number so a future format change can be detected
 * (an unknown version is ignored rather than crashing the app).
 *
 * Writes are "fire and forget": a failed save must never block the game.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'maitremot/';
const VERSION = 1;

interface Envelope<T> {
  readonly version: number;
  readonly data: T;
}

export async function load<T>(key: string): Promise<T | null> {
  try {
    const text = await AsyncStorage.getItem(PREFIX + key);
    if (!text) return null;
    const envelope = JSON.parse(text) as Envelope<T>;
    return envelope.version === VERSION ? envelope.data : null;
  } catch {
    return null; // unreadable data: start fresh
  }
}

export function save<T>(key: string, data: T | null): void {
  const write =
    data === null
      ? AsyncStorage.removeItem(PREFIX + key)
      : AsyncStorage.setItem(PREFIX + key, JSON.stringify({ version: VERSION, data }));
  write.catch(() => undefined);
}
