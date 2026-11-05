import {
  MAX_APPROVAL_LEVELS,
  ROLE_LABELS,
  SUBMISSION_TYPES,
  approverOf,
  defaultApproverRoles,
  hasAmount,
  isGuest,
  levelsNeeded,
  ownEntryProblem,
  positionApprover,
  roleApprover,
  type ApprovalRightDto,
  type ApprovalStepAction,
  type ApproverKey,
  type RoleKey,
  type SubmissionType,
} from '@erp/shared';

/**
 * Approval levels, as pure functions over the organisation's rules and one entry's steps, so the queue,
 * the review endpoint, the stage card and the escalation job all decide alike (tested in scripts/approval-levels-test).
 */

/** One rule of the matrix: a role or a position approves a type at a level, up to `maxAmount`; levels 2 to 6 apply from `minAmount`. */
export interface LevelRule {
  approver: ApproverKey;
  type: SubmissionType;
  level: number;
  maxAmount: string | null;
  minAmount: string | null;
}

/** One step of the entry's current round (since it was last submitted). */
export interface LevelStep {
  level: number;
  action: ApprovalStepAction;
  actorId: string | null;
  /** The approver the actor decided for, while they were away */
  onBehalfOfId?: string | null;
  createdAt: Date;
}

export interface Stage {
  /** Levels the entry needs at its amount */
  levels: number;
  /** The level waiting for a decision */
  level: number;
  /** It waited past its escalation time at this level */
  escalated: boolean;
  /** Reminded at this level already */
  reminded: boolean;
  /** Who approved earlier levels of this round, and whom they approved for */
  approvedBy: string[];
  /** Who submitted this round: they never decide it */
  submittedBy: string | null;
  /** Since when it has waited at this level */
  since: Date;
}

/** A position someone holds: on one project, or at head office (projectId null), where it counts on every project. */
export interface Holding {
  userId: string;
  positionCode: string;
  projectId: string | null;
}

/** One person whose approvals count on an entry: their role and the positions they hold where it is. */
export interface Approver {
  id: string;
  roleKey: RoleKey;
  keys: ApproverKey[];
}

/** Who is deciding: themselves, and each person whose approvals they hold while that person is away. */
export interface Decider extends Approver {
  actingFor: Approver[];
}

/** The fixed rule, as rules: the approver roles (and QA/QC for inspections) approve every type at one level, no limit. */
const FIXED_RULES: LevelRule[] = SUBMISSION_TYPES.flatMap((type) => defaultApproverRoles(type).map((r) => ({ approver: roleApprover(r), type, level: 1, maxAmount: null, minAmount: null })));

/** The matrix in force: the organisation's rules, or the fixed rule while it has none. */
const inForce = (rules: LevelRule[]) => (rules.length ? rules : FIXED_RULES);

/**
 * The keys a user decides an entry of `projectId` by: their role and their positions there or at head office, and the
 * same for each person who handed them their approvals (`actingFor`, active delegations). `projectId` null counts every
 * position, for what the user might decide anywhere. Admin's right to decide everything is a safety net, not passed on.
 */
export function approverKeys(user: { id: string; roleKey: RoleKey }, projectId: string | null, holdings: Holding[], actingFor: { id: string; roleKey: RoleKey }[] = []): Decider {
  const keysOf = (p: { id: string; roleKey: RoleKey }, delegated: boolean): ApproverKey[] => [
    ...new Set([
      ...(delegated && p.roleKey === 'ADMIN' ? [] : [roleApprover(p.roleKey)]),
      ...holdings.filter((h) => h.userId === p.id && (h.projectId === null || projectId === null || h.projectId === projectId)).map((h) => positionApprover(h.positionCode)),
    ]),
  ];
  const others = [...new Map(actingFor.filter((a) => a.id !== user.id).map((a) => [a.id, a])).values()];
  return { id: user.id, roleKey: user.roleKey, keys: keysOf(user, false), actingFor: others.map((a) => ({ id: a.id, roleKey: a.roleKey, keys: keysOf(a, true) })) };
}

/** Where an entry stands: `round` is when `submittedBy` last submitted it; `steps` are that round's. */
export function stageOf(type: SubmissionType, rules: LevelRule[], amount: string | number | null, round: Date, steps: LevelStep[], submittedBy: string | null): Stage {
  const higher = rules.filter((r) => r.type === type && r.level > 1).map((r) => ({ level: r.level, minAmount: r.minAmount }));
  const levels = levelsNeeded(type, higher, amount);
  const approved = steps.filter((s) => s.action === 'APPROVED').sort((a, b) => a.level - b.level);
  const level = Math.min(approved.length + 1, levels);
  const last = approved.length ? approved[approved.length - 1].createdAt : round;
  return {
    levels,
    level,
    escalated: steps.some((s) => s.action === 'ESCALATED' && s.level === level),
    reminded: steps.some((s) => s.action === 'REMINDED' && s.level === level),
    approvedBy: [...new Set(approved.flatMap((s) => [s.actorId, s.onBehalfOfId ?? null].filter((id): id is string => !!id)))],
    submittedBy,
    since: last > round ? last : round,
  };
}

const within = (maxAmount: string | null, type: SubmissionType, amount: string | number | null) =>
  maxAmount === null || amount === null || !hasAmount(type) || Number(amount) <= Number(maxAmount);

/** Roles and positions that approve `type` at `level` for this amount (the fixed rule's roles at level 1 while there is no matrix). */
export function levelKeys(type: SubmissionType, rules: LevelRule[], level: number, amount: string | number | null): ApproverKey[] {
  return [...new Set(inForce(rules).filter((r) => r.type === type && r.level === level && within(r.maxAmount, type, amount)).map((r) => r.approver))];
}

