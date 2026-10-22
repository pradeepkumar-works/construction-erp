import type { MakeCheckLineInput, MakeWarningDto, MaterialApprovalStatus, MaterialReviewOutcome } from '@erp/shared';

/** Whole days from one YYYY-MM-DD to another. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Lower case, words only: "UltraTech Cement (OPC-53)" → "ultratech cement opc 53". */
export const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const words = (s: string) => normalise(s).split(' ').filter(Boolean);

/**
 * Is a purchase order line's item the material an approved make is listed for? The same item, or every word of the
 * shorter name in the longer one: "Cement OPC 53" is "OPC 53 grade cement", but "Cement" alone is not "Cement paint".
 * Single-word names must match exactly, so a short listing does not catch every line.
 */
export function sameMaterial(lineName: string, listed: string): boolean {
  const a = words(lineName);
  const b = words(listed);
  if (!a.length || !b.length) return false;
  if (a.join(' ') === b.join(' ')) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 2) return false;
  const set = new Set(long);
  return short.every((w) => set.has(w));
}

/** Is a line's make one of the approved: the same words, or one name inside the other ("Tata" and "Tata Tiscon"). */
export function sameMake(lineMake: string, approved: string): boolean {
  const a = normalise(lineMake);
  const b = normalise(approved);
  if (!a || !b) return false;
  return a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
}

export interface ListedMake {
  material: string;
  make: string;
}
export interface PendingMake extends ListedMake {
  marNo: string;
}

/**
 * Lines of an order whose material has approved makes on the project, but that name no make or one not approved. A
 * material with no approved makes listed is not checked. A request for the line's make still under review is named.
 */
export function makeWarnings(lines: MakeCheckLineInput[], approved: ListedMake[], pending: PendingMake[] = []): MakeWarningDto[] {
  const out: MakeWarningDto[] = [];
  lines.forEach((line, index) => {
    const name = line.itemName?.trim();
    if (!name) return;
    const listed = approved.filter((a) => sameMaterial(name, a.material));
    if (!listed.length) return;
    const make = line.make?.trim() || null;
    if (make && listed.some((a) => sameMake(make, a.make))) return;
    const pend = make ? pending.find((p) => sameMaterial(name, p.material) && sameMake(make, p.make)) : undefined;
    out.push({ index, itemName: name, make, reason: make ? 'NOT_APPROVED' : 'NO_MAKE', approved: [...new Set(listed.map((a) => a.make))], pendingMarNo: pend?.marNo ?? null });
  });
  return out;
}

/** The request's status after an outcome. */
export const statusAfter = (outcome: MaterialReviewOutcome): MaterialApprovalStatus => outcome;

/** An approved make may be bought: approved, or approved as noted. */
export const isApproval = (outcome: MaterialReviewOutcome | MaterialApprovalStatus) => outcome === 'APPROVED' || outcome === 'APPROVED_AS_NOTED';

/** Why an outcome cannot be recorded, or null: only on a request under review, dated between its submission and today, and with the reviewer's comments unless plainly approved. */
export function reviewProblem(status: MaterialApprovalStatus, r: { outcome: MaterialReviewOutcome; reviewedOn: string; submittedOn: string; comments?: string | null; today: string }): string | null {
  if (status !== 'UNDER_REVIEW') return 'Only a request under review gets an outcome.';
  if (r.reviewedOn < r.submittedOn) return 'The review cannot be before the request was submitted.';
  if (r.reviewedOn > r.today) return 'The review cannot be after today.';
  if (r.outcome !== 'APPROVED' && !r.comments?.trim()) return 'Write the reviewer’s comments.';
  return null;
}

/** Why the request cannot go (again) to the reviewer, or null. */
export function submitProblem(status: MaterialApprovalStatus, r: { submittedOn: string; today: string; lastReviewedOn?: string | null }): string | null {
  if (status === 'UNDER_REVIEW') return 'This request is already with the reviewer.';
  if (status === 'APPROVED' || status === 'APPROVED_AS_NOTED') return 'This request is approved. Raise a new one for another make.';
  if (status === 'WITHDRAWN') return 'This request is withdrawn.';
  if (r.submittedOn > r.today) return 'It cannot be submitted after today.';
  if (r.lastReviewedOn && r.submittedOn < r.lastReviewedOn) return 'A revision cannot be submitted before the last review.';
  return null;
}

/** Days outstanding while under review; null otherwise. */
export const daysOutstanding = (status: MaterialApprovalStatus, submittedOn: string | null, today: string) => (status === 'UNDER_REVIEW' && submittedOn ? Math.max(0, daysBetween(submittedOn, today)) : null);

/** Average whole days from submission to outcome, over the reviews given; null with none. */
export function averageDays(reviews: { submittedOn: string; reviewedOn: string }[]): number | null {
  if (!reviews.length) return null;
  return Math.round(reviews.reduce((s, r) => s + Math.max(0, daysBetween(r.submittedOn, r.reviewedOn)), 0) / reviews.length);
}
