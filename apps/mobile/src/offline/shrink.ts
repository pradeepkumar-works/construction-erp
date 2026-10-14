import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest side of an uploaded site photo. Enough to read a measuring tape in the picture, small enough for 2G. */
const MAX_SIDE = 1600;

/**
 * Re-encode a picked photo as a JPEG of at most MAX_SIDE pixels on its longest side. Phone cameras now take
 * 12 to 50 megapixel pictures; uploads above about 4 MB are refused by the hosted API, and HEIC from iPhones
 * does not show in browsers. Falls back to the original when the image cannot be read.
 */
export async function shrinkPhoto(photo: { uri: string; width?: number; height?: number; name: string; type: string }) {
  if (Platform.OS === 'web') return photo;
  try {
    const w = photo.width ?? 0;
    const h = photo.height ?? 0;
    const ctx = ImageManipulator.manipulate(photo.uri);
    if (!w || !h || Math.max(w, h) > MAX_SIDE) ctx.resize(w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE });
    const image = await ctx.renderAsync();
    const out = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    const base = photo.name.includes('.') ? photo.name.slice(0, photo.name.lastIndexOf('.')) : photo.name;
    return { ...photo, uri: out.uri, width: out.width, height: out.height, name: `${base}.jpg`, type: 'image/jpeg' };
  } catch (e) {
    console.warn('[photos] could not shrink photo, sending the original', e);
    return photo;
  }
}
