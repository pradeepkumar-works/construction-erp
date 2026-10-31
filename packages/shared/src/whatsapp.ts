import type { AiDraftDto, AiDraftKind, AiStatusDto } from './ai';
import type { RoleKey } from './enums';
import type { WhatsAppProvider } from './messaging';
import { canUseAi } from './ai';

/**
 * WhatsApp and voice capture: a site person sends a text, a photo with a caption or a voice note to the
 * company's WhatsApp number; Ask Nirmaan drafts the record it describes and replies with it, and the sender saves it in
 * their own name with one tap (Save), or opens it in the app to change it. Nothing is saved without that tap.
 */

/** What a message can become and be saved from WhatsApp. Letters are drafted but only opened in the app. */
export const CAPTURE_SAVE_KINDS = ['dpr', 'progress', 'material-request', 'expense'] as const satisfies readonly AiDraftKind[];
export type CaptureSaveKind = (typeof CAPTURE_SAVE_KINDS)[number];
export const isCaptureSaveKind = (k: AiDraftKind): k is CaptureSaveKind => (CAPTURE_SAVE_KINDS as readonly string[]).includes(k);

/**
 * RECEIVED while it is read; ANSWERED when the reply asked something back or answered a question (no draft); DRAFTED
 * when a draft waits for Save; SAVED once saved; DISCARDED when the sender said no; FAILED when reading or saving went
 * wrong. A message from a number nobody switched on is not kept.
 */
export const INBOUND_STATES = ['RECEIVED', 'ANSWERED', 'DRAFTED', 'SAVED', 'DISCARDED', 'FAILED'] as const;
export type InboundState = (typeof INBOUND_STATES)[number];
export const INBOUND_STATE_LABELS: Record<InboundState, string> = {
  RECEIVED: 'Reading',
  ANSWERED: 'Answered',
  DRAFTED: 'Waiting for Save',
  SAVED: 'Saved',
  DISCARDED: 'Discarded',
  FAILED: 'Failed',
};

export const INBOUND_TYPES = ['TEXT', 'VOICE', 'PHOTO'] as const;
export type InboundType = (typeof INBOUND_TYPES)[number];
export const INBOUND_TYPE_LABELS: Record<InboundType, string> = { TEXT: 'Text', VOICE: 'Voice note', PHOTO: 'Photo' };

export const CAPTURE_OUTCOMES = ['SAVED', 'CHANGED', 'DISCARDED'] as const;
export type CaptureOutcome = (typeof CAPTURE_OUTCOMES)[number];
export const CAPTURE_OUTCOME_LABELS: Record<CaptureOutcome, string> = { SAVED: 'Saved as drafted', CHANGED: 'Changed, then saved', DISCARDED: 'Discarded' };

/** A draft waits this long for Save; after that a "1" starts nothing and the draft stays to open in the app. */
export const CAPTURE_SAVE_HOURS = 24;

/** Who may send entries on WhatsApp: whoever may use Ask Nirmaan (the company's AI roles are checked too). */
export const canUseWhatsappCapture = (role: RoleKey) => canUseAi(role);

export interface InboundMessageDto {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  fromPhone: string;
  type: InboundType;
  /** What they wrote, or the photo's caption */
  text: string | null;
  /** A voice note as heard, marked "Check this" wherever it is shown */
  transcript: string | null;
  /** The photo or voice note, to open */
  attachment: { id: string; url: string; mimeType: string } | null;
  state: InboundState;
  draft: AiDraftDto | null;
  /** What Nirmaan sent back */
  reply: string | null;
  /** The record saved from it, with its page */
  record: { kind: CaptureSaveKind; id: string; href: string; label: string } | null;
  /** Saved as drafted, saved after a change in the app, or discarded: the go-live bar counts these */
  outcome: CaptureOutcome | null;
  error: string | null;
  /** The sender may still Save it from here (a draft of a kind WhatsApp saves, within CAPTURE_SAVE_HOURS) */
  canSave: boolean;
}

/** Over the last CAPTURE_STATS_DAYS: of the drafts people decided on, how many were saved as drafted. */
export interface CaptureStatsDto {
  days: number;
  drafted: number;
  saved: number;
  changed: number;
  discarded: number;
}
export const CAPTURE_STATS_DAYS = 30;
/** The go-live bar (AI strategy): at least this share of decided drafts saved without a change. */
export const CAPTURE_GO_LIVE_SHARE = 0.7;

export interface CaptureListDto {
  items: InboundMessageDto[];
  total: number;
  /** The caller's own, or the company's (admins) */
  stats: CaptureStatsDto;
}

export interface CaptureSetupDto {
  /** The caller's own switch, and the mobile number messages must come from (from their profile) */
  enabled: boolean;
  phone: string | null;
  /** Whether Ask Nirmaan is open to the caller (company switch, AI roles, the month's cap) */
  aiReady: boolean;
  aiReason: AiStatusDto['reason'];
  /** Whether this server can receive (a provider and its webhook secret) and hear voice notes */
  provider: WhatsAppProvider | null;
  receiving: boolean;
  voice: boolean;
  /** For admins: where to point the provider's webhook, after the API's address (`/whatsapp/inbound`) */
  webhookPath: string | null;
  /** The company number people send to, when set (WHATSAPP_DISPLAY_NUMBER) */
  number: string | null;
  /** Admins see the company's messages and the webhook address */
  canSeeCompany: boolean;
}
