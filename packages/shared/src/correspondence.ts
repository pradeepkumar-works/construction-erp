import type { AttachmentDto } from './types';
import type { LetterDirection } from './documents';
import { financialYearOf } from './procurement';

/**
 * Correspondence (ARCHITECTURE "Correspondence"): the company's inward (dak) and outward registers, for every
 * project and head office. A letter received is numbered on entry and marked to someone with an action and a date; a letter
 * sent is drafted, approved by its signatory where the company asks for it, numbered only then, dispatched and proven
 * delivered. Numbers, which letters need approval, replies due and proof missing are pure here; the service applies them.
 */

export const LETTER_STATUSES = ['DRAFT', 'AWAITING_APPROVAL', 'ISSUED', 'OPEN', 'CLOSED'] as const;
export type LetterStatus = (typeof LETTER_STATUSES)[number];
export const LETTER_STATUS_LABELS: Record<LetterStatus, string> = {
  DRAFT: 'Draft',
  AWAITING_APPROVAL: 'Waiting for signature',
  ISSUED: 'Issued',
  OPEN: 'Open',
  CLOSED: 'Closed',
};
export const LETTER_MODES = ['HAND', 'POST', 'SPEED_POST', 'REGISTERED_POST', 'COURIER', 'EMAIL', 'PORTAL'] as const;
export type LetterMode = (typeof LETTER_MODES)[number];
export const LETTER_MODE_LABELS: Record<LetterMode, string> = {
  HAND: 'By hand',
  POST: 'Ordinary post',
  SPEED_POST: 'Speed post',
  REGISTERED_POST: 'Registered post',
  COURIER: 'Courier',
  EMAIL: 'Email',
  PORTAL: "Client's portal",
};
/** Modes that leave a docket or tracking number to keep. */
export const LETTER_TRACKED_MODES: LetterMode[] = ['SPEED_POST', 'REGISTERED_POST', 'COURIER'];

export const LETTER_ACTIONS = ['REPLY', 'COMPLY', 'NOTE', 'FILE'] as const;
export type LetterAction = (typeof LETTER_ACTIONS)[number];
export const LETTER_ACTION_LABELS: Record<LetterAction, string> = {
  REPLY: 'Reply',
  COMPLY: 'Comply',
  NOTE: 'Note',
  FILE: 'File',
};
export const LETTER_ACTION_HINTS: Record<LetterAction, string> = {
  REPLY: 'Draft a reply',
  COMPLY: 'Do what it asks and report',
  NOTE: 'Read and note',
  FILE: 'File it; nothing to do',
};

export const LETTER_PRIORITIES = ['NORMAL', 'URGENT'] as const;
export type LetterPriority = (typeof LETTER_PRIORITIES)[number];
export const LETTER_PRIORITY_LABELS: Record<LetterPriority, string> = { NORMAL: 'Normal', URGENT: 'Urgent' };

export const LETTER_APPROVAL_RULES = ['ALL', 'CONTRACTUAL', 'NONE'] as const;
export type LetterApprovalRule = (typeof LETTER_APPROVAL_RULES)[number];
export const LETTER_APPROVAL_RULE_LABELS: Record<LetterApprovalRule, string> = {
  ALL: 'Every outward letter',
  CONTRACTUAL: 'Notices, claims and extension of time letters',
  NONE: 'None: numbered when saved',
};

/**
 * The standard letter categories (the `letterCategory` master) whose letters carry a contractual deadline or claim: under
 * the CONTRACTUAL rule they wait for the signatory before they are numbered, and once sent they need proof of delivery.
 */
export const CONTRACTUAL_LETTER_CATEGORIES = ['notice', 'claim', 'extension-of-time', 'hindrance', 'reply-to-show-cause'];
export const isContractualCategory = (category: string | null | undefined) => !!category && CONTRACTUAL_LETTER_CATEGORIES.includes(category);

