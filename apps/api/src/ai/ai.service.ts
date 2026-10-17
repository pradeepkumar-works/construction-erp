import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import type { AiAskInput, AiFeature, AiCitationDto, AiDraftDto, AiMessageDto, AiSettingsDto, AiStatusDto, AiStreamEvent, AiThreadDetailDto, AiThreadDto } from '@erp/shared';
import { ROLE_LABELS, canManageAi, canUseAi } from '@erp/shared';
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
import type { UpdateAiSettingsDto } from './ai.dto';

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

  /** Whether this company has the assistant on, for the signed-in user (AuthUser.ai). */
  async enabledFor(organizationId: string): Promise<boolean> {
    if (!aiConfigured()) return false;
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { aiEnabled: true } });
    return !!org?.aiEnabled;
  }

  async status(user: RequestUser): Promise<AiStatusDto> {
    const canManage = canManageAi(user.roleKey) && !user.support;
    // Guests use the portal, and staff looking at a company for support do not spend its allowance.
    if (!canUseAi(user.roleKey) || user.support) return { enabled: false, reason: 'COMPANY_OFF', questionsLeftToday: 0, canManage: false };
    if (!aiConfigured()) return { enabled: false, reason: 'NOT_CONFIGURED', questionsLeftToday: 0, canManage };
    const [org, spent, askedToday] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { aiEnabled: true, aiMonthlyCapInr: true } }),
      this.spentThisMonth(user.organizationId),
      this.askedToday(user),
    ]);
    const left = Math.max(0, aiConfig().dailyQuestions - askedToday);
    if (!org?.aiEnabled) return { enabled: false, reason: 'COMPANY_OFF', questionsLeftToday: left, canManage };
    if (rupees(spent) >= this.capOf(org.aiMonthlyCapInr)) return { enabled: false, reason: 'CAP_REACHED', questionsLeftToday: left, canManage };
    return { enabled: true, reason: null, questionsLeftToday: left, canManage };
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

  async settings(user: RequestUser): Promise<AiSettingsDto> {
    if (!canManageAi(user.roleKey)) throw new ForbiddenException('Only admins manage Ask Nirmaan');
    const monthStart = istStart(`${todayIn().slice(0, 7)}-01`);
    const [org, byFeature, byUser] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { aiEnabled: true, aiMonthlyCapInr: true } }),
      this.spendByFeature(user.organizationId),
      this.usageByUser(user.organizationId, monthStart),
    ]);
    const spent = byFeature.reduce((s, f) => s + f.paise, 0);
    const questions = byFeature.find((f) => f.feature === 'QUESTIONS')!.count;
    return {
      enabled: org.aiEnabled,
      monthlyCapInr: org.aiMonthlyCapInr,
      effectiveCapInr: this.capOf(org.aiMonthlyCapInr),
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
    await this.prisma.organization.update({ where: { id: user.organizationId }, data });
    const note = [dto.enabled !== undefined ? `Ask Nirmaan ${dto.enabled ? 'on' : 'off'}` : null, dto.monthlyCapInr !== undefined ? `monthly allowance ${dto.monthlyCapInr === null ? 'back to the default' : `₹${dto.monthlyCapInr}`}` : null];
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

  private capOf(own: number | null): number {
    return own ?? aiConfig().defaultMonthlyCapInr;
  }

  /** Answers, bill-check summaries, document reads and briefs this calendar month, in paise. */
  private async spentThisMonth(organizationId: string): Promise<number> {
    return (await this.spendByFeature(organizationId)).reduce((s, f) => s + f.paise, 0);
  }

  /** This calendar month's spend by what it went on: how many of each and their cost in paise. */
  private async spendByFeature(organizationId: string): Promise<{ feature: AiFeature; count: number; paise: number }[]> {
    const where = { organizationId, createdAt: { gte: istStart(`${todayIn().slice(0, 7)}-01`) } };
    const [answers, questions, summaries, reads, briefs] = await Promise.all([
      this.prisma.aiMessage.aggregate({ where, _sum: { costPaise: true } }),
      this.prisma.aiMessage.count({ where: { ...where, role: 'user' } }),
      this.prisma.billCheckSummary.aggregate({ where, _sum: { costPaise: true }, _count: { _all: true } }),
      this.prisma.aiDocumentRead.aggregate({ where, _sum: { costPaise: true }, _count: { _all: true } }),
      this.prisma.aiBrief.aggregate({ where, _sum: { costPaise: true }, _count: { _all: true } }),
    ]);
    return [
      { feature: 'QUESTIONS', count: questions, paise: answers._sum.costPaise ?? 0 },
      { feature: 'BILL_CHECKS', count: summaries._count._all, paise: summaries._sum.costPaise ?? 0 },
      { feature: 'DOCUMENT_READS', count: reads._count._all, paise: reads._sum.costPaise ?? 0 },
      { feature: 'BRIEFS', count: briefs._count._all, paise: briefs._sum.costPaise ?? 0 },
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

  private async usageByUser(organizationId: string, since: Date): Promise<AiSettingsDto['byUser']> {
    const rows = await this.prisma.aiMessage.findMany({ where: { organizationId, createdAt: { gte: since } }, select: { role: true, costPaise: true, thread: { select: { userId: true, user: { select: { fullName: true } } } } } });
    const by = new Map<string, AiSettingsDto['byUser'][number]>();
    for (const r of rows) {
      const u = by.get(r.thread.userId) ?? { userId: r.thread.userId, fullName: r.thread.user.fullName, questions: 0, spentInr: 0 };
      if (r.role === 'user') u.questions += 1;
      u.spentInr += r.costPaise / 100;
      by.set(u.userId, u);
    }
    return [...by.values()].map((u) => ({ ...u, spentInr: Math.round(u.spentInr * 100) / 100 })).sort((a, b) => b.questions - a.questions).slice(0, 20);
  }
}

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
