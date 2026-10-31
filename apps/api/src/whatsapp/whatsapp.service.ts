import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import {
  AI_DRAFT_LABELS,
  CAPTURE_STATS_DAYS,
  PRODUCT_NAME,
  canManageAi,
  canUseWhatsappCapture,
  isCaptureSaveKind,
  modulesOffFor,
  normalisePhone,
  type AiDraftDto,
  type AiMessageDto,
  type CaptureListDto,
  type CaptureSaveKind,
  type CaptureSetupDto,
  type InboundMessageDto,
  type RoleKey,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { setTenant, withoutTenant } from '../prisma/tenant-context';
import type { RequestUser } from '../common/current-user';
import { billingConfig, billingState } from '../common/billing';
import { StorageService } from '../common/storage.service';
import { iso } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { AiService } from '../ai/ai.service';
import { MessagingService } from '../messaging/messaging.service';
import { ProjectsService } from '../projects/projects.service';
import { DprService } from '../dpr/dpr.service';
import { ProgressService } from '../progress/progress.service';
import { MaterialRequestsService } from '../material-requests/material-requests.service';
import { ExpensesService } from '../expenses/expenses.service';
import { CreateDprDto } from '../dpr/dpr.dto';
import { CreateProgressDto } from '../progress/progress.dto';
import { CreateMaterialRequestDto } from '../material-requests/material-requests.dto';
import { CreateExpenseDto } from '../expenses/expenses.dto';
import { transcribe, transcribeProvider } from './transcribe';
import {
  NOT_SET_UP_REPLY,
  NOTHING_WAITING_REPLY,
  captureStats,
  createBody,
  draftReply,
  firstProblem,
  fit,
  metaSignatureOk,
  parseMeta,
  parseWati,
  pickDraft,
  plainText,
  questionOf,
  replyIntent,
  sameText,
  withinSaveWindow,
  type InboundEvent,
} from './whatsapp-rules';
import type { CaptureListQuery } from './whatsapp.dto';

/** A message with its media already in hand (the tests, or a provider that sends the bytes). */
export type ReceivedEvent = InboundEvent & { mediaBytes?: { bytes: Buffer; mimeType: string } };

const ANSWER_TIMEOUT_MS = 90_000;
/** Photos and voice notes kept from a message; WhatsApp itself caps media at 16 MB. */
const MEDIA_MAX = 16 * 1024 * 1024;

const include = { user: { select: { fullName: true } }, attachment: { select: { id: true, storagePath: true, mimeType: true } } } satisfies Prisma.InboundMessageInclude;
type Row = Prisma.InboundMessageGetPayload<{ include: typeof include }>;

const RECORD_PATHS: Record<CaptureSaveKind, string> = { dpr: '/dpr', progress: '/progress', 'material-request': '/material-requests', expense: '/expenses' };
const istStart = (day: string) => new Date(`${day}T00:00:00.000+05:30`);
const EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/amr': '.amr' };

/**
 * WhatsApp entries. A message to the company's WhatsApp number from someone who switched entries on is
 * read as them: a voice note is written down, Ask Nirmaan (with their own access, through its draft tools) drafts the
 * record it describes, and the reply shows the draft with Save and Discard. Save creates the record through the
 * kind's own service, in their name and submitted for approval, exactly as the form would; nothing is saved otherwise.
 * Webhooks: the Cloud API at /whatsapp/inbound (verify token and app-secret signature), WATI at /whatsapp/inbound/wati/<secret>.
 */
@Injectable()
export class WhatsappService {
  private readonly log = new Logger(WhatsappService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private messaging: MessagingService,
    private storage: StorageService,
    private projects: ProjectsService,
    private dpr: DprService,
    private progress: ProgressService,
    private materialRequests: MaterialRequestsService,
    private expenses: ExpensesService,
  ) {}

  // Webhooks

  /** The server can take messages in: a provider to reply with, and that provider's webhook secret. */
  receiving(): boolean {
    const p = this.messaging.disabled ? null : this.messaging.whatsappProvider;
    if (p === 'META') return !!process.env.WHATSAPP_APP_SECRET && !!process.env.WHATSAPP_VERIFY_TOKEN;
    if (p === 'WATI') return !!process.env.WATI_WEBHOOK_SECRET;
    return false;
  }

  /** Meta's one-time check when the webhook is set up: echo the challenge if the token is ours. */
  verify(mode: string | undefined, token: string | undefined, challenge: string | undefined): string {
    const want = process.env.WHATSAPP_VERIFY_TOKEN;
    if (mode !== 'subscribe' || !want || !token || !sameText(want, token) || !challenge) throw new ForbiddenException('Wrong verify token');
    return challenge;
  }

  async metaWebhook(rawBody: Buffer | undefined, signature: string | undefined, body: unknown): Promise<{ ok: boolean }> {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret || !rawBody || !metaSignatureOk(secret, rawBody, signature)) throw new ForbiddenException('Bad signature');
    for (const e of parseMeta(body)) await this.receive(e);
    return { ok: true };
  }

  async watiWebhook(secret: string, body: unknown): Promise<{ ok: boolean }> {
    const want = process.env.WATI_WEBHOOK_SECRET;
    if (!want || !sameText(want, secret)) throw new ForbiddenException('Wrong webhook address');
    const e = parseWati(body);
    if (e) await this.receive(e);
    return { ok: true };
  }

  /**
   * One message. Never throws: a provider must get its 200, and a failure is recorded on the message and told to the
   * sender. A webhook sent twice (same provider id) is read once.
   */
  async receive(e: ReceivedEvent): Promise<{ id: string | null }> {
    try {
      const user = await this.senderOf(e.from);
      if (!user) {
        await this.reply(e.from, NOT_SET_UP_REPLY);
        return { id: null };
      }
      setTenant(user.organizationId);
      if (e.providerRef) {
        const seen = await this.prisma.inboundMessage.findFirst({ where: { organizationId: user.organizationId, providerRef: e.providerRef }, select: { id: true } });
        if (seen) return { id: seen.id };
      }
      const intent = replyIntent(e);
      if (intent) return await this.decideByReply(user, e, intent);
      if (e.type === 'OTHER' || e.type === 'BUTTON') {
        await this.reply(e.from, 'Send what happened on site as a text, a photo with a caption, or a voice note.');
        return { id: null };
      }
      return { id: await this.read(user, e as ReceivedEvent & { type: 'TEXT' | 'VOICE' | 'PHOTO' }) };
    } catch (err) {
      this.log.warn(`WhatsApp message from ${e.from}: ${(err as Error).message}`);
      return { id: null };
    }
  }

  /** The user a number belongs to while their entries are on, as the request user their own login would be. */
  private async senderOf(phone: string): Promise<RequestUser | null> {
    const u = await withoutTenant(() =>
      this.prisma.user.findFirst({
        where: { captureFrom: phone, isActive: true, organization: { suspendedAt: null } },
        select: { id: true, organizationId: true, email: true, fullName: true, vendorId: true, role: { select: { key: true } }, organization: { select: { code: true, trialEndsAt: true, paidUntil: true, modulesOff: true, moduleTier: true } } },
      }),
    );
    if (!u || !canUseWhatsappCapture(u.role.key as RoleKey) || u.vendorId) return null;
    const billing = billingConfig();
    const readOnly = !!billing && billingState(billing, u.organization, todayIn()).status === 'READ_ONLY';
    const off = modulesOffFor(u.organization);
    return { id: u.id, organizationId: u.organizationId, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName, ...(readOnly ? { billingReadOnly: true } : {}), ...(off.length ? { modulesOff: off } : {}) };
  }

  /** A new message: keep it and its media, hear a voice note, ask for a draft, reply. */
  private async read(user: RequestUser, e: ReceivedEvent & { type: 'TEXT' | 'VOICE' | 'PHOTO' }): Promise<string> {
    const row = await this.prisma.inboundMessage.create({
      data: { organizationId: user.organizationId, userId: user.id, fromPhone: e.from, providerRef: e.providerRef, type: e.type, text: e.text, recordClientId: randomUUID() },
    });
    const fail = async (error: string, reply: string) => {
      await this.prisma.inboundMessage.update({ where: { id: row.id }, data: { state: 'FAILED', error: error.slice(0, 500), reply } });
      await this.reply(e.from, reply);
      return row.id;
    };

    let media: { bytes: Buffer; mimeType: string } | null = e.mediaBytes ?? null;
    if (!media && e.media && e.type !== 'TEXT') {
      try {
        media = await this.messaging.fetchMedia(e.media.ref);
      } catch (err) {
        return fail((err as Error).message, 'I could not open what you sent. Please send it again.');
      }
    }
    if (media && media.bytes.length > MEDIA_MAX) return fail('Media over 16 MB', 'That file is too large. Send a smaller photo or a shorter voice note.');
    const mimeType = media ? media.mimeType.split(';')[0].trim() || e.media?.mimeType || 'application/octet-stream' : null;
    let attachmentId: string | null = null;
    if (media && mimeType) {
      const fileName = `whatsapp-${todayIn()}-${row.id.slice(0, 8)}${EXT[mimeType] ?? ''}`;
      const saved = await this.storage.save({ buffer: media.bytes, originalname: fileName, mimetype: mimeType, size: media.bytes.length } as Express.Multer.File, user.organizationId);
      const att = await this.prisma.attachment.create({
        data: { organizationId: user.organizationId, fileName, mimeType, size: media.bytes.length, storagePath: saved.storagePath, data: saved.data ? new Uint8Array(saved.data) : null, uploadedById: user.id },
      });
      attachmentId = att.id;
      await this.prisma.inboundMessage.update({ where: { id: row.id }, data: { attachmentId } });
    }

    let transcript: string | null = null;
    if (e.type === 'VOICE') {
      if (!media) return fail('No audio', 'I could not open the voice note. Please send it again.');
      if (!transcribeProvider()) return fail('Voice notes are not set up on this server', 'I cannot listen to voice notes yet. Please type it instead.');
      try {
        const heard = await transcribe(media.bytes, media.mimeType);
        transcript = heard.text || null;
        await this.prisma.inboundMessage.update({ where: { id: row.id }, data: { transcript, costPaise: heard.costPaise, transcribeModel: heard.model } });
      } catch (err) {
        return fail((err as Error).message, 'I could not make out the voice note. Please send it again, or type it.');
      }
      if (!transcript) return fail('Nothing heard', 'I could not make out any words. Please send it again, or type it.');
    }

    try {
      await this.ai.assertCanAsk(user);
    } catch (err) {
      const why = err instanceof HttpException ? err.message : 'Ask Nirmaan is not available right now.';
      return fail(why, fit(why));
    }

    const done = await this.ask(user, row.id, questionOf({ type: e.type, text: e.text, transcript }));
    if (!done) return fail('No answer', 'Sorry, I could not read that just now. Please send it again in a minute.');
    const drafted = pickDraft(done.drafts ?? []);
    if (drafted) {
      const draft: AiDraftDto = { ...drafted, captureId: row.id };
      const saveable = isCaptureSaveKind(draft.kind) && !user.billingReadOnly;
      const meta = this.messaging.whatsappProvider === 'META';
      const text = draftReply(draft, this.messaging.webUrl(`/whatsapp-capture?id=${row.id}`), { buttons: meta && saveable, voice: e.type === 'VOICE' });
      await this.prisma.inboundMessage.update({ where: { id: row.id }, data: { state: 'DRAFTED', draft: draft as unknown as Prisma.InputJsonValue, reply: text } });
      await this.reply(e.from, text, meta && saveable ? [{ id: `save:${row.id}`, title: 'Save' }, { id: `discard:${row.id}`, title: 'Discard' }] : []);
    } else {
      const text = fit(plainText(done.text) || 'I could not tell what to record from that. Say what was done, what is needed or what was spent, and on which project.');
      await this.prisma.inboundMessage.update({ where: { id: row.id }, data: { state: 'ANSWERED', reply: text } });
      await this.reply(e.from, text);
    }
    return row.id;
  }

  /** Ask Nirmaan as the sender, in their conversation for the day, with their one active project picked if they have one. */
  private async ask(user: RequestUser, inboundId: string, question: string): Promise<AiMessageDto | null> {
    const today = await this.prisma.inboundMessage.findFirst({
      where: { userId: user.id, threadId: { not: null }, createdAt: { gte: istStart(todayIn()) } },
      orderBy: { createdAt: 'desc' },
      select: { threadId: true },
    });
    const thread = today?.threadId ? await this.prisma.aiThread.findFirst({ where: { id: today.threadId, userId: user.id }, select: { id: true } }) : null;
    const mine = await this.projects.list(user, { page: 1, pageSize: 2, status: 'ACTIVE' } as never).catch(() => null);
    const projectId = mine?.total === 1 ? mine.items[0].id : null;
    let done: AiMessageDto | null = null;
    await this.ai.ask(
      user,
      { question: question.slice(0, 2000), threadId: thread?.id ?? null, client: 'whatsapp', page: projectId ? { projectId } : undefined },
      (ev) => {
        if (ev.type === 'thread') void this.prisma.inboundMessage.update({ where: { id: inboundId }, data: { threadId: ev.threadId } }).catch(() => undefined);
        if (ev.type === 'done') done = ev.message;
      },
      AbortSignal.timeout(ANSWER_TIMEOUT_MS),
    );
    return done;
  }

  /** "1" / "haan" / a tapped Save: the draft named by the button, else the sender's latest one still waiting. */
  private async decideByReply(user: RequestUser, e: InboundEvent, intent: { action: 'SAVE' | 'DISCARD'; id: string | null }): Promise<{ id: string | null }> {
    const row = intent.id
      ? await this.prisma.inboundMessage.findFirst({ where: { id: intent.id, userId: user.id } })
      : await this.prisma.inboundMessage.findFirst({ where: { userId: user.id, state: 'DRAFTED' }, orderBy: { createdAt: 'desc' } });
    if (!row || (row.state === 'DRAFTED' && !withinSaveWindow(row.createdAt, new Date()))) {
      await this.reply(e.from, NOTHING_WAITING_REPLY);
      return { id: null };
    }
    if (row.state === 'SAVED') {
      await this.reply(e.from, `Already saved. ${this.recordLink(row)}`.trim());
      return { id: row.id };
    }
    if (row.state !== 'DRAFTED') {
      await this.reply(e.from, NOTHING_WAITING_REPLY);
      return { id: row.id };
    }
    if (intent.action === 'DISCARD') {
      await this.discard(user, row.id);
      await this.reply(e.from, 'Discarded. Nothing was saved.');
      return { id: row.id };
    }
    try {
      const saved = await this.save(user, row.id);
      const link = this.messaging.webUrl(saved.record?.href ?? '');
      await this.reply(e.from, fit(`Saved and sent for approval: ${saved.record?.label}${link.startsWith('http') ? `\n${link}` : ''}`));
    } catch (err) {
      const why = err instanceof HttpException ? err.message : 'Something went wrong';
      const link = this.messaging.webUrl(`/whatsapp-capture?id=${row.id}`);
      await this.reply(e.from, fit(`Not saved: ${why}. ${link.startsWith('http') ? `Open it to fix and save: ${link}` : 'Open WhatsApp entries in Nirmaan to fix and save it.'}`));
    }
    return { id: row.id };
  }

  /** A reply on WhatsApp; without a provider it is only logged (local work and the tests). */
  private async reply(to: string, text: string, buttons: { id: string; title: string }[] = []) {
    if (!this.messaging.whatsappProvider || this.messaging.disabled) {
      this.log.log(`[WhatsApp reply not sent] to=${to}: ${text}`);
      return;
    }
    const r = await this.messaging.sendSession(to, text, buttons);
    if (!r.ok) this.log.warn(`WhatsApp reply to ${to} failed: ${r.error}`);
  }

  private recordLink(row: { recordKind: string | null; recordId: string | null }) {
    const link = row.recordKind && row.recordId && isCaptureSaveKind(row.recordKind as CaptureSaveKind) ? this.messaging.webUrl(`${RECORD_PATHS[row.recordKind as CaptureSaveKind]}/${row.recordId}`) : '';
    return link.startsWith('http') ? link : '';
  }

  // Deciding

  private async mine(user: RequestUser, id: string) {
    const row = await this.prisma.inboundMessage.findFirst({ where: { id, organizationId: user.organizationId }, include });
    if (!row) throw new NotFoundException('Message not found');
    if (row.userId !== user.id) throw new ForbiddenException('Only the person who sent it can save or discard it');
    return row;
  }

  /**
   * Saves the draft in the sender's name through its kind's own service, submitted for approval, as the form would.
   * The message's client id makes a second Save (a retried tap) return the same record.
   */
  async save(user: RequestUser, id: string): Promise<InboundMessageDto> {
    const row = await this.mine(user, id);
    if (row.state === 'SAVED') return this.toDto(row);
    const draft = row.draft as unknown as AiDraftDto | null;
    if (row.state !== 'DRAFTED' || !draft) throw new ConflictException('There is no draft waiting on this message');
    if (!isCaptureSaveKind(draft.kind)) throw new BadRequestException(`A ${AI_DRAFT_LABELS[draft.kind].toLowerCase()} is saved from its own form: open it`);
    if (!withinSaveWindow(row.createdAt, new Date())) throw new BadRequestException('This draft is over a day old: open it and save it from the form');
    if (user.billingReadOnly) throw new ForbiddenException(`Your ${PRODUCT_NAME} trial or subscription has ended, so nothing new can be saved`);
    const attachmentIds = row.type === 'PHOTO' && row.attachmentId ? [row.attachmentId] : [];
    const body = createBody(draft.kind, draft.values, { id: row.recordClientId, attachmentIds });
    const recordId = await this.create(user, draft.kind, body).catch(async (err: unknown) => {
      const why = err instanceof HttpException ? err.message : (err as Error).message;
      await this.prisma.inboundMessage.update({ where: { id: row.id }, data: { error: why.slice(0, 500) } });
      throw err;
    });
    const updated = await this.prisma.inboundMessage.update({
      where: { id: row.id },
      data: { state: 'SAVED', outcome: 'SAVED', recordKind: draft.kind, recordId, decidedAt: new Date(), error: null },
      include,
    });
    return this.toDto(updated);
  }

  private async create(user: RequestUser, kind: CaptureSaveKind, body: Record<string, unknown>): Promise<string> {
    const check = async <T extends object>(cls: new () => T): Promise<T> => {
      const dto = plainToInstance(cls, body);
      const errors = await validate(dto, { whitelist: true });
      if (errors.length) throw new BadRequestException(firstProblem(errors));
      return dto;
    };
    if (kind === 'dpr') return (await this.dpr.create(user, await check(CreateDprDto))).id;
    if (kind === 'progress') return (await this.progress.create(user, await check(CreateProgressDto))).id;
    if (kind === 'material-request') return (await this.materialRequests.create(user, await check(CreateMaterialRequestDto))).id;
    return (await this.expenses.create(user, await check(CreateExpenseDto))).id;
  }

  async discard(user: RequestUser, id: string): Promise<InboundMessageDto> {
    const row = await this.mine(user, id);
    if (row.state === 'DISCARDED') return this.toDto(row);
    if (row.state !== 'DRAFTED') throw new ConflictException('There is no draft waiting on this message');
    return this.toDto(await this.prisma.inboundMessage.update({ where: { id }, data: { state: 'DISCARDED', outcome: 'DISCARDED', decidedAt: new Date() }, include }));
  }

  /** The draft was opened in the app, changed and saved there: link the record (which the sender must be able to open). */
  async savedInApp(user: RequestUser, id: string, recordId: string): Promise<InboundMessageDto> {
    const row = await this.mine(user, id);
    const draft = row.draft as unknown as AiDraftDto | null;
    if (!draft || !isCaptureSaveKind(draft.kind)) throw new BadRequestException('This message has no draft to save');
    if (row.state === 'SAVED') return this.toDto(row);
    const kind = draft.kind;
    if (kind === 'dpr') await this.dpr.get(user, recordId);
    else if (kind === 'progress') await this.progress.get(user, recordId);
    else if (kind === 'material-request') await this.materialRequests.get(user, recordId);
    else await this.expenses.get(user, recordId);
    return this.toDto(await this.prisma.inboundMessage.update({ where: { id }, data: { state: 'SAVED', outcome: 'CHANGED', recordKind: kind, recordId, decidedAt: new Date(), error: null }, include }));
  }

  // The page

  toDto(r: Row): InboundMessageDto {
    const draft = (r.draft as unknown as AiDraftDto | null) ?? null;
    const kind = r.recordKind && isCaptureSaveKind(r.recordKind as CaptureSaveKind) ? (r.recordKind as CaptureSaveKind) : null;
    return {
      id: r.id,
      createdAt: iso(r.createdAt)!,
      userId: r.userId,
      userName: r.user?.fullName ?? null,
      fromPhone: r.fromPhone,
      type: r.type,
      text: r.text,
      transcript: r.transcript,
      attachment: r.attachment ? { id: r.attachment.id, url: this.storage.toUrl(r.attachment.id, r.attachment.storagePath), mimeType: r.attachment.mimeType } : null,
      state: r.state,
      draft,
      reply: r.reply,
      record: kind && r.recordId ? { kind, id: r.recordId, href: `${RECORD_PATHS[kind]}/${r.recordId}`, label: draft?.title ?? AI_DRAFT_LABELS[kind] } : null,
      outcome: r.outcome,
      error: r.error,
      canSave: r.state === 'DRAFTED' && !!draft && isCaptureSaveKind(draft.kind) && withinSaveWindow(r.createdAt, new Date()),
    };
  }

  async list(user: RequestUser, q: CaptureListQuery): Promise<CaptureListDto> {
    const company = q.scope === 'company';
    if (company && !canManageAi(user.roleKey)) throw new ForbiddenException("Only admins see the company's WhatsApp entries");
    const scope: Prisma.InboundMessageWhereInput = { organizationId: user.organizationId, ...(company ? {} : { userId: user.id }) };
    const where: Prisma.InboundMessageWhereInput = { ...scope, ...(q.state ? { state: q.state } : {}), ...(q.id ? { id: q.id } : {}) };
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 20, 50);
    const since = new Date(Date.now() - CAPTURE_STATS_DAYS * 86400_000);
    const [rows, total, recent] = await Promise.all([
      this.prisma.inboundMessage.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.inboundMessage.count({ where }),
      this.prisma.inboundMessage.findMany({ where: { ...scope, createdAt: { gte: since } }, select: { outcome: true, draft: true } }),
    ]);
    return { items: rows.map((r) => this.toDto(r)), total, stats: captureStats(recent.map((r) => ({ outcome: r.outcome, drafted: r.draft !== null })), CAPTURE_STATS_DAYS) };
  }

  async setup(user: RequestUser): Promise<CaptureSetupDto> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { phone: true, captureFrom: true } });
    const status = canUseWhatsappCapture(user.roleKey) ? await this.ai.status(user) : null;
    const admin = canManageAi(user.roleKey) && !user.support;
    const provider = this.messaging.disabled ? null : this.messaging.whatsappProvider;
    return {
      enabled: !!u.captureFrom,
      phone: normalisePhone(u.phone),
      aiReady: !!status?.enabled,
      aiReason: status?.reason ?? 'ROLE_OFF',
      provider,
      receiving: this.receiving(),
      voice: transcribeProvider() !== null,
      webhookPath: admin && provider ? (provider === 'WATI' ? '/whatsapp/inbound/wati/<WATI_WEBHOOK_SECRET>' : '/whatsapp/inbound') : null,
      number: process.env.WHATSAPP_DISPLAY_NUMBER?.trim() || null,
      canSeeCompany: admin,
    };
  }

  /** The caller's own switch: on takes the mobile number on their profile, which no one else may have on. */
  async updateSetup(user: RequestUser, enabled: boolean): Promise<CaptureSetupDto> {
    if (!canUseWhatsappCapture(user.roleKey) || user.vendorId) throw new ForbiddenException('WhatsApp entries are for company staff');
    if (user.support) throw new ForbiddenException('Not in a support session');
    if (!enabled) {
      await this.prisma.user.update({ where: { id: user.id }, data: { captureFrom: null } });
      return this.setup(user);
    }
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { phone: true } });
    const phone = normalisePhone(u.phone);
    if (!phone) throw new BadRequestException('Add your mobile number to your profile first: messages are read from that number');
    const taken = await withoutTenant(() => this.prisma.user.findFirst({ where: { captureFrom: phone, id: { not: user.id } }, select: { id: true } }));
    if (taken) throw new ConflictException('Someone else already sends WhatsApp entries from this number. Ask an admin to check the mobile numbers on your profiles.');
    await this.prisma.user.update({ where: { id: user.id }, data: { captureFrom: phone } });
    return this.setup(user);
  }
}