/** Whether a company-wide rule reaches a letter of this category. */
function ruleReaches(rule: LetterApprovalRule, category: string | null | undefined): boolean {
  if (rule === 'ALL') return true;
  if (rule === 'NONE') return false;
  return isContractualCategory(category);
}

/** Who seals a letter at head office (L2): the directors. A director who signs at L1 has sealed it already. */
export const LETTER_SEAL_ROLES = ['ADMIN', 'MANAGEMENT'] as const;
export const maySealLetters = (role: string) => (LETTER_SEAL_ROLES as readonly string[]).includes(role);

const RULE_REACH: Record<LetterApprovalRule, number> = { NONE: 0, CONTRACTUAL: 1, ALL: 2 };

/**
 * How far an outward letter of a category goes before it gets its number: numbered when saved, signed by its signatory
 * (L1), or signed and then sealed by a director at head office (L1 and L2). The company sets it per category in Numbering
 * and approval; a seal always comes after a signature, so no category can skip the first.
 */
export const LETTER_GATES = ['NONE', 'SIGN', 'SEAL'] as const;
export type LetterGate = (typeof LETTER_GATES)[number];
export const LETTER_GATE_LABELS: Record<LetterGate, string> = {
  NONE: 'Numbered when saved',
  SIGN: 'Signatory signs',
  SEAL: 'Signatory, then head office seal',
};
/** Where letters with no category keep their gate (no category code has brackets). */
export const NO_LETTER_CATEGORY = '(none)';

/**
 * The company's approval: a gate per category it has set, and for the rest the two company-wide rules it started with
 * (by default the signatory for contractual letters and no seal), so a category added later starts where they put it.
 */
export interface LetterRules {
  approval: LetterApprovalRule;
  seal: LetterApprovalRule;
  gates: Partial<Record<string, LetterGate>>;
}

/** The gate a letter of this category passes before it is numbered. */
export function letterGate(rules: LetterRules, category: string | null | undefined): LetterGate {
  const own = rules.gates[category || NO_LETTER_CATEGORY];
  if (own) return own;
  if (!ruleReaches(rules.approval, category)) return 'NONE';
  return ruleReaches(rules.seal, category) ? 'SEAL' : 'SIGN';
}

/** Whether an outward letter of this category waits for its signatory before it is numbered. */
export const letterNeedsApproval = (rules: LetterRules, category: string | null | undefined): boolean => letterGate(rules, category) !== 'NONE';

/**
 * Whether a letter its signatory has just approved (L1) waits for head office's seal (L2) before it is numbered: its
 * category's gate asks for the seal, and the signatory is not a director.
 */
export function letterNeedsSeal(rules: LetterRules, category: string | null | undefined, signerRole: string): boolean {
  return letterGate(rules, category) === 'SEAL' && !maySealLetters(signerRole);
}

/** The gates as stored (`Organization.letterGates`): anything that is not a gate is left out. */
export function readLetterGates(json: unknown): Partial<Record<string, LetterGate>> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  return Object.fromEntries(Object.entries(json as Record<string, unknown>).filter((e): e is [string, LetterGate] => (LETTER_GATES as readonly unknown[]).includes(e[1])));
}

/** The second approval reaches no letter the first does not: a seal comes after a signature. */
export function letterRulesProblem(first: LetterApprovalRule, second: LetterApprovalRule): string | null {
  if (RULE_REACH[second] <= RULE_REACH[first]) return null;
  return first === 'NONE' ? 'Letters need no signature, so none can wait for head office. Ask for a signature first.' : 'Head office can seal only letters that are signed first. Choose the same letters or fewer.';
}

/** Where a letter waiting for approval stands: with its signatory (L1) or at head office (L2). */
export const letterApprovalStage = (l: { status: LetterStatus; signedAt: string | null }): 'SIGN' | 'SEAL' | null =>
  l.status !== 'AWAITING_APPROVAL' ? null : l.signedAt ? 'SEAL' : 'SIGN';

