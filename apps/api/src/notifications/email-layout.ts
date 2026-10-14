import { PRODUCT_NAME } from '@erp/shared';
import { escapeHtml } from './email.service';

/**
 * The Nirmaan frame for every email: a black header with the yellow N mark and wordmark, a yellow datum line,
 * the message on white, and a short footer. Tables and inline styles only, and the mark is drawn in HTML rather
 * than an image, so it shows in Gmail and Outlook with images blocked. Same colours as the web brand
 * (apps/web/src/lib/brand.ts).
 */
export const EMAIL_COLORS = { ink: '#1C1F1E', accent: '#FFC20E', canvas: '#F4F3EF', border: '#E3E1DA', muted: '#6B6F6C', link: '#8A5A00' } as const;

const DISPLAY = `Archivo,'Arial Narrow','Helvetica Neue',Arial,sans-serif`;
const BODY = `-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

export interface EmailLayout {
  /** Shown in the inbox list after the subject; plain text. */
  preheader: string;
  /** The message, as HTML. */
  body: string;
  /** Organisation the email is about, shown in the footer; plain text. */
  orgName?: string;
  /** Extra footer line, already HTML. */
  footnote?: string;
}

/** A call-to-action button on the brand yellow. */
export function emailButton(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:${EMAIL_COLORS.accent};border-radius:4px">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 20px;font-family:${BODY};font-size:15px;font-weight:700;color:${EMAIL_COLORS.ink};text-decoration:none">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

export function emailLayout({ preheader, body, orgName, footnote }: EmailLayout) {
  const mark = `<td style="width:28px;height:28px;background:${EMAIL_COLORS.accent};border-radius:6px;text-align:center;vertical-align:middle;font-family:${DISPLAY};font-size:19px;font-weight:800;line-height:28px;color:${EMAIL_COLORS.ink}">N</td>`;
  const wordmark = `<td style="padding-left:10px;font-family:${DISPLAY};font-size:17px;font-weight:800;letter-spacing:2px;color:#FFFFFF">${escapeHtml(PRODUCT_NAME.toUpperCase())}</td>`;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/></head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.canvas}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_COLORS.canvas}"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid ${EMAIL_COLORS.border};border-radius:6px;overflow:hidden">
      <tr><td style="background:${EMAIL_COLORS.ink};padding:14px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${mark}${wordmark}</tr></table></td></tr>
      <tr><td style="background:${EMAIL_COLORS.accent};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
      <tr><td style="padding:24px;font-family:${BODY};font-size:15px;line-height:1.5;color:${EMAIL_COLORS.ink}">${body}</td></tr>
      <tr><td style="padding:14px 24px;border-top:1px solid ${EMAIL_COLORS.border};font-family:${BODY};font-size:12px;line-height:1.5;color:${EMAIL_COLORS.muted}">
        ${footnote ? `${footnote}<br/>` : ''}${orgName ? `${escapeHtml(orgName)} · ` : ''}${escapeHtml(PRODUCT_NAME)}: projects, site progress and approvals for construction teams.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
