/** Organisation onboarding: sign-up, invites and password links. */

export const MIN_PASSWORD_LENGTH = 8;
/** An invite link stays valid for a week, a reset link for two hours. */
export const INVITE_LINK_HOURS = 24 * 7;
export const RESET_LINK_HOURS = 2;

/** A short organisation code from its name ("Sai Ram Constructions Pvt Ltd" -> "SAIRAMCONS"); the API adds digits if taken. */
export function orgCodeFrom(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP', 'AND', 'THE', 'CO', 'INC'].includes(w));
  const code = words.join('').slice(0, 10);
  return code.length >= 3 ? code : (code + 'ORG').slice(0, 10);
}

/** The first-week checklist an admin sees on the dashboard until every step is done (GET /dashboard/getting-started). */
export const GETTING_STARTED_STEPS = ['PROJECT', 'BOQ', 'ACTIVITIES', 'TEAM', 'MEMBERS', 'APPROVAL_RULES', 'FIRST_ENTRY', 'FIRST_APPROVAL'] as const;
export type GettingStartedStep = (typeof GETTING_STARTED_STEPS)[number];

export interface GettingStartedDto {
  steps: { key: GettingStartedStep; done: boolean }[];
  done: number;
  total: number;
  /** When the organisation was created, for "day N of your first week". */
  organizationCreatedAt: string;
}