/** A letter's state in words; one waiting for approval says which of the two it waits for. */
export const letterStatusLabel = (l: { status: LetterStatus; signedAt: string | null }): string =>
  letterApprovalStage(l) === 'SEAL' ? 'Waiting for the seal' : LETTER_STATUS_LABELS[l.status];

/** Where an outward letter's signature (L1) or seal (L2) stands. */
export type SignOffStep = 'DONE' | 'WAITING' | 'LATER' | 'NOT_NEEDED';

/**
 * The outward register's sign-off: the signatory's step and head office's, from the letter's state and its category's
 * gate. A letter issued without either (one that needed none, or was already sent) shows them not needed; one a
 * director signed shows the seal not needed, as the signature was the seal.
 */
export function letterSignOff(l: { status: LetterStatus; gate: LetterGate | null; signedAt: string | null; signatoryId: string | null }): { sign: SignOffStep; seal: SignOffStep } {
  if (l.status === 'ISSUED') return { sign: l.signatoryId || l.signedAt ? 'DONE' : 'NOT_NEEDED', seal: l.signedAt ? 'DONE' : 'NOT_NEEDED' };
  const gate = l.gate ?? 'NONE';
  const sealLater: SignOffStep = gate === 'SEAL' ? 'LATER' : 'NOT_NEEDED';
  if (l.status === 'AWAITING_APPROVAL') return l.signedAt ? { sign: 'DONE', seal: 'WAITING' } : { sign: 'WAITING', seal: sealLater };
  if (l.status === 'DRAFT') return { sign: gate === 'NONE' ? 'NOT_NEEDED' : 'LATER', seal: sealLater };
  return { sign: 'NOT_NEEDED', seal: 'NOT_NEEDED' };
}

/** P07/OUT/26-27/042; head office HO/IN/26-27/015. */
export const LETTER_NUMBER_PATTERN = '{PREFIX}/{DIR}/{FY}/{NNN}';
export const HEAD_OFFICE_PREFIX = 'HO';
export const LETTER_PATTERN_TOKENS = ['{PREFIX}', '{DIR}', '{FY}', '{YYYY}', '{N}', '{NN}', '{NNN}', '{NNNN}'] as const;

/** The financial year a letter's number counts in, as 26-27. */
export function letterFy(date: string): string {
  const fy = financialYearOf(date);
  return `${fy.from.slice(2, 4)}-${fy.to.slice(2, 4)}`;
}

/** A number from a pattern: {N} as is, {NN}…{NNNN} padded; {YYYY} is the year the financial year starts. */
export function formatLetterNo(pattern: string, v: { prefix: string; direction: LetterDirection; date: string; n: number }): string {
  const fy = financialYearOf(v.date);
  return pattern
    .replace(/\{PREFIX\}/g, v.prefix)
    .replace(/\{DIR\}/g, v.direction)
    .replace(/\{FY\}/g, letterFy(v.date))
    .replace(/\{YYYY\}/g, fy.from.slice(0, 4))
    .replace(/\{(N{1,4})\}/g, (_, ns: string) => String(v.n).padStart(ns.length, '0'));
}

/**
 * A project's series prefix, kept short as letters are written: a code such as RD-2026-01 (`nextProjectCode`) becomes
 * RD01; any other code keeps its letters, digits and hyphens. The company changes it in Numbering and approval.
 */
export function letterPrefixOf(projectCode: string): string {
  const m = /^([A-Za-z]+)-\d{4}-(\d+)$/.exec(projectCode.trim());
  if (m) return `${m[1].toUpperCase()}${m[2].padStart(2, '0')}`;
  return projectCode.replace(/[^A-Za-z0-9-]/g, '').slice(0, 20) || 'P';
}