/** Who an entry waiting at `level` escalates to: the next level's approvers, or management above the top level. */
export function escalationKeys(type: SubmissionType, rules: LevelRule[], level: number): ApproverKey[] {
  const next = [...new Set(rules.filter((r) => r.type === type && r.level === level + 1).map((r) => r.approver))];
  return next.length ? next : [roleApprover('MANAGEMENT')];
}

/** Roles and positions whose queue the entry is in now (admin always may, and is left out). */
export function queueKeys(type: SubmissionType, rules: LevelRule[], amount: string | number | null, stage: Stage): ApproverKey[] {
  const keys = levelKeys(type, rules, stage.level, amount);
  const admin = roleApprover('ADMIN');
  return [...new Set([...keys, ...(stage.escalated ? escalationKeys(type, rules, stage.level) : [])])].filter((k) => k !== admin);
}

/** A key in words: the role's label, or the position's name in the company's list. */
export function approverName(key: ApproverKey, positionNames: Map<string, string>): string {
  const { roleKey, positionCode } = approverOf(key);
  return roleKey ? (ROLE_LABELS[roleKey] ?? roleKey) : (positionNames.get(positionCode!) ?? positionCode!);
}

/** What one person's keys let them do with the entry now; `none` when they approve nothing of this type. */
function decideAs(p: Approver, type: SubmissionType, rules: LevelRule[], amount: string | number | null, stage: Stage, of: string): { ok: boolean; reason: string | null; none: boolean } {
  const mine = inForce(rules).filter((r) => r.type === type && p.keys.includes(r.approver));
  const atLevel = mine.filter((r) => r.level === stage.level);
  if (atLevel.some((r) => within(r.maxAmount, type, amount))) return { ok: true, reason: null, none: false };
  if (stage.escalated && escalationKeys(type, rules, stage.level).some((k) => p.keys.includes(k))) return { ok: true, reason: null, none: false };
  if (atLevel.length) {
    const limit = Math.max(...atLevel.map((r) => Number(r.maxAmount)));
    return { ok: false, reason: `This needs a higher approver: ₹${Number(amount).toFixed(2)} is above your limit of ₹${limit}.`, none: false };
  }
  if (mine.length) {
    const lowest = Math.min(...mine.map((r) => r.level));
    return { ok: false, reason: lowest > stage.level ? `It is waiting for level ${stage.level} first${of}.` : `It has moved on to level ${stage.level}${of}, which another approver decides.`, none: false };
  }
  return { ok: false, reason: 'Your role and positions cannot approve this type of submission.', none: true };
}

/**
 * May this user decide the entry now? `reason` says why not, in words for the approver; `onBehalfOf` is whom they
 * decide it for when only a delegation lets them. Nobody decides an entry they made, or one made by someone they act
 * for; nobody decides a level after they, or someone they act for, approved an earlier one.
 */
export function mayDecide(
  user: Decider,
  type: SubmissionType,
  rules: LevelRule[],
  amount: string | number | null,
  stage: Stage,
): { ok: boolean; reason: string | null; onBehalfOf: string | null } {
  const no = (reason: string) => ({ ok: false, reason, onBehalfOf: null });
  const own = ownEntryProblem(stage.submittedBy, user.id);
  if (own) return no(own);
  if (user.actingFor.some((a) => a.id === stage.submittedBy)) return no('You approve for the person who made this entry while they are away, so another approver decides it.');
  if (user.roleKey === 'ADMIN') return { ok: true, reason: null, onBehalfOf: null };
  const of = stage.levels > 1 ? ` (level ${stage.level} of ${stage.levels})` : '';
  if (stage.approvedBy.includes(user.id)) return no(`You approved an earlier level; another approver decides this one${of}.`);
  if (user.actingFor.some((a) => stage.approvedBy.includes(a.id))) return no(`Someone you approve for approved an earlier level; another approver decides this one${of}.`);
  let why: { reason: string | null; none: boolean } | null = null;
  for (const p of [user, ...user.actingFor]) {
    const v = decideAs(p, type, rules, amount, stage, of);
    if (v.ok) return { ok: true, reason: null, onBehalfOf: p === user ? null : p.id };
    if (!why || (why.none && !v.none)) why = v;
  }
  return no(why!.reason!);
}

/** What the user approves at all, at any level, by their role, positions and delegations (the web's and phone's mirror). */
export function rightsOf(user: Decider, rules: LevelRule[]): ApprovalRightDto[] {
  // Admin decides every level of everything, so nothing is ever left without an approver.
  if (user.roleKey === 'ADMIN') return SUBMISSION_TYPES.flatMap((type) => Array.from({ length: MAX_APPROVAL_LEVELS }, (_, i) => (i ? { type, maxAmount: null, level: i + 1 } : { type, maxAmount: null })));
  if (isGuest(user.roleKey)) return [];
  const keys = new Set([...user.keys, ...user.actingFor.flatMap((a) => a.keys)]);
  const best = new Map<string, ApprovalRightDto>();
  for (const r of inForce(rules)) {
    if (!keys.has(r.approver)) continue;
    const k = `${r.type}:${r.level}`;
    const had = best.get(k);
    const max = !had ? r.maxAmount : had.maxAmount === null || r.maxAmount === null ? null : String(Math.max(Number(had.maxAmount), Number(r.maxAmount)));
    best.set(k, { type: r.type, maxAmount: max, ...(r.level > 1 ? { level: r.level } : {}) });
  }
  return [...best.values()].sort((a, b) => SUBMISSION_TYPES.indexOf(a.type) - SUBMISSION_TYPES.indexOf(b.type) || (a.level ?? 1) - (b.level ?? 1));
}
