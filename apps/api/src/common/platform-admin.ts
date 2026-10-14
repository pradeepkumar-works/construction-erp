/** Nirmaan staff who may use the platform console: PLATFORM_ADMIN_EMAILS, comma-separated. Unset = nobody. */
export function isPlatformAdmin(email: string): boolean {
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
