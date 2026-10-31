/**
 * Slowing password guessing: failed sign-ins are counted per email and per address
 * over a window. An email with too many failures is locked for a while, whatever password comes next; an address
 * with too many, across any emails, is held off too. Reset-link requests are limited the same way. Pure, tested in
 * `src/scripts/login-guard-test.ts`.
 */

export const LOGIN_WINDOW_MINUTES = 15;
/** Failed sign-ins on one email in the window that lock it */
export const LOCK_AFTER_FAILURES = 5;
/** How long a locked email stays locked, from the failure that locked it */
export const LOCK_MINUTES = 15;
/** Failed sign-ins from one address in the window, across emails, before it is held off */
export const ADDRESS_FAILURES = 30;
/** Reset links one email or one address may ask for in an hour */
export const RESET_PER_EMAIL_HOUR = 5;
export const RESET_PER_ADDRESS_HOUR = 20;

const MINUTE = 60_000;

export interface LoginBlock {
  /** Locked email, or an address making too many tries */
  reason: 'ACCOUNT' | 'ADDRESS';
  until: Date;
}

/**
 * Whether a sign-in is refused before its password is checked. `emailFailures` and `addressFailures` are the times of
 * failed sign-ins, any order; only those inside the window count.
 */
export function loginBlock(f: { emailFailures: Date[]; addressFailures: Date[]; now: Date }): LoginBlock | null {
  const from = f.now.getTime() - LOGIN_WINDOW_MINUTES * MINUTE;
  const recent = (ds: Date[]) => ds.filter((d) => d.getTime() > from).sort((a, b) => a.getTime() - b.getTime());
  const email = recent(f.emailFailures);
  if (email.length >= LOCK_AFTER_FAILURES) {
    // Locked from the failure that reached the limit; later failures (while locked, refused before the password) add none.
    const until = new Date(email[LOCK_AFTER_FAILURES - 1].getTime() + LOCK_MINUTES * MINUTE);
    if (until > f.now) return { reason: 'ACCOUNT', until };
  }
  const address = recent(f.addressFailures);
  if (address.length >= ADDRESS_FAILURES) return { reason: 'ADDRESS', until: new Date(address[address.length - ADDRESS_FAILURES].getTime() + LOGIN_WINDOW_MINUTES * MINUTE) };
  return null;
}

/** Whether one more reset link may be sent: under the hourly limit for the email and for the address. */
export function resetAllowed(f: { emailRequests: Date[]; addressRequests: Date[]; now: Date }): boolean {
  const from = f.now.getTime() - 60 * MINUTE;
  const n = (ds: Date[]) => ds.filter((d) => d.getTime() > from).length;
  return n(f.emailRequests) < RESET_PER_EMAIL_HOUR && n(f.addressRequests) < RESET_PER_ADDRESS_HOUR;
}

/** The refusal people read: when to try again, and the way out. */
export function blockMessage(b: LoginBlock, at: (d: Date) => string): string {
  return b.reason === 'ACCOUNT'
    ? `Too many wrong passwords for this email. Try again after ${at(b.until)}, or reset your password with "Forgot password".`
    : `Too many sign-in attempts from this network. Try again after ${at(b.until)}.`;
}
