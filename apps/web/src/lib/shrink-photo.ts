/** The longest side a photo is sent at, as the site app does (`apps/mobile/src/offline/shrink.ts`). */
const MAX_SIDE = 1600;
/** Photos smaller than this are sent as they are (bytes). */
const SHRINK_ABOVE = 1_500_000;

/**
 * A large JPEG, PNG or WebP photo made smaller before it is uploaded (a JPEG at most 1600 px on its longest side), so
 * it uploads quickly and Ask Nirmaan's photo checks take it. Anything else, or a browser that cannot draw it, is sent
 * as it is.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE || !/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
