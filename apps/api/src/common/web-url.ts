/** The web app's address, from configuration only (safe to send to any signed-in user): WEB_URL, else the first CORS_ORIGINS entry. */
export function configuredWebUrl(): string | null {
  const trim = (u: string) => u.trim().replace(/\/+$/, '');
  if (process.env.WEB_URL) return trim(process.env.WEB_URL);
  const first = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).find(Boolean);
  return first ? trim(first) : null;
}
