import { PRODUCT_NAME } from './brand';

/** WhatsApp and SMS alerts (v3 item 31). WhatsApp goes first; SMS is the fallback when WhatsApp is off or fails. */
export const MESSAGE_CHANNELS = ['WHATSAPP', 'SMS'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS' };

export const MESSAGE_TEMPLATES = ['APPROVAL_REQUEST', 'SENT_BACK', 'DPR_REMINDER', 'APPROVAL_DIGEST', 'TEST_DUE', 'BILLS_DUE', 'INVITE', 'TEST', 'MORNING_BRIEF'] as const;
export type MessageTemplate = (typeof MESSAGE_TEMPLATES)[number];
export const MESSAGE_TEMPLATE_LABELS: Record<MessageTemplate, string> = {
  APPROVAL_REQUEST: 'Approval request',
  SENT_BACK: 'Sent back',
  DPR_REMINDER: 'DPR reminder',
  APPROVAL_DIGEST: 'Approvals digest',
  TEST_DUE: 'Test due',
  BILLS_DUE: 'Payments due',
  INVITE: 'Invite',
  TEST: 'Test',
  MORNING_BRIEF: 'Morning brief',
};

/** WATI when WATI_API_ENDPOINT and WATI_ACCESS_TOKEN are set, else Meta's Cloud API when its keys are. */
export const WHATSAPP_PROVIDERS = ['WATI', 'META'] as const;
export type WhatsAppProvider = (typeof WHATSAPP_PROVIDERS)[number];
export const WHATSAPP_PROVIDER_LABELS: Record<WhatsAppProvider, string> = { WATI: 'WATI', META: 'Meta Cloud API' };

export const OUTBOUND_MESSAGE_STATUSES = ['SENT', 'FAILED', 'SKIPPED'] as const;
export type OutboundMessageStatus = (typeof OUTBOUND_MESSAGE_STATUSES)[number];
export const OUTBOUND_MESSAGE_STATUS_LABELS: Record<OutboundMessageStatus, string> = { SENT: 'Sent', FAILED: 'Failed', SKIPPED: 'Not set up' };

/**
 * The text of each template, with {{1}}, {{2}}… for its parameters in order. The same wording is registered as a
 * WhatsApp utility template named `nirmaan_<key in lower case>` (in WATI, with the variable names below; or with Meta
 * directly) and on the DLT portal for SMS ({#var#} per parameter). WhatsApp rejects a template that starts or ends
 * with a variable, so none does. TEST uses Meta's own `hello_world` template when sending through Meta directly.
 */
export const MESSAGE_TEMPLATE_TEXT: Record<MessageTemplate, string> = {
  APPROVAL_REQUEST: `Approval needed: {{1}} on {{2}}, submitted by {{3}}. Open {{4}} to review it in ${PRODUCT_NAME}.`,
  SENT_BACK: `Your {{1}} on {{2}} was {{3}} by {{4}}. Note: {{5}}. Open {{6}} to see it in ${PRODUCT_NAME}.`,
  DPR_REMINDER: `Reminder: today's daily progress report for {{1}} has not been submitted. Please submit it at {{2}} before end of day.`,
  APPROVAL_DIGEST: `Good morning {{1}}. {{2}} waiting for your approval: {{3}}. Open {{4}} to review them in ${PRODUCT_NAME}.`,
  TEST_DUE: `Test reminder: the {{1}} result of {{2}} at {{3}} is {{4}}. Enter it at {{5}} once tested.`,
  BILLS_DUE: `Payments due: {{1}} in the next 3 days, {{2}} overdue. See the due list at {{3}} in ${PRODUCT_NAME}.`,
  INVITE: `You have been invited to {{1}} on ${PRODUCT_NAME}. Choose a password to sign in: {{2}} The link works once and expires in {{3}}.`,
  TEST: `Test message from ${PRODUCT_NAME}: your alerts on this number are working.`,
  MORNING_BRIEF: `Good morning {{1}}. Your brief for today: {{2}}. Open {{3}} for the details in ${PRODUCT_NAME}.`,
};

/**
 * WATI names template variables, so each WATI template uses these names where the text above has {{1}}, {{2}}…
 * (`watiTemplateText` gives the text to paste into WATI).
 */
export const WATI_PARAM_NAMES: Record<MessageTemplate, string[]> = {
  APPROVAL_REQUEST: ['item', 'project', 'submitted_by', 'link'],
  SENT_BACK: ['item', 'project', 'outcome', 'reviewer', 'note', 'link'],
  DPR_REMINDER: ['project', 'link'],
  APPROVAL_DIGEST: ['name', 'count', 'summary', 'link'],
  TEST_DUE: ['reading', 'test', 'project', 'due', 'link'],
  BILLS_DUE: ['due_soon', 'overdue', 'link'],
  INVITE: ['company', 'link', 'expires_in'],
  TEST: [],
  MORNING_BRIEF: ['name', 'brief', 'link'],
};

/**
 * Templates added after launch: WhatsApp sends one only once it is approved by Meta and named in
 * WHATSAPP_APPROVED_TEMPLATES (e.g. `MORNING_BRIEF`); until then it goes by SMS if registered there, or not at all.
 */
export const TEMPLATES_NEEDING_APPROVAL: MessageTemplate[] = ['MORNING_BRIEF'];

/** A template's text with WATI's named variables, e.g. "Approval needed: {{item}} on {{project}}…". */
export function watiTemplateText(template: MessageTemplate): string {
  return MESSAGE_TEMPLATE_TEXT[template].replace(/\{\{(\d+)\}\}/g, (_, n: string) => `{{${WATI_PARAM_NAMES[template][Number(n) - 1]}}}`);
}

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
  /** Email for what waits on the user: hand-offs and send-backs */
  email: boolean;
  /** WhatsApp / SMS provider configured on the server */
  whatsappReady: boolean;
  /** Who sends WhatsApp from this server: WATI, Meta's Cloud API directly, or nobody yet */
  whatsappProvider: WhatsAppProvider | null;
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
