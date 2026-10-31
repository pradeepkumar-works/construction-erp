import { SUBMISSION_TYPES, type SubmissionType } from './enums';
import { SUBMISSION_TYPE_LABELS } from './labels';
import { submissionHref } from './links';

/**
 * Comments and mentions: threads on a record, staff only. A kind is a submission type (its record page) or
 * one of the registers with a page of its own. A new kind is a key here, a loader in the API's `CommentTargetsService`
 * and the `CommentsSection` on its page.
 */
export const COMMENT_KINDS = [...SUBMISSION_TYPES, 'MEETING', 'MATERIAL_APPROVAL'] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

export const COMMENT_KIND_LABELS: Record<CommentKind, string> = {
  ...SUBMISSION_TYPE_LABELS,
  MEETING: 'Meeting',
  MATERIAL_APPROVAL: 'Material approval',
};

/** The record's own page, where its comments are. */
export function commentKindHref(kind: CommentKind, id: string): string {
  if (kind === 'MEETING') return `/meetings/${id}`;
  if (kind === 'MATERIAL_APPROVAL') return `/material-approvals/${id}`;
  return submissionHref(kind as SubmissionType, id);
}

/** Longest comment, in characters. */
export const COMMENT_MAX_LENGTH = 4000;
/** Most people one comment may mention. */
export const COMMENT_MAX_MENTIONS = 10;

export interface CommentDto {
  id: string;
  /** Null for the comment that starts a thread */
  parentId: string | null;
  authorId: string;
  authorName: string;
  /** Empty once removed (a thread's first comment with replies stays as "Comment removed") */
  body: string;
  /** People mentioned, each as `@Full Name` in the body */
  mentions: { id: string; name: string }[];
  createdAt: string;
  editedAt: string | null;
  removed: boolean;
  /** The caller may edit or remove it */
  mine: boolean;
}

export interface CommentThreadDto extends CommentDto {
  replies: CommentDto[];
  resolvedAt: string | null;
  resolvedByName: string | null;
}

export interface CommentThreadsDto {
  kind: CommentKind;
  entityId: string;
  threads: CommentThreadDto[];
  open: number;
  resolved: number;
  /** Whether the caller may write (staff who can see the record and the company is not read-only) */
  canComment: boolean;
}

/** Someone who can be mentioned on the record: staff who see its project. */
export interface MentionableDto {
  id: string;
  name: string;
  role: string;
}

/** A comment's text in pieces, each `@Full Name` of someone it mentions on its own, for drawing the mentions. */
export function commentSegments(body: string, mentions: { id: string; name: string }[]): { text: string; mentionId?: string }[] {
  const names = [...mentions].sort((a, b) => b.name.length - a.name.length);
  const out: { text: string; mentionId?: string }[] = [];
  let rest = body;
  while (rest) {
    let best: { at: number; m: { id: string; name: string } } | null = null;
    for (const m of names) {
      const at = rest.indexOf(`@${m.name}`);
      if (at >= 0 && (!best || at < best.at)) best = { at, m };
    }
    if (!best) {
      out.push({ text: rest });
      break;
    }
    if (best.at > 0) out.push({ text: rest.slice(0, best.at) });
    out.push({ text: `@${best.m.name}`, mentionId: best.m.id });
    rest = rest.slice(best.at + best.m.name.length + 1);
  }
  return out;
}
