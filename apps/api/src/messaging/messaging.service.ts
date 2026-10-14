import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalisePhone, renderMessage, type MessageChannel, type MessageTemplate, type MessagingPrefsDto, type OutboundMessageDto, type Paginated } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { iso } from '../common/serialize';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { ListMessagesQuery, UpdateMessagingPrefsDto } from './messaging.dto';

export interface OutgoingMessage {
  template: MessageTemplate;
  params: string[];
}

interface SendResult {
  ok: boolean;
  providerRef?: string | null;
  error?: string;
}

/** The parameter (1-based) of each template that is a link: SMS keeps it whole, other SMS parameters are cut to 30 characters (the DLT limit). */
const LINK_PARAM: Partial<Record<MessageTemplate, number>> = { APPROVAL_REQUEST: 4, SENT_BACK: 6, DPR_REMINDER: 2, INVITE: 2 };
const SMS_VAR_MAX = 30;
const TIMEOUT_MS = 8000;

const include = { user: { select: { fullName: true } } } satisfies Prisma.OutboundMessageInclude;
type Row = Prisma.OutboundMessageGetPayload<{ include: typeof include }>;

/** WhatsApp and Meta reject empty parameters and ones with new lines or tabs. */
const clean = (s: string) => s.replace(/\s+/g, ' ').trim() || '-';
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 3)}...` : s);

/**
 * WhatsApp and SMS alerts (v3 item 31), sent only to users who switched them on, to the mobile number on their profile.
 * WhatsApp goes first; SMS is the fallback when WhatsApp is off, not set up or fails. Every attempt is written to
 * OutboundMessage, the company's message log. Nothing here throws into the caller: an outage must not fail an approval.
 *
 * Providers come from the environment (see docs/DEPLOY.md):
 *   WhatsApp Business Platform (Cloud API): WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID, templates named
 *     `nirmaan_<template>` (WHATSAPP_TEMPLATE_PREFIX) in WHATSAPP_TEMPLATE_LANGUAGE (default en).
 *   SMS through MSG91 (DLT templates): MSG91_AUTH_KEY + MSG91_TEMPLATE_IDS ("APPROVAL_REQUEST=<id>,SENT_BACK=<id>,…"),
 *     parameters as var1, var2…
 * Without them a message is logged as SKIPPED with its text, so the log shows what would have gone. MESSAGING_DISABLED=true
 * stops all of it.
 */
@Injectable()
export class MessagingService {
  private readonly log = new Logger(MessagingService.name);
  private readonly waToken = process.env.WHATSAPP_ACCESS_TOKEN;
  private readonly waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  private readonly waApi = (process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0').replace(/\/+$/, '');
  private readonly waLang = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
  private readonly waPrefix = process.env.WHATSAPP_TEMPLATE_PREFIX ?? 'nirmaan_';
  private readonly smsKey = process.env.MSG91_AUTH_KEY;
  private readonly smsApi = (process.env.MSG91_API_URL || 'https://control.msg91.com/api/v5').replace(/\/+$/, '');
  private readonly smsTemplates: Partial<Record<MessageTemplate, string>> = Object.fromEntries(
    (process.env.MSG91_TEMPLATE_IDS || '')
      .split(',')
      .map((p) => p.split('=').map((x) => x.trim()))
      .filter(([k, v]) => k && v),
  );

  constructor(private prisma: PrismaService, private access: ProjectAccessService) {}

  get disabled() {
    return process.env.MESSAGING_DISABLED === 'true';
  }

  /** The channel can send this template from this server. */
  ready(channel: MessageChannel, template?: MessageTemplate): boolean {
    if (this.disabled) return false;
    if (channel === 'WHATSAPP') return !!(this.waToken && this.waPhoneId);
    return !!this.smsKey && (template ? !!this.smsTemplates[template] : Object.keys(this.smsTemplates).length > 0);
  }

  /** The web address links point at: WEB_URL, else the first CORS origin. */
  webUrl(path = ''): string {
    const base = process.env.WEB_URL || (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).find(Boolean);
    return base ? `${base.replace(/\/+$/, '')}${path}` : '-';
  }

  /* ---------- preferences ---------- */

  async prefs(user: RequestUser): Promise<MessagingPrefsDto> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { phone: true, whatsappAlerts: true, smsAlerts: true } });
    return { phone: u.phone, sendTo: normalisePhone(u.phone), whatsapp: u.whatsappAlerts, sms: u.smsAlerts, whatsappReady: this.ready('WHATSAPP'), smsReady: this.ready('SMS') };
  }

  async updatePrefs(user: RequestUser, dto: UpdateMessagingPrefsDto): Promise<MessagingPrefsDto> {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { phone: true, whatsappAlerts: true, smsAlerts: true } });
    const phone = dto.phone === undefined ? current.phone : dto.phone?.trim() || null;
    const whatsapp = dto.whatsapp ?? current.whatsappAlerts;
    const sms = dto.sms ?? current.smsAlerts;
    if (phone && dto.phone !== undefined && !normalisePhone(phone)) throw new BadRequestException('Enter a 10-digit mobile number, or the full number with + and the country code');
    if ((whatsapp || sms) && !normalisePhone(phone)) throw new BadRequestException('Add your mobile number to get alerts on WhatsApp or SMS');
    await this.prisma.user.update({ where: { id: user.id }, data: { phone, whatsappAlerts: whatsapp, smsAlerts: sms } });
    return this.prefs(user);
  }

  /** A test message to the caller's own number, whether or not the channel is switched on. */
  async test(user: RequestUser, channel: MessageChannel = 'WHATSAPP'): Promise<OutboundMessageDto> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { phone: true } });
    const to = normalisePhone(u.phone);
    if (!to) throw new BadRequestException('Add your mobile number first');
    const row = await this.attempt({ organizationId: user.organizationId, userId: user.id, notificationId: null, to }, channel, { template: 'TEST', params: [] });
    return this.toDto(await this.prisma.outboundMessage.findUniqueOrThrow({ where: { id: row.id }, include }));
  }

  /* ---------- the log ---------- */

  toDto(r: Row): OutboundMessageDto {
    return { id: r.id, userId: r.userId, userName: r.user?.fullName ?? null, channel: r.channel, template: r.template, to: r.to, body: r.body, status: r.status, error: r.error, createdAt: iso(r.createdAt)! };
  }

  async list(user: RequestUser, q: ListMessagesQuery): Promise<Paginated<OutboundMessageDto>> {
    this.access.assertCanViewMessageLog(user);
    const and: Prisma.OutboundMessageWhereInput[] = [{ organizationId: user.organizationId }];
    if (q.status) and.push({ status: q.status });
    if (q.channel) and.push({ channel: q.channel });
    for (const w of searchWords(q.q)) and.push({ OR: [{ to: { contains: w.replace(/\D/g, '') || w } }, { body: ilike(w) }, { user: { fullName: ilike(w) } }] });
    const where: Prisma.OutboundMessageWhereInput = { AND: and };
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.outboundMessage.findMany({ where, include, orderBy: [{ createdAt: q.sortOrder ?? 'desc' }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.outboundMessage.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  /* ---------- sending ---------- */

  /** The alert behind each new notification, to the users among them who switched WhatsApp or SMS on. */
  async forNotifications(rows: { id: string; userId: string; organizationId: string }[], msg: OutgoingMessage): Promise<number> {
    if (this.disabled || !rows.length) return 0;
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: rows.map((r) => r.userId) }, isActive: true, OR: [{ whatsappAlerts: true }, { smsAlerts: true }] },
        select: { id: true, phone: true, whatsappAlerts: true, smsAlerts: true },
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      const results = await Promise.all(
        rows.map((r) => {
          const u = byId.get(r.userId);
          const to = normalisePhone(u?.phone);
          if (!u || !to) return null;
          const channels: MessageChannel[] = [...(u.whatsappAlerts ? (['WHATSAPP'] as const) : []), ...(u.smsAlerts ? (['SMS'] as const) : [])];
          return this.send({ organizationId: r.organizationId, userId: r.userId, notificationId: r.id, to }, channels, msg);
        }),
      );
      return results.filter((r) => r?.status === 'SENT').length;
    } catch (e) {
      this.log.warn(`Message delivery failed: ${(e as Error).message}`);
      return 0;
    }
  }

  /**
   * One message straight to a number on whichever channels are set up (an invite: the admin typed the number to reach
   * them). Returns the channel it went on, or null when none is set up or every attempt failed.
   */
  async direct(target: { organizationId: string; userId: string; phone: string | null }, msg: OutgoingMessage): Promise<MessageChannel | null> {
    const to = normalisePhone(target.phone);
    const channels = (['WHATSAPP', 'SMS'] as const).filter((c) => this.ready(c, msg.template));
    if (!to || !channels.length) return null;
    try {
      const row = await this.send({ organizationId: target.organizationId, userId: target.userId, notificationId: null, to }, [...channels], msg);
      return row?.status === 'SENT' ? row.channel : null;
    } catch (e) {
      this.log.warn(`Message delivery failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** Try the channels in order until one sends. Channels not set up are passed over; if none is, one SKIPPED row records it. */
  private async send(target: { organizationId: string; userId: string; notificationId: string | null; to: string }, channels: MessageChannel[], msg: OutgoingMessage) {
    if (!channels.length) return null;
    const usable = channels.filter((c) => this.ready(c, msg.template));
    if (!usable.length) return this.attempt(target, channels[0], msg);
    let last: Awaited<ReturnType<MessagingService['attempt']>> | null = null;
    for (const c of usable) {
      last = await this.attempt(target, c, msg);
      if (last.status === 'SENT') break;
    }
    return last;
  }

  private async attempt(target: { organizationId: string; userId: string; notificationId: string | null; to: string }, channel: MessageChannel, msg: OutgoingMessage) {
    const params = msg.params.map((p, i) => (channel === 'SMS' && LINK_PARAM[msg.template] !== i + 1 ? cut(clean(p), SMS_VAR_MAX) : clean(p)));
    const body = renderMessage(msg.template, params);
    let result: SendResult;
    if (!this.ready(channel, msg.template)) {
      result = { ok: false, error: channel === 'WHATSAPP' ? 'WhatsApp is not set up on this server' : this.ready('SMS') ? 'No SMS template registered for this message' : 'SMS is not set up on this server' };
      this.log.log(`[${channel} not set up] to=${target.to}: ${body}`);
    } else {
      try {
        result = channel === 'WHATSAPP' ? await this.sendWhatsApp(target.to, msg.template, params) : await this.sendSms(target.to, msg.template, params);
      } catch (e) {
        result = { ok: false, error: (e as Error).message };
      }
      if (!result.ok) this.log.warn(`${channel} to ${target.to} failed: ${result.error}`);
    }
    const status = result.ok ? 'SENT' : this.ready(channel, msg.template) ? 'FAILED' : 'SKIPPED';
    return this.prisma.outboundMessage.create({
      data: { organizationId: target.organizationId, userId: target.userId, notificationId: target.notificationId, channel, template: msg.template, to: target.to, body, status, providerRef: result.providerRef ?? null, error: result.error?.slice(0, 500) ?? null },
    });
  }

  /** WhatsApp Cloud API template message. TEST uses Meta's own hello_world template, which every account has. */
  private async sendWhatsApp(to: string, template: MessageTemplate, params: string[]): Promise<SendResult> {
    const tpl =
      template === 'TEST'
        ? { name: 'hello_world', language: { code: 'en_US' } }
        : { name: `${this.waPrefix}${template.toLowerCase()}`, language: { code: this.waLang }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] };
    const res = await fetch(`${this.waApi}/${this.waPhoneId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.waToken}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: tpl }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string; code?: number; error_data?: { details?: string } } } | null;
    if (!res.ok || !json?.messages?.[0]?.id) {
      const e = json?.error;
      return { ok: false, error: e ? `${e.code ?? res.status}: ${e.error_data?.details || e.message}` : `HTTP ${res.status}` };
    }
    return { ok: true, providerRef: json.messages[0].id };
  }

  /** MSG91 Flow API: the DLT-registered template by id, parameters as var1, var2… */
  private async sendSms(to: string, template: MessageTemplate, params: string[]): Promise<SendResult> {
    const recipient: Record<string, string> = { mobiles: to };
    params.forEach((p, i) => (recipient[`var${i + 1}`] = p));
    const res = await fetch(`${this.smsApi}/flow/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authkey: this.smsKey! },
      body: JSON.stringify({ template_id: this.smsTemplates[template], short_url: '0', recipients: [recipient] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
    if (!res.ok || json?.type !== 'success') return { ok: false, error: `${res.status}: ${json?.message ?? 'no response'}` };
    return { ok: true, providerRef: json.message ?? null };
  }
}
