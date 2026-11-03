import type { RoleKey } from './enums';
import { canManageStaff } from './permissions';

/**
 * Exit clearance (no dues; ARCHITECTURE "HR records"): before someone's full and final settlement is approved, each item
 * of the company's `exitClearance` master is cleared, set aside as not applicable, or found with dues that the
 * settlement recovers.
 */
export const CLEARANCE_STATES = ['PENDING', 'CLEARED', 'DUES', 'NOT_APPLICABLE'] as const;
export type ClearanceState = (typeof CLEARANCE_STATES)[number];
export const CLEARANCE_STATE_LABELS: Record<ClearanceState, string> = { PENDING: 'To clear', CLEARED: 'Cleared', DUES: 'Dues to recover', NOT_APPLICABLE: 'Not applicable' };

/** Who signs an item off: HR and admins, and the desks that hand things back (accounts, stores, the site's manager). */
export const canClearExit = (role: RoleKey) => canManageStaff(role) || role === 'ACCOUNTS_MANAGER' || role === 'STORE_MANAGER' || role === 'PROJECT_MANAGER';

export interface ClearanceFact {
  name: string;
  state: ClearanceState;
  /** Rupees to recover when the state is DUES */
  amount: number | null;
}

/** Why an item cannot be signed off that way, or null: dues need an amount and what it is for. */
export function clearanceLineProblem(state: ClearanceState, amount: number | null | undefined, note: string | null | undefined): string | null {
  if (state === 'DUES') {
    if (!amount || amount <= 0) return 'Enter the amount to recover';
    if (!note?.trim()) return 'Say what the dues are for, so the settlement can show it';
  }
  if (state === 'NOT_APPLICABLE' && !note?.trim()) return 'Say why it does not apply';
  if (state !== 'DUES' && amount) return 'Only dues carry an amount';
  return null;
}

/** What the settlement recovers for the dues found at clearance. */
export const clearanceDues = (lines: readonly ClearanceFact[]) => Math.round(lines.reduce((s, l) => s + (l.state === 'DUES' ? (l.amount ?? 0) : 0), 0) * 100) / 100;

/** Why the settlement cannot be approved yet, or null once every item is signed off one way or another. */
export function clearanceProblem(lines: readonly ClearanceFact[]): string | null {
  const open = lines.filter((l) => l.state === 'PENDING').map((l) => l.name);
  if (!open.length) return null;
  const shown = open.length > 3 ? [...open.slice(0, 2), `${open.length - 2} more`] : open;
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0];
  return `Clear the exit first: ${list} ${open.length === 1 ? 'is' : 'are'} still to clear. Open the person's Service and letters tab.`;
}

/** An employee's exit clearance: every item of the company's list, signed off or still to clear. */
export interface ExitClearanceDto {
  employeeId: string;
  /** Their last working day, once the exit is recorded */
  leftOn: string | null;
  lines: {
    code: string;
    name: string;
    state: ClearanceState;
    amount: string | null;
    note: string | null;
    clearedByName: string | null;
    clearedAt: string | null;
  }[];
  /** Rupees the settlement recovers for dues */
  dues: string;
  /** Why the settlement cannot be approved yet, or null */
  problem: string | null;
  canClear: boolean;
}