/** What is wrong with a numbering pattern, or null. */
export function letterPatternProblem(pattern: string): string | null {
  const p = pattern.trim();
  if (!p) return 'Enter the pattern, such as {PREFIX}/{DIR}/{FY}/{NNN}';
  if (p.length > 60) return 'Keep the pattern to 60 characters';
  const unknown = (p.match(/\{[^}]*\}/g) ?? []).filter((t) => !(LETTER_PATTERN_TOKENS as readonly string[]).includes(t));
  if (unknown.length) return `${unknown[0]} is not a part a number can have; use ${LETTER_PATTERN_TOKENS.join(' ')}`;
  if (!/\{N{1,4}\}/.test(p)) return 'Put the running number in the pattern: {N}, {NN}, {NNN} or {NNNN}';
  if (!/\{FY\}|\{YYYY\}/.test(p)) return 'Put the year in the pattern ({FY} or {YYYY}): numbers start again each financial year';
  if (!/\{DIR\}/.test(p)) return 'Put {DIR} in the pattern so letters in and out never share a number';
  return null;
}

/** A series' prefix: letters, digits and - only, as a project code is. */
export function letterPrefixProblem(prefix: string): string | null {
  const p = prefix.trim();
  if (!p) return 'Enter the prefix, such as the project code';
  if (p.length > 20) return 'Keep the prefix to 20 characters';
  if (!/^[A-Za-z0-9-]+$/.test(p)) return 'Use letters, digits and - in the prefix';
  return null;
}

export interface LetterFacts {
  direction: LetterDirection;
  status: LetterStatus;
  replyBy: string | null;
  /** A reply has gone the other way (an issued letter of ours, or one of theirs received) */
  replied: boolean;
  category: string | null;
  dispatchedOn: string | null;
  deliveredOn: string | null;
  actionDue: string | null;
  markedToId: string | null;
}

/** Ours to answer (IN) or theirs (OUT), not yet answered. */
export function awaitingReply(l: Pick<LetterFacts, 'direction' | 'status' | 'replyBy' | 'replied'>): boolean {
  if (!l.replyBy || l.replied) return false;
  return l.direction === 'IN' ? l.status === 'OPEN' : l.status === 'ISSUED';
}

export function replyOverdue(l: Pick<LetterFacts, 'direction' | 'status' | 'replyBy' | 'replied'>, today: string): boolean {
  return awaitingReply(l) && l.replyBy! < today;
}

/** A contractual letter sent with nothing to show it arrived: at risk in a dispute or a claim for time. */
export function proofMissing(l: Pick<LetterFacts, 'direction' | 'status' | 'category' | 'deliveredOn'>): boolean {
  return l.direction === 'OUT' && l.status === 'ISSUED' && isContractualCategory(l.category) && !l.deliveredOn;
}

export function actionOverdue(l: Pick<LetterFacts, 'status' | 'actionDue' | 'markedToId'>, today: string): boolean {
  return !!l.markedToId && !!l.actionDue && l.actionDue < today && l.status !== 'CLOSED' && l.status !== 'ISSUED';
}

/** Days from the letter's receipt to its reply date, for the date the form suggests (7 by default, 3 for urgent). */
export const DEFAULT_REPLY_DAYS: Record<LetterPriority, number> = { NORMAL: 7, URGENT: 3 };

/** Placeholders a template's subject and text may use, filled when a draft starts from it. */
export const LETTER_TEMPLATE_FIELDS = ['{to}', '{office}', '{project}', '{contract}', '{theirRef}', '{theirDate}', '{subject}', '{company}', '{date}'] as const;
export type LetterTemplateValues = Partial<Record<'to' | 'office' | 'project' | 'contract' | 'theirRef' | 'theirDate' | 'subject' | 'company' | 'date', string | null>>;

/** A template's text with what is known filled in; a placeholder with no value stays, for the writer to fill. */
export function fillLetterTemplate(text: string, values: LetterTemplateValues): string {
  return text.replace(/\{(to|office|project|contract|theirRef|theirDate|subject|company|date)\}/g, (all, k: keyof LetterTemplateValues) => values[k]?.trim() || all);
}

