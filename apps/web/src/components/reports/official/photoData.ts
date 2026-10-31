import { fileUrl } from '@/lib/api';

/** A photograph's bytes for PDF and Word, scaled down to `maxPx` on its long side as JPEG; null when it cannot be read. */
export interface PhotoData {
  dataUrl: string;
  bytes: ArrayBuffer;
  width: number;
  height: number;
}

async function load(url: string, maxPx: number): Promise<PhotoData | null> {
  try {
    const res = await fetch(fileUrl(url));
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    const bytes = await (await fetch(dataUrl)).arrayBuffer();
    return { dataUrl, bytes, width, height };
  } catch {
    return null;
  }
}

/** Every photograph in the report, by its url, read once (missing ones are left out and keep their caption). */
export async function loadPhotos(urls: string[], maxPx = 1200): Promise<Map<string, PhotoData>> {
  const out = new Map<string, PhotoData>();
  const unique = [...new Set(urls)];
  const read = await Promise.all(unique.map((u) => load(u, maxPx)));
  unique.forEach((u, i) => read[i] && out.set(u, read[i]!));
  return out;
}
