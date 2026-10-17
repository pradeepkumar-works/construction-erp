import { Platform } from 'react-native';

/**
 * Small values read synchronously at start-up or on a screen's first frame (appearance, language, form drafts):
 * expo-sqlite's key-value store on the phone, localStorage on web. Every call swallows storage errors, so a phone
 * without storage behaves as if nothing was saved.
 */
function store() {
  // Required lazily so the web bundle never evaluates the native module (as in src/offline/db.ts).
  return (require('expo-sqlite/kv-store') as typeof import('expo-sqlite/kv-store')).Storage;
}

export function kvGet(key: string): string | null {
  try {
    return Platform.OS === 'web' ? (globalThis.localStorage?.getItem(key) ?? null) : store().getItemSync(key);
  } catch {
    return null;
  }
}

export function kvSet(key: string, value: string) {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value);
    else store().setItemSync(key, value);
  } catch {
    // Storage unavailable: nothing is kept.
  }
}

export function kvRemove(key: string) {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(key);
    else store().removeItemSync(key);
  } catch {
    // Storage unavailable.
  }
}
