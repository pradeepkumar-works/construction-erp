/** Settings › Company: the logo printed on the letterhead (ARCHITECTURE "Company settings"). */

/** The largest logo, in bytes once decoded: enough for a sharp mark on A4, small enough to send with every print. */
export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** The bytes a base64 data URL holds. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** What is wrong with a logo, or null: a PNG, JPEG or WebP data URL of 200 KB at most. */
export function logoProblem(dataUrl: string): string | null {
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) return 'Choose a PNG, JPEG or WebP image';
  if (!(LOGO_TYPES as readonly string[]).includes(m[1])) return 'Choose a PNG, JPEG or WebP image; an SVG or PDF will not do';
  if (dataUrlBytes(dataUrl) > LOGO_MAX_BYTES) return 'Choose a logo of 200 KB or less';
  return null;
}
