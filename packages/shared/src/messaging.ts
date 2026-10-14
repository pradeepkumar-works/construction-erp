import { PRODUCT_NAME } from './brand';

/** WhatsApp and SMS alerts (v3 item 31). WhatsApp goes first; SMS is the fallback when WhatsApp is off or fails. */
export const MESSAGE_CHANNELS = ['WHATSAPP', 'SMS'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS' };

export const MESSAGE_TEMPLATES = ['APPROVAL_REQUEST', 'SENT_BACK', 'DPR_REMINDER', 'INVITE', 'TEST'] as const;
export type MessageTemplate = (typeof MESSAGE_TEMPLATES)[number];
export const MESSAGE_TEMPLATE_LABELS: Record<MessageTemplate, string> = {
  APPROVAL_REQUEST: 'Approval request',
  SENT_BACK: 'Sent back',
  DPR_REMINDER: 'DPR reminder',
  INVITE: 'Invite',
  TEST: 'Test',
};

export const OUTBOUND_MESSAGE_STATUSES = ['SENT', 'FAILED', 'SKIPPED'] as const;
export type OutboundMessageStatus = (typeof OUTBOUND_MESSAGE_STATUSES)[number];
export const OUTBOUND_MESSAGE_STATUS_LABELS: Record<OutboundMessageStatus, string> = { SENT: 'Sent', FAILED: 'Failed', SKIPPED: 'Not set up' };

/**
 * The text of each template, with {{1}}, {{2}}… for its parameters in order. The same wording is registered with Meta
 * (WhatsApp utility templates, named `nirmaan_<key in lower case>`) and on the DLT portal for SMS ({#var#} per
 * parameter). TEST uses Meta's own `hello_world` template on WhatsApp.
 */
export const MESSAGE_TEMPLATE_TEXT: Record<MessageTemplate, string> = {
  APPROVAL_REQUEST: `Approval needed: {{1}} on {{2}}, submitted by {{3}}. Review it in ${PRODUCT_NAME}: {{4}}`,
  SENT_BACK: `{{1}} on {{2}} was {{3}} by {{4}}. Note: {{5}}. Open it in ${PRODUCT_NAME}: {{6}}`,
  DPR_REMINDER: `Reminder: today's daily progress report for {{1}} has not been submitted. Please submit it before end of day: {{2}}`,
  INVITE: `You have been invited to {{1}} on ${PRODUCT_NAME}. Choose a password to sign in: {{2}} The link works once and expires in {{3}}.`,
  TEST: `Test message from ${PRODUCT_NAME}: your alerts on this number are working.`,
};

/** Fill a template's {{n}} placeholders. */
export function renderMessage(template: MessageTemplate, params: string[]): string {
  return MESSAGE_TEMPLATE_TEXT[template].replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? '');
}

/**
 * A phone number in international form without "+", or null when it cannot be one. Ten-digit Indian mobile numbers
 * (starting 6–9, optionally with a leading 0 or 91) get the 91 country code; "+" numbers are taken as given.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0') ? digits : null;
  const d = digits.replace(/^0+/, '');
  if (/^[6-9]\d{9}$/.test(d)) return `91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return d;
  return null;
}

/** "919876543210" -> "+91 98765 43210" (other countries: "+" and the digits). */
export function formatPhone(international: string): string {
  const m = international.match(/^91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : `+${international}`;
}

/** GET/PUT /messaging/me: the caller's number and channels, and which channels this server can send on. */
export interface MessagingPrefsDto {
  phone: string | null;
  /** The number messages go to, or null when the phone is missing or not a valid mobile number */
  sendTo: string | null;
  whatsapp: boolean;
  sms: boolean;
  /** WhatsApp / SMS provider configured on the server */
  whatsappReady: boolean;
  smsReady: boolean;
}

export interface OutboundMessageDto {
  id: string;
  userId: string | null;
  userName: string | null;
  channel: MessageChannel;
  template: MessageTemplate;
  to: string;
  body: string;
  status: OutboundMessageStatus;
  error: string | null;
  createdAt: string;
}
