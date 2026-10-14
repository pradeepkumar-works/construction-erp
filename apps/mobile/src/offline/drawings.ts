import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import type { AttachmentDto } from '@erp/shared';
import { absoluteUrl } from '../config';

/**
 * Drawings kept on the phone for sites without a signal. Files live in the app's document directory named by
 * attachment id; an index per project remembers which ones were saved, so a superseded revision's file is removed
 * the next time the project's drawings are saved.
 */
const DIR = `${FileSystem.documentDirectory ?? ''}drawings/`;
const INDEX = `${DIR}index.json`;
const supported = Platform.OS !== 'web' && !!FileSystem.documentDirectory;

const extOf = (a: AttachmentDto) => (a.fileName.includes('.') ? a.fileName.slice(a.fileName.lastIndexOf('.')).toLowerCase() : a.mimeType === 'application/pdf' ? '.pdf' : '.jpg');
export const localUri = (a: AttachmentDto) => `${DIR}${a.id}${extOf(a)}`;
export const canSaveOffline = supported;

async function readIndex(): Promise<Record<string, string[]>> {
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(INDEX)) as Record<string, string[]>;
  } catch {
    return {};
  }
}

/** Attachment ids saved on this phone. */
export async function savedFileIds(): Promise<Set<string>> {
  if (!supported) return new Set();
  try {
    const names = await FileSystem.readDirectoryAsync(DIR);
    return new Set(names.filter((n) => n !== 'index.json').map((n) => n.replace(/\.[^.]+$/, '')));
  } catch {
    return new Set();
  }
}

/**
 * Save the given files for a project and remove the project's files that are no longer current.
 * Returns how many were downloaded and how many failed.
 */
export async function saveProjectFiles(projectId: string, files: AttachmentDto[], onProgress?: (done: number, total: number) => void) {
  if (!supported) return { saved: 0, failed: 0 };
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
  const have = await savedFileIds();
  const todo = files.filter((f) => !have.has(f.id));
  let saved = 0;
  let failed = 0;
  for (const [i, f] of todo.entries()) {
    try {
      const res = await FileSystem.downloadAsync(absoluteUrl(f.url), localUri(f));
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      saved += 1;
    } catch {
      failed += 1;
      await FileSystem.deleteAsync(localUri(f), { idempotent: true }).catch(() => undefined);
    }
    onProgress?.(i + 1, todo.length);
  }
  // Superseded files of this project go; files another project still lists stay.
  const index = await readIndex();
  const keep = new Set(files.map((f) => f.id));
  const elsewhere = new Set(Object.entries(index).flatMap(([p, ids]) => (p === projectId ? [] : ids)));
  const names = await FileSystem.readDirectoryAsync(DIR).catch(() => [] as string[]);
  for (const n of names) {
    const id = n.replace(/\.[^.]+$/, '');
    if (n !== 'index.json' && (index[projectId] ?? []).includes(id) && !keep.has(id) && !elsewhere.has(id)) await FileSystem.deleteAsync(`${DIR}${n}`, { idempotent: true }).catch(() => undefined);
  }
  index[projectId] = [...keep];
  await FileSystem.writeAsStringAsync(INDEX, JSON.stringify(index)).catch(() => undefined);
  return { saved, failed };
}

/**
 * Open a PDF: from the phone when saved (Android hands it to a PDF viewer, iOS shows the preview sheet), else online.
 * Images are shown in the app by the caller.
 */
export async function openPdf(a: AttachmentDto, saved: boolean) {
  if (saved && supported) {
    if (Platform.OS === 'android') {
      const data = await FileSystem.getContentUriAsync(localUri(a));
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data, flags: 1, type: a.mimeType });
      return;
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localUri(a), { mimeType: a.mimeType, UTI: 'com.adobe.pdf' });
      return;
    }
  }
  await WebBrowser.openBrowserAsync(absoluteUrl(a.url));
}
