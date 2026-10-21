import { defaultApproverRoles, hasAmount, levelsNeeded, type ApprovalStepAction, type RoleKey, type SubmissionType } from '@erp/shared';

/**
 * Approval levels (v5 item 94), as pure functions over the organisation's rules and one entry's steps, so the queue,
 * the review endpoint, the stage card and the escalation job all decide alike (tested in scripts/approval-levels-test).
 */

/** One rule of the matrix: a role approves a type at a level, up to `maxAmount`; levels 2 and 3 apply from `minAmount`. */
export interface LevelRule {
  roleKey: RoleKey;
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
  /** Who approved earlier levels of this round */
  approvedBy: string[];
  /** Since when it has waited at this level */
  since: Date;
}

/** Where an entry stands: `round` is when it was last submitted; `steps` are that round's. */
export function stageOf(type: SubmissionType, rules: LevelRule[], amount: string | number | null, round: Date, steps: LevelStep[]): Stage {
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
    approvedBy: approved.flatMap((s) => (s.actorId ? [s.actorId] : [])),
    since: last > round ? last : round,
  };
}

const within = (maxAmount: string | null, type: SubmissionType, amount: string | number | null) =>
  maxAmount === null || amount === null || !hasAmount(type) || Number(amount) <= Number(maxAmount);

/** Roles that approve `type` at `level` for this amount: the matrix, or the fixed rule while there is none (level 1 only). */
export function levelRoles(type: SubmissionType, rules: LevelRule[], level: number, amount: string | number | null): RoleKey[] {
  if (!rules.length) return level === 1 ? defaultApproverRoles(type) : [];
  return [...new Set(rules.filter((r) => r.type === type && r.level === level && within(r.maxAmount, type, amount)).map((r) => r.roleKey))];
}

/** Who an entry waiting at `level` escalates to: the next level's roles, or management above the top level. */
export function escalationRoles(type: SubmissionType, rules: LevelRule[], level: number): RoleKey[] {
  const next = [...new Set(rules.filter((r) => r.type === type && r.level === level + 1).map((r) => r.roleKey))];
  return next.length ? next : ['MANAGEMENT'];
}

/** Roles whose queue the entry is in now (admin always may, and is left out). */
export function queueRoles(type: SubmissionType, rules: LevelRule[], amount: string | number | null, stage: Stage): RoleKey[] {
  const roles = levelRoles(type, rules, stage.level, amount);
  return [...new Set([...roles, ...(stage.escalated ? escalationRoles(type, rules, stage.level) : [])])].filter((r) => r !== 'ADMIN');
}

/** May this user decide the entry now? `reason` says why not, in words for the approver. */
export function mayDecide(
  user: { id: string; roleKey: RoleKey },
  type: SubmissionType,
  rules: LevelRule[],
  amount: string | number | null,
  stage: Stage,
): { ok: boolean; reason: string | null } {
  if (user.roleKey === 'ADMIN') return { ok: true, reason: null };
  const of = stage.levels > 1 ? ` (level ${stage.level} of ${stage.levels})` : '';
  if (stage.approvedBy.includes(user.id)) return { ok: false, reason: `You approved an earlier level; another approver decides this one${of}.` };
  const own: { level: number; maxAmount: string | null }[] = rules.length
    ? rules.filter((r) => r.type === type && r.roleKey === user.roleKey)
    : defaultApproverRoles(type).includes(user.roleKey)
      ? [{ level: 1, maxAmount: null }]
      : [];
  const atLevel = own.find((r) => r.level === stage.level);
  if (atLevel && within(atLevel.maxAmount, type, amount)) return { ok: true, reason: null };
  if (stage.escalated && escalationRoles(type, rules, stage.level).includes(user.roleKey)) return { ok: true, reason: null };
  if (atLevel) return { ok: false, reason: `This needs a higher approver: ₹${Number(amount).toFixed(2)} is above your limit of ₹${atLevel.maxAmount}.` };
  if (own.length) {
    const lowest = Math.min(...own.map((r) => r.level));
    return { ok: false, reason: lowest > stage.level ? `It is waiting for level ${stage.level} first${of}.` : `It has moved on to level ${stage.level}${of}, which another role decides.` };
  }
  return { ok: false, reason: 'Your role cannot approve this type of submission.' };
}
