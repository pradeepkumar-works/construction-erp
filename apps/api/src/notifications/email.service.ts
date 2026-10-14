import { Injectable, Logger } from '@nestjs/common';
import { PRODUCT_NAME } from '@erp/shared';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailProvider = 'mail-api' | 'resend' | 'log';

const DEFAULT_MAIL_API_URL = 'https://communication.cogitrex.com';
const DEFAULT_MAIL_API_FROM = 'notifications@cogitrex.com';

/**
 * Outbound email. Provider is picked from the environment (EMAIL_PROVIDER forces one):
 *   MAIL_API_KEY set    -> Cogitrex mail API (POST {MAIL_API_URL}/mail/send, sends from a Gmail mailbox)
 *   RESEND_API_KEY set  -> Resend HTTPS API
 *   otherwise           -> messages are logged, nothing is sent (local development)
 * EMAIL_FROM is the sender. For the mail API it must be the mailbox the key belongs to (default
 * notifications@cogitrex.com; the display name comes from the mailbox); for Resend, e.g.
 * "Nirmaan <no-reply@yourdomain.com>". EMAIL_DISABLED=true turns email off.
 */
@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private readonly mailApiKey = process.env.MAIL_API_KEY;
  private readonly mailApiUrl = (process.env.MAIL_API_URL || DEFAULT_MAIL_API_URL).replace(/\/+$/, '');
  private readonly resendKey = process.env.RESEND_API_KEY;
  readonly provider: EmailProvider = pickProvider(process.env.EMAIL_PROVIDER, this.mailApiKey, this.resendKey);
  private readonly from =
    this.provider === 'mail-api'
      ? addressOf(process.env.EMAIL_FROM) || DEFAULT_MAIL_API_FROM
      : process.env.EMAIL_FROM || `${PRODUCT_NAME} <onboarding@resend.dev>`;

  get enabled(): boolean {
    return process.env.EMAIL_DISABLED !== 'true';
  }

  /** Returns true when the message was handed to a real provider. */
  async send(msg: EmailMessage): Promise<boolean> {
    if (!this.enabled) return false;
    if (this.provider === 'log') {
      this.log.log(`[email not configured] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
      return false;
    }
    try {
      return this.provider === 'mail-api' ? await this.sendViaMailApi(msg) : await this.sendViaResend(msg);
    } catch (e) {
      this.log.warn(`Email to ${msg.to} failed: ${(e as Error).message}`);
      return false;
    }
  }

  private async sendViaMailApi(msg: EmailMessage): Promise<boolean> {
    const res = await fetch(`${this.mailApiUrl}/mail/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.mailApiKey! },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, body: msg.html, isHtml: true }),
    });
    const raw = await res.text();
    if (!res.ok) {
      this.log.warn(`Mail API responded ${res.status} for ${msg.to}: ${raw.slice(0, 300)}`);
      return false;
    }
    // A send Gmail rejects still comes back as HTTP 200, with status:false in the body.
    let body: { status?: boolean; internalMessage?: string } | null = null;
    try {
      body = JSON.parse(raw);
    } catch {
      /* fall through */
    }
    if (!body?.status) {
      this.log.warn(`Mail API rejected email to ${msg.to}: ${(body?.internalMessage ?? raw).slice(0, 300)}`);
      return false;
    }
    return true;
  }

  private async sendViaResend(msg: EmailMessage): Promise<boolean> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.resendKey}` },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      this.log.warn(`Resend responded ${res.status} for ${msg.to}: ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  }
}

function pickProvider(forced: string | undefined, mailApiKey?: string, resendKey?: string): EmailProvider {
  if (forced === 'mail-api') return mailApiKey ? 'mail-api' : 'log';
  if (forced === 'resend') return resendKey ? 'resend' : 'log';
  if (forced === 'log') return 'log';
  return mailApiKey ? 'mail-api' : resendKey ? 'resend' : 'log';
}

/** "Nirmaan <a@b.com>" -> "a@b.com"; a bare address is returned as is. */
function addressOf(from: string | undefined): string | undefined {
  if (!from) return undefined;
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim() || undefined;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
