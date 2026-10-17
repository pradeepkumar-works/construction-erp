import type { RoleKey } from './enums';
import { isGuest } from './permissions';

/**
 * Ask Nirmaan (AI roadmap item 67): an assistant that answers from the company's own records through read-only tools
 * that call the same services as the lists, so it sees only what the user's lists show.
 */

/** Everyone on the company's staff; the client's engineer and the consultant only use the portal. */
export const canUseAi = (role: RoleKey) => !isGuest(role);
/** Switch the assistant on or off for the company and set its monthly cap: admins. */
export const canManageAi = (role: RoleKey) => role === 'ADMIN';

/** Longest question accepted. */
export const AI_QUESTION_MAX = 2000;

/** A record the answer used, shown as a chip under it. */
export interface AiCitationDto {
  href: string;
  label: string;
}

export interface AiMessageDto {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations: AiCitationDto[];
  /** Figures in the answer that could not be matched to the records the assistant read */
  unverified: string[];
  /** 1 helpful, -1 not helpful, null not rated */
  feedback: 1 | -1 | null;
  createdAt: string;
}

export interface AiThreadDto {
  id: string;
  title: string;
  updatedAt: string;
}

export interface AiThreadDetailDto extends AiThreadDto {
  messages: AiMessageDto[];
}

/** What the panel needs to know before it opens. */
export interface AiStatusDto {
  /** The company has the assistant on and the server has a model to call */
  enabled: boolean;
  /** Why it is off, for the panel: not switched on for the company, or not set up on this server */
  reason: 'COMPANY_OFF' | 'NOT_CONFIGURED' | 'CAP_REACHED' | null;
  /** Questions this user may still ask today */
  questionsLeftToday: number;
  /** Admins can switch it on */
  canManage: boolean;
}

export interface AiSettingsDto {
  enabled: boolean;
  /** Rupees per month for the whole company; null = the server default */
  monthlyCapInr: number | null;
  /** The cap in force (the company's or the server default) */
  effectiveCapInr: number;
  /** Spent this calendar month, in rupees (as billed by OpenRouter, or estimated at list prices) */
  spentThisMonthInr: number;
  questionsThisMonth: number;
  /** Most active users this month */
  byUser: { userId: string; fullName: string; questions: number; spentInr: number }[];
  /** The server has a model key (OPENROUTER_API_KEY, ANTHROPIC_API_KEY or the test provider) */
  configured: boolean;
  model: string;
}

/** Where the user is when they ask, so "this project" and "this bill" mean something. */
export interface AiPageContext {
  /** Browser path, e.g. /projects/<id> or /bills/<id> */
  path?: string;
  /** The header's project switcher, when one project is picked */
  projectId?: string | null;
}

export interface AiAskInput {
  question: string;
  threadId?: string | null;
  page?: AiPageContext;
  /** Model comparison only: one of the server's AI_EVAL_MODELS (ignored by the app) */
  model?: string;
}

/** Server-sent events of POST /ai/ask, one JSON object per `data:` line. */
export type AiStreamEvent =
  | { type: 'thread'; threadId: string; title: string }
  | { type: 'status'; text: string }
  | { type: 'text'; text: string }
  | { type: 'done'; message: AiMessageDto }
  | { type: 'error'; message: string };
