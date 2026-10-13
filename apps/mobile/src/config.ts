/**
 * API base URL. Defaults to the hosted demo API so the app works in Expo Go without setup.
 * Set EXPO_PUBLIC_API_URL to http://<LAN-IP>:4000/api to point at a local API instead.
 */
const raw = process.env.EXPO_PUBLIC_API_URL || 'https://construction-erp-api-pradeep15.vercel.app/api';
export const API_URL = raw.replace(/\/+$/, '');
/** Origin used to resolve relative attachment URLs (e.g. /uploads/...). */
export const API_ORIGIN = API_URL.replace(/\/api$/, '');

export function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}