/** Standard templates offered to a company with none of its own: a reply, a hindrance notice and a reminder. */
export const STANDARD_LETTER_TEMPLATES: { name: string; category: string; subject: string; body: string }[] = [
  {
    name: 'Reply to a letter',
    category: 'general',
    subject: 'Re: {subject}',
    body: 'With reference to your letter {theirRef} dated {theirDate} regarding {subject}, we submit as under.\n\n\n\nWe request you to kindly take the above on record.',
  },
  {
    name: 'Hindrance notice',
    category: 'hindrance',
    subject: 'Notice of hindrance: {project}',
    body: 'Under the terms of the agreement {contract}, we notify you of the hindrance described below, which is holding up the work.\n\n\n\nWe request you to remove the hindrance at the earliest and to take note that the time lost will be claimed as an extension of time.',
  },
  {
    name: 'Reminder',
    category: 'general',
    subject: 'Reminder: {subject}',
    body: 'We invite your kind attention to our letter {theirRef} dated {theirDate} regarding {subject}, to which we have not yet received a reply.\n\nWe request you to kindly reply at the earliest.',
  },
];

export interface LetterRefLite {
  id: string;
  letterNo: string | null;
  direction: LetterDirection;
  letterDate: string;
  subject: string;
  status: LetterStatus;
}

export interface LetterMarkDto {
  id: string;
  fromName: string;
  toId: string;
  toName: string;
  action: LetterAction;
  dueOn: string | null;
  note: string | null;
  doneAt: string | null;
  doneNote: string | null;
  createdAt: string;
}

export interface LetterContactDto {
  id: string;
  name: string;
  office: string | null;
  organisation: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  /** What kind of office it is (a code of the letterParty master), and its name */
  kind: string | null;
  kindName: string | null;
  clientId: string | null;
  clientName: string | null;
  isActive: boolean;
  /** Letters to or from it */
  letters: number;
}

/** How a contact is written on a letter: "The Executive Engineer, Road Division No. 2". */
export const contactLine = (c: Pick<LetterContactDto, 'name' | 'office' | 'organisation'>) => [c.name, c.office, c.organisation].filter(Boolean).join(', ');

export interface LetterSeriesDto {
  id: string;
  projectId: string | null;
  /** Head office when there is no project */
  projectName: string | null;
  direction: LetterDirection;
  prefix: string;
  pattern: string;
  /** The next number this financial year would get */
  next: string;
  /** Numbers given this financial year */
  usedThisYear: number;
}

export interface LetterSettingsDto {
  approval: LetterApprovalRule;
  /** Which signed letters then wait for a director's seal at head office before they are numbered */
  seal: LetterApprovalRule;
  /** The gate each category the company has set passes (`letterGate` reads them with the two rules above) */
  gates: Partial<Record<string, LetterGate>>;
  series: LetterSeriesDto[];
  /** Projects and head office without a series of their own yet (one is made with the defaults on their first letter) */
  pattern: string;
  canManage: boolean;
}

export interface LetterTemplateDto {
  id: string;
  name: string;
  category: string | null;
  subject: string;
  body: string;
  isActive: boolean;
}

/** Someone a letter can be marked to, and whether they may sign one for the project (or head office). */
export interface LetterPersonDto {
  id: string;
  fullName: string;
  roleName: string;
  onProject: boolean;
  canSign: boolean;
}

export interface LetterSummaryDto {
  /** Letters marked to me, not yet acted on */
  markedToMe: number;
  markedToMeOverdue: number;
  /** Outward letters waiting for my signature */
  toSign: number;
  /** Replies we owe, and those past their date */
  repliesDue: number;
  repliesOverdue: number;
  /** Replies they owe us past their date */
  theirsOverdue: number;
  /** Contractual letters sent without proof of delivery */
  proofMissing: number;
  /** Inward letters not marked to anyone */
  unmarked: number;
}
