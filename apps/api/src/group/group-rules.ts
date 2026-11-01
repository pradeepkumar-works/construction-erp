import { isGroupPlaceRole, type RoleKey } from '@erp/shared';

/**
 * Group companies (ARCHITECTURE "Group companies"): the rules for one sign-in across a group's companies,
 * pure so `src/scripts/group-companies-test.ts` can check them.
 */

/** A person's place in one company: their user there. */
export interface PlaceRow {
  id: string;
  organizationId: string;
  isActive: boolean;
  /** The company is suspended (nobody signs in) */
  suspended: boolean;
  createdAt: Date;
}

/**
 * The user a sign-in lands as: an active place, in the company used last when it is still open, else the first one made.
 * A suspended company is chosen only when every place is in one, so the sign-in says it is suspended. Null: no active place.
 */
export function pickPlace(rows: readonly PlaceRow[], lastOrganizationId: string | null): PlaceRow | null {
  const active = rows.filter((r) => r.isActive);
  if (!active.length) return null;
  const open = active.filter((r) => !r.suspended);
  if (!open.length) return active[0];
  return open.find((r) => r.organizationId === lastOrganizationId) ?? [...open].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
}

/** Where a new user's email stands against the companies it already signs in to. */
export type EmailUse = 'NEW' | 'HERE' | 'SISTER' | 'ELSEWHERE';

/**
 * NEW: nobody signs in with it. HERE: it already has a user in this company. SISTER: every company it signs in to is in
 * this company's group, so the person gets a place here on the same sign-in. ELSEWHERE: it belongs to another company.
 */
export function emailUse(places: readonly { organizationId: string; groupId: string | null }[], here: { organizationId: string; groupId: string | null }): EmailUse {
  if (!places.length) return 'NEW';
  if (places.some((p) => p.organizationId === here.organizationId)) return 'HERE';
  if (here.groupId && places.every((p) => p.groupId === here.groupId)) return 'SISTER';
  return 'ELSEWHERE';
}

/** Why a group admin cannot give this place, or null. */
export function placeProblem(p: { roleKey: RoleKey; companyInGroup: boolean; personInGroup: boolean; existingActive: boolean }): string | null {
  if (!p.companyInGroup) return 'Choose a company of this group';
  if (!p.personInGroup) return 'Choose someone who works in a company of this group';
  if (!isGroupPlaceRole(p.roleKey)) return "Invite client engineers, consultants and suppliers from the company's own pages";
  if (p.existingActive) return 'They already work in this company. Change their role from its Users page.';
  return null;
}

/** Why the group's admins cannot change like this, or null. */
export function adminChangeProblem(p: { adminCount: number; isAdmin: boolean; makeAdmin: boolean }): string | null {
  if (!p.makeAdmin && p.isAdmin && p.adminCount <= 1) return 'The group needs an admin. Make someone else an admin first.';
  return null;
}

/**
 * A company's Users page changes a person's email or password only when they work nowhere else: both belong to their
 * one sign-in, which their other companies share. Null when the change may go ahead.
 */
export function sharedLoginProblem(otherCompanies: readonly string[], what: 'email' | 'password'): string | null {
  if (!otherCompanies.length) return null;
  const names = otherCompanies.join(', ');
  return what === 'email'
    ? `They also sign in to ${names} with this email, so it cannot be changed from here.`
    : `They also sign in to ${names} with this password. Send them a reset link instead.`;
}
