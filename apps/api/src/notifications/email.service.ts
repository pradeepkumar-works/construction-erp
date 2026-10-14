import { Injectable, Logger } from '@nestjs/common';
import { PRODUCT_NAME } from '@erp/shared';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Outbound email. Provider is picked from the environment:
 *   RESEND_API_KEY set  -> Resend HTTPS API (works on Vercel, no SMTP needed)
 *   otherwise           -> messages are logged, nothing is sent (local development)
 * EMAIL_FROM is the sender, e.g. "Nirmaan <no-reply@yourdomain.com>". EMAIL_DISABLED=true turns email off.
 */
@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private readonly from = process.env.EMAIL_FROM || `${PRODUCT_NAME} <onboarding@resend.dev>`;
  private readonly resendKey = process.env.RESEND_API_KEY;

  get provider(): 'resend' | 'log' {
    return this.resendKey ? 'resend' : 'log';
  }

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
    } catch (e) {
      this.log.warn(`Email to ${msg.to} failed: ${(e as Error).message}`);
      return false;
    }
  }
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
