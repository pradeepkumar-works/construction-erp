/**
 * The morning brief and the weekly narrative (AI item 74), written overnight in a batch. The brief is three lines for
 * one person, each built from their own My work and watch list; the narrative is one paragraph on a project's week
 * for the client's weekly progress report. Every figure in either must be in the records it was written from, or the
 * rules' own draft is used instead.
 */

/** Lines in a morning brief, at most. */
export const BRIEF_LINES = 3;

export interface BriefLineDto {
  text: string;
  /** Web path the line opens, where there is one */
  href: string | null;
}

export interface MorningBriefDto {
  /** The day it is for, YYYY-MM-DD */
  date: string;
  lines: BriefLineDto[];
  writtenAt: string;
  /** Written by the model and checked; false when the rules' own lines are shown */
  byAssistant: boolean;
}

/** `GET /briefs/today`: whether the brief is on offer to this user, whether they asked for it, and today's. */
export interface BriefStatusDto {
  /** Ask Nirmaan is on for the company and the user's role may use it */
  available: boolean;
  optedIn: boolean;
  brief: MorningBriefDto | null;
}

/** The summary paragraph at the top of a weekly progress report. */
export interface ProgressNarrativeDto {
  text: string;
  writtenAt: string;
  byAssistant: boolean;
}

/** What Ask Nirmaan's spend this month went on, for Admin > Ask Nirmaan. */
export const AI_FEATURES = ['QUESTIONS', 'BILL_CHECKS', 'DOCUMENT_READS', 'BRIEFS', 'PHOTO_CHECKS'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  QUESTIONS: 'Questions and drafts',
  BILL_CHECKS: 'Bill check summaries',
  DOCUMENT_READS: 'Invoices and drawings read',
  BRIEFS: 'Morning briefs and weekly summaries',
  PHOTO_CHECKS: 'Site photos checked',
};
