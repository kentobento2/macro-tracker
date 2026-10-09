import AsyncStorage from '@react-native-async-storage/async-storage';

// Device-local JSON storage. Failures (private mode, quota) degrade to "no cache", never crash.

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best effort.
  }
}

export async function removeKeys(prefix: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(prefix)));
  } catch {
    // Best effort.
  }
}

export const userKeyPrefix = (userId: string) => `mt:v1:${userId}:`;
