import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { OutboxPhoto } from './types';

const DIR = `${FileSystem.documentDirectory ?? ''}outbox/`;

/**
 * Copy a picked photo into the app's document directory. Image picker results live in a cache
 * folder the OS may purge, and a queued entry can wait for days.
 */
export async function persistPhoto(itemId: string, index: number, photo: { uri: string; name: string; type: string }): Promise<OutboxPhoto> {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory || photo.uri.startsWith(DIR)) return { uri: photo.uri, name: photo.name, type: photo.type };
  const ext = photo.name.includes('.') ? photo.name.slice(photo.name.lastIndexOf('.')) : '.jpg';
  const target = `${DIR}${itemId}-${index}${ext}`;
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    await FileSystem.copyAsync({ from: photo.uri, to: target });
    return { uri: target, name: photo.name, type: photo.type };
  } catch (e) {
    console.warn('[offline] could not copy photo, keeping original uri', e);
    return { uri: photo.uri, name: photo.name, type: photo.type };
  }
}

/** Remove the copies made for an item once it is synced or discarded. */
export async function removePhotos(photos: OutboxPhoto[]) {
  if (Platform.OS === 'web') return;
  await Promise.all(
    photos
      .filter((p) => p.uri.startsWith(DIR))
      .map((p) => FileSystem.deleteAsync(p.uri, { idempotent: true }).catch(() => undefined)),
  );
}

/** Is the queued photo still on the phone? (A copy that failed falls back to the picker's cache, which the OS may clear.) */
export async function photoExists(uri: string) {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) return true;
  try {
    return (await FileSystem.getInfoAsync(uri)).exists;
  } catch {
    return true;
  }
}
