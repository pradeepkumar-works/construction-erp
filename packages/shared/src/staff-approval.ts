/**
 * Reporting lines: leave, overtime and attendance corrections go through two steps. A request waits first on the
 * employee's immediate manager, who recommends or rejects it, then on HR (a staff admin), who approves or rejects it.
 * The manager is the login of the person they report to (`Employee.reportingTo`) while that login is active, else the
 * posting project's manager, else no one (the request goes straight to HR). A manager who is a staff admin themselves
 * approves it outright. A rejection at either step ends it, and nobody decides their own request.
 */
import type { RoleKey } from './enums';
import { canManageStaff } from './permissions';
import { ownEntryProblem } from './approvals';

/** A login in someone's reporting line. `active` is false once that person left or their login is switched off. */
export interface LineLogin {
  userId: string;
  name: string;
  active: boolean;
}

/** An employee's reporting line, as the approvals read it. */
export interface StaffLine {
  /** The employee's own login */
  employeeUserId: string | null;
  /** The login of the person they report to */
  reportsTo: LineLogin | null;
  /** The manager of the project they are posted at */
  siteManager: LineLogin | null;
}

/** Where a request stands: waiting (`PENDING`, with `recommendedById` once the manager recommended it) or ended. */
export interface StaffRequestState {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  /** Whoever entered it for the employee (HR applying for someone), else null */
  appliedById: string | null;
  recommendedById: string | null;
}

export type StaffWait = { step: 'MANAGER'; by: LineLogin; as: 'REPORTS_TO' | 'SITE_MANAGER' } | { step: 'HR' };

/** Step 1's decider: the active login they report to, else the posting's project manager; never the employee. */
export function firstDecider(line: StaffLine): { by: LineLogin; as: 'REPORTS_TO' | 'SITE_MANAGER' } | null {
  const usable = (l: LineLogin | null) => !!l && l.active && l.userId !== line.employeeUserId;
  if (usable(line.reportsTo)) return { by: line.reportsTo!, as: 'REPORTS_TO' };
  if (usable(line.siteManager)) return { by: line.siteManager!, as: 'SITE_MANAGER' };
  return null;
}

/** Who a request waits on now, or null once it has ended. */
export function staffWaitsOn(req: StaffRequestState, line: StaffLine): StaffWait | null {
  if (req.status !== 'PENDING') return null;
  if (req.recommendedById) return { step: 'HR' };
  const first = firstDecider(line);
  return first ? { step: 'MANAGER', ...first } : { step: 'HR' };
}

/** "Ravi Kumar, their manager", "Ravi Kumar, the site's project manager", "HR". */
export function staffWaitWords(wait: StaffWait | null): string | null {
  if (!wait) return null;
  if (wait.step === 'HR') return 'HR';
  return `${wait.by.name}, ${wait.as === 'REPORTS_TO' ? 'their manager' : "the site's project manager"}`;
}

export type StaffDecision = 'APPROVE' | 'REJECT';
/** RECOMMENDED: the manager passed it on and it now waits on HR; APPROVED and REJECTED end it. */
export type StaffOutcome = { ok: true; result: 'RECOMMENDED' | 'APPROVED' | 'REJECTED' } | { ok: false; problem: string };

/** What a decision by `actor` does to a request, or why they may not take it. */
export function staffDecision(req: StaffRequestState, line: StaffLine, actor: { id: string; roleKey: RoleKey }, decision: StaffDecision): StaffOutcome {
  const no = (problem: string): StaffOutcome => ({ ok: false, problem });
  const wait = staffWaitsOn(req, line);
  if (!wait) return no('This has already been decided or cancelled.');
  if (line.employeeUserId === actor.id) return no('You cannot decide your own request.');
  const own = ownEntryProblem(req.appliedById, actor.id);
  if (own) return no(own);
  if (wait.step === 'MANAGER') {
    if (wait.by.userId !== actor.id) return no(`This waits on ${staffWaitWords(wait)}, first.`);
    if (decision === 'REJECT') return { ok: true, result: 'REJECTED' };
    return { ok: true, result: canManageStaff(actor.roleKey) ? 'APPROVED' : 'RECOMMENDED' };
  }
  if (!canManageStaff(actor.roleKey)) return no(req.recommendedById ? 'Recommended; HR approves it now.' : 'HR decides this.');
  return { ok: true, result: decision === 'REJECT' ? 'REJECTED' : 'APPROVED' };
}

/** Whether the request waits on `actor` now, and whether their approval only recommends it. */
export function staffTurn(req: StaffRequestState, line: StaffLine, actor: { id: string; roleKey: RoleKey }): { mine: boolean; recommends: boolean } {
  const out = staffDecision(req, line, actor, 'APPROVE');
  return { mine: out.ok, recommends: out.ok && out.result === 'RECOMMENDED' };
}
