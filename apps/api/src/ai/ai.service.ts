import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import type {
  AiAskInput,
  AiCitationDto,
  AiConversationDetailDto,
  AiConversationDto,
  AiConversationExportRowDto,
  AiDraftDto,
  AiFeature,
  AiMessageDto,
  AiPlanDto,
  AiSettingsDto,
  AiStatusDto,
  AiStreamEvent,
  AiThreadDetailDto,
  AiThreadDto,
  AiUserUsageDto,
  Paginated,
  RoleKey,
} from '@erp/shared';
import { AI_EXPORT_MAX_ROWS, PRODUCT_NAME, ROLE_LABELS, aiRoleAllowed, canManageAi, canUseAi } from '@erp/shared';
import { aiPlanAllowanceInr, billingConfig, billingState, billingUnits } from '../common/billing';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import type { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { todayIn } from '../notifications/time';
import { aiConfig, aiConfigured, costPaise, modelName, type AiUsage } from './ai.config';
import { AiToolsService } from './ai-tools.service';
import { collectHrefs, collectNumbers, collectTexts, derivedNumbers, filterLinks, unverifiedFigures } from './grounding';
import { unverifiedQuotes } from '../documents/document-text';
import { FakeModel, MessagesModel, type AiModel, type ModelMessage } from './model';
import { CHECK_SUMMARY_PROMPT, SYSTEM_PROMPT, contextNote } from './prompt';
import type { AiConversationsQueryDto, UpdateAiSettingsDto } from './ai.dto';

/** Model calls in one answer at most (each may run several tools). */
const MAX_ROUNDS = 8;
/** Earlier questions and answers of the thread sent with a new question. */
const HISTORY = 12;
/** The longest one answer may take. */
const ANSWER_TIMEOUT_MS = 150_000;

/** Record pages and the tool kind that opens them, so "this bill" on /bills/<id> means that bill. */
const RECORD_PATHS: Record<string, string> = {
  dpr: 'dpr',
  progress: 'progress',
  'material-requests': 'material_request',
  'purchase-orders': 'purchase_order',
  'vendor-bills': 'vendor_bill',
  'work-orders': 'work_order',
  'subcontract-bills': 'subcontract_bill',
  bills: 'ra_bill',
  measurements: 'measurement',
  expenses: 'expense',
  inspections: 'inspection',
  machinery: 'machinery_log',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the panel says while a tool runs. */
const TOOL_STATUS: Record<string, string> = {
  search_records: 'Searching records',
  list_projects: 'Looking at projects',
  project_overview: 'Reading the project',
  company_overview: 'Reading company figures',
  my_work: 'Checking what needs you',
  approvals_waiting: 'Checking approvals',
  monthly_trends: 'Reading monthly trends',
  list_records: 'Reading records',
  get_record: 'Opening a record',
  draft_material_request: 'Filling in the material request',
  draft_expense: 'Filling in the expense',
  draft_progress: 'Filling in the progress entry',
  draft_dpr: 'Filling in the DPR',
  draft_letter: 'Writing the letter',
  schedule: 'Reading the schedule',
  project_cost: 'Reading project cost',
  project_budget: 'Reading the budget',
  cash_flow: 'Reading the cash-flow forecast',
  stock_on_hand: 'Checking stock',
  delivery_status: 'Checking deliveries',
  risks_summary: 'Reading delays and risks',
  ld_exposure: 'Reading LD exposure',
  expenses_summary: 'Reading site expenses',
  receivables_summary: 'Reading receivables',
  payables_summary: 'Reading payables',
  quality_summary: 'Reading quality',
  safety_summary: 'Reading safety',
  machinery_summary: 'Reading machinery',
};

type Emit = (e: AiStreamEvent) => void;

const istStart = (day: string) => new Date(`${day}T00:00:00.000+05:30`);
/** A calendar month as the sites see it (India), from its first moment to the next month's. */
const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { gte: istStart(`${month}-01`), lt: istStart(`${next}-01`) };
};
type OrgAi = { aiEnabled: boolean; aiMonthlyCapInr: number | null; aiRoles: string[]; code: string; trialEndsAt: Date | null; paidUntil: Date | null };
const ORG_AI = { aiEnabled: true, aiMonthlyCapInr: true, aiRoles: true, code: true, trialEndsAt: true, paidUntil: true } as const;
const rupees = (paise: number) => Math.round(paise) / 100;

/**
 * Ask Nirmaan (AI roadmap item 67): a question goes to the model with read-only tools; the answer streams back, its
 * links are kept only where a tool returned them, its figures are checked against the tool results, and the
 * conversation, tokens and estimated cost are stored per company.
 */
@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private tools: AiToolsService,
    private projects: ProjectsService,
    private audit: AuditService,
  ) {}

  private model(name?: string): AiModel {
    const c = aiConfig();
    return c.provider === 'fake' ? new FakeModel() : new MessagesModel(c.provider, c.apiKey!, (name && this.evalModel(name)) || c.model, c.effort);
  }

  private evalModel(name: string): string | undefined {
    const c = aiConfig();
    const named = modelName(name, c.provider);
    return c.evalModels.includes(named) ? named : undefined;
  }

  /** A question may name a model only to compare models, and only one the server lists in AI_EVAL_MODELS. */
  assertModel(name?: string) {
    if (name && !this.evalModel(name)) throw new BadRequestException('That model is not open for comparison on this server (AI_EVAL_MODELS)');
  }

  /**
   * Whether features that come to the user unasked (the morning brief) are offered: on for the company, open to their
   * role and the company not read-only. A used-up allowance still offers them; they wait for the next month.
   */
  async offeredTo(user: RequestUser): Promise<boolean> {
    const s = await this.status(user);
    return s.enabled || s.reason === 'CAP_REACHED';
  }

  async status(user: RequestUser): Promise<AiStatusDto> {
    const canManage = canManageAi(user.roleKey) && !user.support;
    // Guests use the portal, and staff looking at a company for support do not spend its allowance.
    if (!canUseAi(user.roleKey) || user.support) return { enabled: false, reason: 'COMPANY_OFF', questionsLeftToday: 0, canManage: false };
    if (!aiConfigured()) return { enabled: false, reason: 'NOT_CONFIGURED', questionsLeftToday: 0, canManage };
    const [org, spent, askedToday] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: ORG_AI }),
      this.spentThisMonth(user.organizationId),
      this.askedToday(user),
    ]);
    const left = Math.max(0, aiConfig().dailyQuestions - askedToday);
    if (!org?.aiEnabled) return { enabled: false, reason: 'COMPANY_OFF', questionsLeftToday: left, canManage };
    if (!aiRoleAllowed(user.roleKey, org.aiRoles)) return { enabled: false, reason: 'ROLE_OFF', questionsLeftToday: 0, canManage };
    const plan = await this.plan(user.organizationId, org);
    // A company whose trial or subscription ended reads but changes nothing, and runs up no AI cost (AI item 77).
    if (plan?.status === 'READ_ONLY') return { enabled: false, reason: 'READ_ONLY', questionsLeftToday: left, canManage };
    if (rupees(spent) >= this.capOf(org.aiMonthlyCapInr, plan)) return { enabled: false, reason: 'CAP_REACHED', questionsLeftToday: left, canManage };
    return { enabled: true, reason: null, questionsLeftToday: left, canManage };
  }

  /** What the plan includes (AI item 77); null when billing is off on this server or the company is not charged. */
  private async plan(organizationId: string, org: OrgAi): Promise<AiPlanDto | null> {
    const cfg = billingConfig();
    if (!cfg) return null;
    const { status } = billingState(cfg, org, todayIn());
    if (status === 'EXEMPT') return null;
    const units = await billingUnits(this.prisma, cfg, organizationId);
    return { status, allowanceInr: aiPlanAllowanceInr(cfg, status, units) ?? 0, unit: cfg.unit, units, perUnitInr: cfg.aiPerUnitInr, trialInr: cfg.aiTrialInr };
  }

  /** Refuses before the stream starts, so the panel gets a plain error it can show. */
  async assertCanAsk(user: RequestUser) {
    const s = await this.assertCanUse(user);
    if (s.questionsLeftToday <= 0) throw new HttpException("You have asked today's maximum number of questions. Ask again tomorrow.", HttpStatus.TOO_MANY_REQUESTS);
  }

  /** On for this user's company, set up on the server and within the month's allowance. */
  async assertCanUse(user: RequestUser): Promise<AiStatusDto> {
    if (!canUseAi(user.roleKey)) throw new ForbiddenException('Ask Nirmaan is for company staff');
    if (user.support) throw new ForbiddenException('Ask Nirmaan is not available in a support session');
    const s = await this.status(user);
    if (s.reason === 'NOT_CONFIGURED') throw new HttpException('Ask Nirmaan is not set up on this server yet', HttpStatus.SERVICE_UNAVAILABLE);
    if (s.reason === 'COMPANY_OFF') throw new ForbiddenException('Ask Nirmaan is switched off for your company. An admin can switch it on in Admin > Ask Nirmaan.');
    if (s.reason === 'ROLE_OFF') throw new ForbiddenException("Your company's admin has not opened Ask Nirmaan to your role.");
    if (s.reason === 'READ_ONLY')
      throw new HttpException(`Your ${PRODUCT_NAME} trial or subscription has ended, so Ask Nirmaan is paused. An admin can renew under Billing.`, HttpStatus.PAYMENT_REQUIRED);
    if (s.reason === 'CAP_REACHED') throw new HttpException("Your company has used this month's Ask Nirmaan allowance. An admin can raise it in Admin > Ask Nirmaan.", HttpStatus.TOO_MANY_REQUESTS);
    return s;
  }

  async threads(user: RequestUser): Promise<AiThreadDto[]> {
    const rows = await this.prisma.aiThread.findMany({ where: { organizationId: user.organizationId, userId: user.id }, orderBy: { updatedAt: 'desc' }, take: 30 });
    return rows.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt.toISOString() }));
  }

  async thread(user: RequestUser, id: string): Promise<AiThreadDetailDto> {
    const t = await this.prisma.aiThread.findFirst({ where: { id, organizationId: user.organizationId, userId: user.id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!t) throw new NotFoundException('Conversation not found');
    return { id: t.id, title: t.title, updatedAt: t.updatedAt.toISOString(), messages: t.messages.map(toDto) };
  }

  async deleteThread(user: RequestUser, id: string) {
    const { count } = await this.prisma.aiThread.deleteMany({ where: { id, organizationId: user.organizationId, userId: user.id } });
    if (!count) throw new NotFoundException('Conversation not found');
    return { ok: true };
  }

  async feedback(user: RequestUser, messageId: string, value: 1 | -1 | null) {
    const m = await this.prisma.aiMessage.findFirst({ where: { id: messageId, organizationId: user.organizationId, role: 'assistant', thread: { userId: user.id } } });
    if (!m) throw new NotFoundException('Answer not found');
    await this.prisma.aiMessage.update({ where: { id: m.id }, data: { feedback: value } });
    return { ok: true };
  }

  async settings(user: RequestUser, month = todayIn().slice(0, 7)): Promise<AiSettingsDto> {
    if (!canManageAi(user.roleKey)) throw new ForbiddenException('Only admins manage Ask Nirmaan');
    const range = monthRange(month);
    const [org, byFeature, byUser] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: ORG_AI }),
      this.spendByFeature(user.organizationId, range),
      this.usageByUser(user.organizationId, range),
    ]);
    const plan = await this.plan(user.organizationId, org);
    const spent = byFeature.reduce((s, f) => s + f.paise, 0);
    const questions = byFeature.find((f) => f.feature === 'QUESTIONS')!.count;
    return {
      enabled: org.aiEnabled,
      monthlyCapInr: org.aiMonthlyCapInr,
      effectiveCapInr: this.capOf(org.aiMonthlyCapInr, plan),
      plan,
      roles: org.aiRoles as RoleKey[],
      month,
      spentThisMonthInr: rupees(spent),
      questionsThisMonth: questions,
      byUser,
      byFeature: byFeature.map((f) => ({ feature: f.feature, count: f.count, spentInr: rupees(f.paise) })),
      configured: aiConfigured(),
      model: aiConfig().provider === 'fake' ? 'test stand-in' : aiConfig().model,
    };
  }

  async updateSettings(user: RequestUser, dto: UpdateAiSettingsDto): Promise<AiSettingsDto> {
    if (!canManageAi(user.roleKey) || user.support) throw new ForbiddenException('Only admins manage Ask Nirmaan');
    const data: Prisma.OrganizationUpdateInput = {};
    if (dto.enabled !== undefined) data.aiEnabled = dto.enabled;
    if (dto.monthlyCapInr !== undefined) data.aiMonthlyCapInr = dto.monthlyCapInr;
    const roles = dto.roles ? [...new Set(dto.roles)] : undefined;
    if (roles) data.aiRoles = roles;
    await this.prisma.organization.update({ where: { id: user.organizationId }, data });
    const note = [
      dto.enabled !== undefined ? `Ask Nirmaan ${dto.enabled ? 'on' : 'off'}` : null,
      dto.monthlyCapInr !== undefined ? `monthly allowance ${dto.monthlyCapInr === null ? 'back to the default' : `₹${dto.monthlyCapInr}`}` : null,
      roles ? `open to ${roles.length ? ['admins', ...roles.map((r) => ROLE_LABELS[r])].join(', ') : 'all staff'}` : null,
    ];
    await this.audit.log(user, 'COMPANY', user.organizationId, 'AI_SETTINGS', note.filter(Boolean).join(', '));
    return this.settings(user);
  }

  /**
   * Answers one question, streaming events through `emit`. Never throws once streaming has started: a failure is an
   * `error` event, and whatever the model was paid for is still recorded.
   */
  async ask(user: RequestUser, input: AiAskInput, emit: Emit, signal: AbortSignal): Promise<void> {
    const started = Date.now();
    const question = input.question.trim();
    const thread = input.threadId
      ? await this.prisma.aiThread.findFirst({ where: { id: input.threadId, organizationId: user.organizationId, userId: user.id } })
      : await this.prisma.aiThread.create({ data: { organizationId: user.organizationId, userId: user.id, title: titleOf(question) } });
    if (!thread) throw new NotFoundException('Conversation not found');
    emit({ type: 'thread', threadId: thread.id, title: thread.title });

    const earlier = await this.prisma.aiMessage.findMany({ where: { threadId: thread.id, text: { not: '' } }, orderBy: { createdAt: 'desc' }, take: HISTORY });
    await this.prisma.aiMessage.create({ data: { organizationId: user.organizationId, threadId: thread.id, role: 'user', text: question, page: (input.page ?? undefined) as Prisma.InputJsonValue | undefined } });

    const messages: ModelMessage[] = historyMessages(earlier.reverse());
    messages.push({ role: 'user', content: [{ type: 'text', text: await this.context(user, input) }, { type: 'text', text: question }] });

    const model = this.model(input.model);
    const tools = this.tools.definitions(user);
    const usage: AiUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let paise = 0;
    const results: unknown[] = [];
    const drafts: AiDraftDto[] = [];
    const calls: { name: string; input: unknown; error?: string }[] = [];
    const parts: string[] = [];
    let servedBy = model.name;
    let failure: string | null = null;
    const timeout = AbortSignal.timeout(ANSWER_TIMEOUT_MS);
    const both = AbortSignal.any([signal, timeout]);

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        let first = true;
        const turn = await model.turn({ system: SYSTEM_PROMPT, tools, messages, sessionId: thread.id }, (t) => {
          // A new round's text starts a new paragraph after what was already shown.
          if (first && parts.length) emit({ type: 'text', text: '\n\n' });
          first = false;
          emit({ type: 'text', text: t });
        }, both);
        servedBy = turn.model;
        usage.input += turn.usage.input;
        usage.output += turn.usage.output;
        usage.cacheRead += turn.usage.cacheRead;
        usage.cacheWrite += turn.usage.cacheWrite;
        paise += costPaise(turn.model, turn.usage);
        const text = turn.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
        if (text.trim()) parts.push(text);
        if (turn.stopReason === 'refusal') {
          failure = parts.length ? null : "I can't help with that one. Try asking about your projects, bills, stock or schedule.";
          break;
        }
        if (turn.stopReason !== 'tool_use') break;
        messages.push({ role: 'assistant', content: turn.content as Anthropic.Beta.BetaContentBlockParam[] });
        const uses = turn.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
        for (const name of new Set(uses.map((u) => u.name))) emit({ type: 'status', text: TOOL_STATUS[name] ?? 'Reading records' });
        const ran = await Promise.all(uses.map(async (u) => ({ use: u, out: await this.tools.run(user, u.name, u.input) })));
        const blocks: Anthropic.Beta.BetaToolResultBlockParam[] = ran.map(({ use, out }) => {
          calls.push({ name: use.name, input: use.input, ...(out.isError ? { error: out.text } : {}) });
          if (!out.isError) results.push(out.result);
          if (out.draft) drafts.push(out.draft);
          return { type: 'tool_result', tool_use_id: use.id, content: out.text, ...(out.isError ? { is_error: true } : {}) };
        });
        messages.push({ role: 'user', content: blocks });
        if (round === MAX_ROUNDS - 1) failure = 'This needed more lookups than I can do in one answer. Ask about one project or a shorter period.';
      }
    } catch (e) {
      if (signal.aborted) failure = 'Stopped.';
      else if (timeout.aborted) failure = 'That took too long. Ask about one project or a shorter period.';
      else {
        this.log.warn(`ask: ${(e as Error).message}`);
        failure = 'Sorry, I could not finish this answer. Please try again.';
      }
    }

    const draft = [parts.join('\n\n'), failure].filter(Boolean).join('\n\n');
    const { text, citations } = filterLinks(draft, collectHrefs(results));
    // Figures must be in what the tools returned, and so must quoted words (AI item 75: quotes from contracts).
    const unverified =
      failure && !parts.length
        ? []
        : [...unverifiedFigures(text, [...collectNumbers(results), ...derivedNumbers(results), ...collectNumbers(question)]), ...unverifiedQuotes(text, [...collectTexts(results), question])];
    const filled = groundDrafts(latestPerKind(drafts), results, question);
    const saved = await this.prisma.aiMessage.create({
      data: {
        organizationId: user.organizationId,
        threadId: thread.id,
        role: 'assistant',
        text,
        citations: citations as unknown as Prisma.InputJsonValue,
        unverified: unverified as unknown as Prisma.InputJsonValue,
        toolCalls: calls as unknown as Prisma.InputJsonValue,
        drafts: filled.length ? (filled as unknown as Prisma.InputJsonValue) : undefined,
        model: servedBy,
        inputTokens: usage.input,
        outputTokens: usage.output,
        cacheReadTokens: usage.cacheRead,
        cacheWriteTokens: usage.cacheWrite,
        costPaise: paise,
        durationMs: Date.now() - started,
      },
    });
    await this.prisma.aiThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    if (failure && !parts.length) emit({ type: 'error', message: failure });
    emit({ type: 'done', message: toDto(saved) });
  }

  /** Who is asking, today's date, the page and the picked project, as the question's first block. */
  private async context(user: RequestUser, input: AiAskInput): Promise<string> {
    const path = typeof input.page?.path === 'string' ? input.page.path.slice(0, 200) : null;
    const [, first, second] = path?.split('?')[0].split('/') ?? [];
    const record = first && RECORD_PATHS[first] && second && UUID.test(second) ? { kind: RECORD_PATHS[first], id: second } : null;
    const projectId = first === 'projects' && second && UUID.test(second) ? second : input.page?.projectId && UUID.test(input.page.projectId) ? input.page.projectId : null;
    const project = projectId ? await this.projects.get(user, projectId).catch(() => null) : null;
    return contextNote({ fullName: user.fullName, roleName: ROLE_LABELS[user.roleKey], today: todayIn(), page: path, record, projectId: project?.id, projectName: project?.name, language: input.language, phone: input.client === 'phone' });
  }

  /** The company's own cap, never above what its plan includes; without a plan, its own or the server default. */
  private capOf(own: number | null, plan: AiPlanDto | null): number {
    if (plan) return Math.min(own ?? plan.allowanceInr, plan.allowanceInr);
    return own ?? aiConfig().defaultMonthlyCapInr;
  }

  /** Answers, bill-check summaries, document reads, briefs and photo checks this calendar month, in paise. */
  private async spentThisMonth(organizationId: string): Promise<number> {
    return (await this.spendByFeature(organizationId, monthRange(todayIn().slice(0, 7)))).reduce((s, f) => s + f.paise, 0);
  }

  /** A calendar month's spend by what it went on: how many of each and their cost in paise. */
  private async spendByFeature(organizationId: string, createdAt: { gte: Date; lt: Date }): Promise<{ feature: AiFeature; count: number; paise: number }[]> {
    const where = { organizationId, createdAt };
    const [answers, questions, summaries, reads, briefs, photos] = await Promise.all([
      this.prisma.aiMessage.aggregate({ where, _sum: { costPaise: true } }),
      this.prisma.aiMessage.count({ where: { ...where, role: 'user' } }),
      this.prisma.billCheckSummary.aggregate({ where, _sum: { costPaise: true }, _count: { _all: true } }),
      this.prisma.aiDocumentRead.aggregate({ where, _sum: { costPaise: true }, _count: { _all: true } }),
      this.prisma.aiBrief.aggregate({ where, _sum: { costPaise: true }, _count: { _all: true } }),
      this.prisma.photoCheck.aggregate({ where: { ...where, model: { not: null } }, _sum: { costPaise: true }, _count: { _all: true } }),
    ]);
    return [
      { feature: 'QUESTIONS', count: questions, paise: answers._sum.costPaise ?? 0 },
      { feature: 'BILL_CHECKS', count: summaries._count._all, paise: summaries._sum.costPaise ?? 0 },
      { feature: 'DOCUMENT_READS', count: reads._count._all, paise: reads._sum.costPaise ?? 0 },
      { feature: 'BRIEFS', count: briefs._count._all, paise: briefs._sum.costPaise ?? 0 },
      { feature: 'PHOTO_CHECKS', count: photos._count._all, paise: photos._sum.costPaise ?? 0 },
    ];
  }

  /**
   * A short text for the overnight batch (AI item 74): the model rewrites the rules' draft from the facts alone, with no
   * tools. Its text is used only when `fits` takes it and every figure in it is in the facts; otherwise the draft is,
   * and a failed call also falls back to the draft. Null when the assistant is not on for this user, so nothing is written.
   */
  async writeFromFacts<T>(
    user: RequestUser,
    system: string,
    facts: unknown,
    draft: string,
    fits: (text: string) => T | null,
  ): Promise<{ value: T | null; text: string; unverified: string[]; model: string | null; costPaise: number } | null> {
    if ((await this.status(user)).enabled !== true) return null;
    try {
      const turn = await this.model().turn(
        { system, tools: [], messages: [{ role: 'user', content: `${JSON.stringify(facts)}\n\nDraft: ${draft}` }] },
        () => undefined,
        AbortSignal.timeout(45_000),
      );
      const text = turn.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      const unverified = unverifiedFigures(text, [...collectNumbers(facts), ...derivedNumbers(facts)]);
      const value = unverified.length ? null : fits(text);
      return { value, text, unverified, model: turn.model, costPaise: costPaise(turn.model, turn.usage) };
    } catch (e) {
      this.log.warn(`written from facts: ${(e as Error).message}`);
      return { value: null, text: '', unverified: [], model: null, costPaise: 0 };
    }
  }

  /**
   * One line for an approver about a bill's checks (AI item 69), written by the model from the flags alone, with no
   * tools. Null when the assistant is not on for this user; the caller then shows the rules' own line. A line with a
   * figure the flags do not contain is not used.
   */
  async checkSummary(user: RequestUser, facts: { bill: string; flags: { title: string; detail: string | null; accepted: boolean }[]; passed: string[] }, draft: string): Promise<{ text: string; model: string | null; costPaise: number } | null> {
    if ((await this.status(user)).enabled !== true) return null;
    const model = this.model();
    try {
      const turn = await model.turn(
        { system: CHECK_SUMMARY_PROMPT, tools: [], messages: [{ role: 'user', content: `${JSON.stringify(facts)}\n\nDraft: ${draft}` }] },
        () => undefined,
        AbortSignal.timeout(30_000),
      );
      const paise = costPaise(turn.model, turn.usage);
      const text = turn.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const grounded = text.length > 0 && text.length <= 300 && unverifiedFigures(text, [...collectNumbers(facts), ...derivedNumbers(facts)]).length === 0;
      return grounded ? { text, model: turn.model, costPaise: paise } : { text: draft, model: null, costPaise: paise };
    } catch (e) {
      this.log.warn(`check summary: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * One call to the model with no tools, for work that is not a question (reading a document): its text, the model that
   * answered and the cost. Throws when the assistant is not on for this user or the call fails.
   */
  async singleTurn(user: RequestUser, system: string, content: Anthropic.Beta.BetaContentBlockParam[], timeoutMs: number): Promise<{ text: string; model: string; costPaise: number }> {
    await this.assertCanUse(user);
    const turn = await this.model().turn({ system, tools: [], messages: [{ role: 'user', content }] }, () => undefined, AbortSignal.timeout(timeoutMs));
    const text = turn.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return { text, model: turn.model, costPaise: costPaise(turn.model, turn.usage) };
  }

  private askedToday(user: RequestUser): Promise<number> {
    return this.prisma.aiMessage.count({ where: { organizationId: user.organizationId, role: 'user', thread: { userId: user.id }, createdAt: { gte: istStart(todayIn()) } } });
  }

  /** Who used it in a month: their questions (and answers rated not helpful), documents read and morning briefs, with the cost. */
  private async usageByUser(organizationId: string, createdAt: { gte: Date; lt: Date }): Promise<AiUserUsageDto[]> {
    const where = { organizationId, createdAt };
    const [messages, reads, briefs] = await Promise.all([
      this.prisma.aiMessage.groupBy({ by: ['threadId', 'role', 'feedback'], where, _count: { _all: true }, _sum: { costPaise: true } }),
      this.prisma.aiDocumentRead.groupBy({ by: ['userId'], where, _count: { _all: true }, _sum: { costPaise: true } }),
      this.prisma.aiBrief.groupBy({ by: ['userId'], where: { ...where, userId: { not: null } }, _count: { _all: true }, _sum: { costPaise: true } }),
    ]);
    const threads = await this.prisma.aiThread.findMany({ where: { id: { in: [...new Set(messages.map((m) => m.threadId))] } }, select: { id: true, userId: true } });
    const ownerOf = new Map(threads.map((t) => [t.id, t.userId]));
    const by = new Map<string, Omit<AiUserUsageDto, 'fullName' | 'roleKey'> & { paise: number }>();
    const of = (userId: string) => by.get(userId) ?? by.set(userId, { userId, questions: 0, reads: 0, briefs: 0, notHelpful: 0, spentInr: 0, paise: 0 }).get(userId)!;
    for (const m of messages) {
      const u = of(ownerOf.get(m.threadId)!);
      if (m.role === 'user') u.questions += m._count._all;
      if (m.role === 'assistant' && m.feedback === -1) u.notHelpful += m._count._all;
      u.paise += m._sum.costPaise ?? 0;
    }
    for (const r of reads) {
      const u = of(r.userId);
      u.reads += r._count._all;
      u.paise += r._sum.costPaise ?? 0;
    }
    for (const b of briefs) {
      const u = of(b.userId!);
      u.briefs += b._count._all;
      u.paise += b._sum.costPaise ?? 0;
    }
    const people = await this.prisma.user.findMany({ where: { id: { in: [...by.keys()] }, organizationId }, select: { id: true, fullName: true, role: { select: { key: true } } } });
    const person = new Map(people.map((p) => [p.id, p]));
    return [...by.values()]
      .map(({ paise, ...u }) => ({ ...u, fullName: person.get(u.userId)?.fullName ?? 'Removed user', roleKey: (person.get(u.userId)?.role.key ?? 'SITE_ENGINEER') as RoleKey, spentInr: rupees(paise) }))
      .sort((a, b) => b.spentInr - a.spentInr || b.questions - a.questions);
  }

  private assertManage(user: RequestUser) {
    if (!canManageAi(user.roleKey)) throw new ForbiddenException('Only admins can read the Ask Nirmaan log');
    // People's conversations are for their own company's admins, not for support staff looking in.
    if (user.support) throw new ForbiddenException('The Ask Nirmaan log is not open in a support session');
  }

  private conversationWhere(user: RequestUser, f: AiConversationsQueryDto): Prisma.AiThreadWhereInput {
    const words = searchWords(f.q);
    return {
      organizationId: user.organizationId,
      ...(f.userId ? { userId: f.userId } : {}),
      ...(f.month ? { messages: { some: { createdAt: monthRange(f.month) } } } : {}),
      ...(words.length ? { AND: words.map((w) => ({ OR: [{ title: ilike(w) }, { messages: { some: { text: ilike(w) } } }] })) } : {}),
    };
  }

  /** The company's conversations with Ask Nirmaan (AI item 77), newest first, for its admins. */
  async conversations(user: RequestUser, f: AiConversationsQueryDto): Promise<Paginated<AiConversationDto>> {
    this.assertManage(user);
    const args = pageArgs(f);
    const where = this.conversationWhere(user, f);
    const [total, rows] = await Promise.all([
      this.prisma.aiThread.count({ where }),
      this.prisma.aiThread.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: args.skip, take: args.take, include: { user: { select: { fullName: true } } } }),
    ]);
    const stats = await this.prisma.aiMessage.groupBy({ by: ['threadId', 'role', 'feedback'], where: { threadId: { in: rows.map((r) => r.id) } }, _count: { _all: true }, _sum: { costPaise: true } });
    return paginated(
      rows.map((t) => {
        const mine = stats.filter((s) => s.threadId === t.id);
        return {
          id: t.id,
          title: t.title,
          userId: t.userId,
          fullName: t.user.fullName,
          questions: mine.filter((s) => s.role === 'user').reduce((n, s) => n + s._count._all, 0),
          notHelpful: mine.filter((s) => s.role === 'assistant' && s.feedback === -1).reduce((n, s) => n + s._count._all, 0),
          spentInr: rupees(mine.reduce((n, s) => n + (s._sum.costPaise ?? 0), 0)),
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        };
      }),
      total,
      args,
    );
  }

  /** One conversation as its person saw it, with what each answer cost and the tools it used. Reading it is audited. */
  async conversation(user: RequestUser, id: string): Promise<AiConversationDetailDto> {
    this.assertManage(user);
    const t = await this.prisma.aiThread.findFirst({ where: { id, organizationId: user.organizationId }, include: { user: { select: { fullName: true } }, messages: { orderBy: { createdAt: 'asc' } } } });
    if (!t) throw new NotFoundException('Conversation not found');
    await this.audit.log(user, 'AI_THREAD', t.id, 'AI_CONVERSATION_READ', `${t.user.fullName}: ${t.title}`);
    const messages = t.messages.map((m) => ({ ...toDto(m), model: m.model, costInr: rupees(m.costPaise), tools: toolNames(m.toolCalls) }));
    return {
      id: t.id,
      title: t.title,
      userId: t.userId,
      fullName: t.user.fullName,
      questions: t.messages.filter((m) => m.role === 'user').length,
      notHelpful: t.messages.filter((m) => m.role === 'assistant' && m.feedback === -1).length,
      spentInr: rupees(t.messages.reduce((n, m) => n + m.costPaise, 0)),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      messages,
    };
  }

  /** Every question and answer of the matching conversations, for a spreadsheet; at most AI_EXPORT_MAX_ROWS. Audited. */
  async exportConversations(user: RequestUser, f: AiConversationsQueryDto): Promise<AiConversationExportRowDto[]> {
    this.assertManage(user);
    const rows = await this.prisma.aiMessage.findMany({
      where: { organizationId: user.organizationId, thread: this.conversationWhere(user, f), ...(f.month ? { createdAt: monthRange(f.month) } : {}) },
      orderBy: [{ thread: { updatedAt: 'desc' } }, { threadId: 'asc' }, { createdAt: 'asc' }],
      take: AI_EXPORT_MAX_ROWS,
      include: { thread: { select: { title: true, user: { select: { fullName: true } } } } },
    });
    await this.audit.log(user, 'COMPANY', user.organizationId, 'AI_CONVERSATIONS_EXPORTED', `${rows.length} questions and answers${f.month ? ` from ${f.month}` : ''}${f.q ? ` matching “${f.q}”` : ''}`);
    return rows.map((m) => ({
      conversationId: m.threadId,
      title: m.thread.title,
      fullName: m.thread.user.fullName,
      at: m.createdAt.toISOString(),
      role: m.role === 'assistant' ? 'Answer' : 'Question',
      text: m.text,
      model: m.model,
      costInr: rupees(m.costPaise),
      rating: m.feedback === 1 ? 'Helpful' : m.feedback === -1 ? 'Not helpful' : null,
    }));
  }
}

/** The tools an answer called, each once, in order. */
const toolNames = (calls: Prisma.JsonValue): string[] => [...new Set((Array.isArray(calls) ? calls : []).map((c) => (c && typeof c === 'object' && 'name' in c ? String(c.name) : '')).filter(Boolean))];

const titleOf = (q: string) => (q.length > 80 ? `${q.slice(0, 77).trimEnd()}…` : q);

/** Earlier turns as plain text: questions and finished answers only, oldest first, starting with a question. */
function historyMessages(rows: { role: string; text: string }[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const r of rows) {
    const role = r.role === 'assistant' ? 'assistant' : 'user';
    if (!out.length && role === 'assistant') continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content = `${prev.content as string}\n\n${r.text}`;
    else out.push({ role, content: r.text });
  }
  // The new question follows, so the history must end with an answer.
  if (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}

/** A form drafted twice in one answer (the model fixed its first try) is offered once, as last drafted. */
function latestPerKind(drafts: AiDraftDto[]): AiDraftDto[] {
  return drafts.filter((d, i) => !drafts.slice(i + 1).some((later) => later.kind === d.kind));
}

/** Free text the model wrote into a draft: a figure in it must come from the question or a record read, or it is flagged. */
const DRAFT_TEXT_FIELDS = ['summary', 'workExecuted', 'materialReceived', 'issues', 'nextDayPlan', 'testsConducted', 'safetyObservations', 'remarks'];

export function groundDrafts(drafts: AiDraftDto[], results: unknown[], question: string): AiDraftDto[] {
  // Figures in a draft are the model's own, so they cannot vouch for themselves.
  const facts = results.map((r) => (r && typeof r === 'object' && 'draft' in r ? { ...(r as object), draft: undefined } : r));
  const known = [...collectNumbers(facts), ...derivedNumbers(facts), ...collectNumbers(question)];
  return drafts.map((d) => {
    const flags = [...d.flags];
    for (const field of DRAFT_TEXT_FIELDS) {
      const v = d.values[field];
      if (typeof v !== 'string') continue;
      const odd = unverifiedFigures(v, known);
      if (odd.length) flags.push({ field, note: `Check ${odd.length === 1 ? 'this figure' : 'these figures'}, not found in what you said or the records: ${odd.join(', ')}` });
    }
    return { ...d, flags };
  });
}

function toDto(m: { id: string; role: string; text: string; citations: Prisma.JsonValue; unverified: Prisma.JsonValue; drafts?: Prisma.JsonValue; feedback: number | null; createdAt: Date }): AiMessageDto {
  return {
    id: m.id,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    text: m.text,
    citations: (Array.isArray(m.citations) ? m.citations : []) as unknown as AiCitationDto[],
    unverified: (Array.isArray(m.unverified) ? m.unverified : []) as string[],
    feedback: m.feedback === 1 || m.feedback === -1 ? m.feedback : null,
    createdAt: m.createdAt.toISOString(),
    ...(Array.isArray(m.drafts) && m.drafts.length ? { drafts: m.drafts as unknown as AiDraftDto[] } : {}),
  };
}
