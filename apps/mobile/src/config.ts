/** API base URL. Set EXPO_PUBLIC_API_URL to http://<LAN-IP>:4000/api when testing on a phone. */
const raw = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';
export const API_URL = raw.replace(/\/+$/, '');
/** Origin used to resolve relative attachment URLs (e.g. /uploads/...). */
export const API_ORIGIN = API_URL.replace(/\/api$/, '');

export function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}
