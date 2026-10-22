/**
 * Comments and mentions (v6 item 116) as pure functions, tested in `src/scripts/comments-test.ts`: what a comment needs,
 * who hears of it, who may change it, and the order threads are shown in.
 */
import { COMMENT_MAX_LENGTH, COMMENT_MAX_MENTIONS } from '@erp/shared';

export interface Mention {
  id: string;
  name: string;
}

/** What is wrong with a comment's text and mentions, or null. Each mention must be written as `@Full Name`. */
export function commentProblem(body: string, mentions: Mention[]): string | null {
  const text = body.trim();
  if (!text) return 'Write the comment';
  if (text.length > COMMENT_MAX_LENGTH) return `Keep the comment under ${COMMENT_MAX_LENGTH} characters`;
  if (new Set(mentions.map((m) => m.id)).size > COMMENT_MAX_MENTIONS) return `Mention at most ${COMMENT_MAX_MENTIONS} people in one comment`;
  const missing = mentions.find((m) => !text.includes(`@${m.name}`));
  if (missing) return `Write @${missing.name} in the comment, or take them off the mentions`;
  return null;
}

/** The people actually mentioned: those whose `@Full Name` is still in the text, once each. */
export function keptMentions(body: string, mentions: Mention[]): Mention[] {
  const seen = new Set<string>();
  return mentions.filter((m) => body.includes(`@${m.name}`) && !seen.has(m.id) && seen.add(m.id));
}

export interface ThreadPeople {
  /** Who wrote the thread's first comment and each reply, oldest first */
  writers: string[];
  /** Everyone mentioned anywhere in the thread so far */
  mentioned: string[];
}

/**
 * Who hears of a new comment. Those it mentions are told they were mentioned; on a reply, everyone already in the thread
 * (who wrote in it or was mentioned in it) is told of the reply. Never the writer, and never anyone twice.
 */
export function whoToTell(authorId: string, mentions: string[], thread: ThreadPeople | null): { mentioned: string[]; replied: string[] } {
  const mentioned = [...new Set(mentions)].filter((id) => id !== authorId);
  const told = new Set([authorId, ...mentioned]);
  const replied = thread ? [...new Set([...thread.writers, ...thread.mentioned])].filter((id) => !told.has(id)) : [];
  return { mentioned, replied };
}

/** A comment's author edits it; its author or an admin removes it. A removed comment stays removed. */
export function mayChange(comment: { authorId: string; removedAt: Date | null }, user: { id: string; isAdmin: boolean }, action: 'edit' | 'remove'): boolean {
  if (comment.removedAt) return false;
  return comment.authorId === user.id || (action === 'remove' && user.isAdmin);
}

/** Open threads first, the one with the latest word on top; then the resolved ones, latest resolved first. */
export function threadOrder<T extends { resolvedAt: Date | null; lastAt: Date }>(threads: T[]): T[] {
  return [...threads].sort((a, b) => {
    if (!a.resolvedAt !== !b.resolvedAt) return a.resolvedAt ? 1 : -1;
    if (a.resolvedAt && b.resolvedAt) return b.resolvedAt.getTime() - a.resolvedAt.getTime();
    return b.lastAt.getTime() - a.lastAt.getTime();
  });
}

/** The notice's first line: "Asha Rao mentioned you on DPR 12 Oct 2026". */
export function noticeTitle(authorName: string, what: 'mentioned' | 'replied', recordTitle: string): string {
  return what === 'mentioned' ? `${authorName} mentioned you on ${recordTitle}` : `${authorName} replied on ${recordTitle}`;
}

/** The notice's body: the comment, cut to a line. */
export function noticeBody(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
