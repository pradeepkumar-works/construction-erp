import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canUseAi, type BriefLineDto, type BriefStatusDto, type MorningBriefDto, type RoleKey } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { dateOnly, parseDate } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { HomeService } from '../dashboard/home.service';
import { ReportsService } from '../reports/reports.service';
import { todayIn } from '../notifications/time';
import { addDays, asPicks, morningCandidates, morningDraft, narrativeDraft, narrativeFacts, narrativeFits, parsePicks, type MorningFacts } from './brief-rules';

const MORNING_PROMPT = `You write a construction company employee's morning brief: at most three short lines on what needs them today.
You get their facts as JSON, then the numbered candidate lines the rules wrote from those facts, then the rules' own pick as a draft.
Pick the three candidates that matter most this morning (fewer if there are fewer) and say each in plain, direct English, at most 110 characters, like a colleague would.
Keep every figure exactly as the candidate or the facts give it; add no figure, name or date of your own, and give no advice.
Reply with only a JSON list in the draft's form: [{"line": "…", "from": <candidate number>}].`;

const WEEK_PROMPT = `You write the summary paragraph at the top of a construction project's weekly progress report, which goes to the client.
You get the week's facts as JSON and the rules' own paragraph as a draft.
Write one plain, factual paragraph of at most 120 words in English: progress against time, the main work done, what held work up, what comes next.
Use only figures that are in the facts, written as the facts give them. No money, no blame, no promises, no advice, no headings or lists.
Reply with only the paragraph.`;

const BATCH = 4;
type Row = { id: string; organizationId: string; email: string; fullName: string; role: { key: string } };
const asUser = (u: Row): RequestUser => ({ id: u.id, organizationId: u.organizationId, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName });

/** Runs `fn` over `items`, a few at a time. */
async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += BATCH) await Promise.all(items.slice(i, i + BATCH).map(fn));
}

export interface BriefBatchResult {
  date: string;
  written: number;
  byAssistant: number;
  skipped: number;
  costPaise: number;
}

/**
 * The morning brief and the weekly narrative (AI item 74), written in the overnight batch. The brief is for users who
 * asked for it, built from their own My work (so their role's limits apply); the narrative is for each active project
 * in a company with Ask Nirmaan on. The model rewrites the rules' draft from the facts alone; its text is kept only when
 * every figure in it is in the facts, and either way the cost counts in the company's monthly allowance.
 */
@Injectable()
export class BriefsService {
  private readonly log = new Logger(BriefsService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private home: HomeService,
    private lifecycle: SubmissionLifecycleService,
    private reports: ReportsService,
  ) {}

  /** Whether the brief is offered to this user: their role may use Ask Nirmaan and the company has it on. */
  private async offered(user: RequestUser): Promise<boolean> {
    return this.ai.offeredTo(user);
  }

  async today(user: RequestUser, date = todayIn()): Promise<BriefStatusDto> {
    const [available, me, row] = await Promise.all([
      this.offered(user),
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { morningBrief: true } }),
      this.prisma.aiBrief.findUnique({ where: { organizationId_key: { organizationId: user.organizationId, key: `MORNING:${user.id}:${date}` } } }),
    ]);
    return { available, optedIn: me.morningBrief, brief: available && me.morningBrief && row ? toBrief(row) : null };
  }

  /** The user's own opt-in. Turning it on writes today's brief at once, so they see what it is like. */
  async setOptIn(user: RequestUser, on: boolean): Promise<BriefStatusDto> {
    if (user.support) throw new BadRequestException('A support session cannot change this');
    if (on && !(await this.offered(user))) throw new BadRequestException('The morning brief needs Ask Nirmaan switched on for your company. An admin can switch it on in Admin > Ask Nirmaan.');
    await this.prisma.user.update({ where: { id: user.id }, data: { morningBrief: on } });
    if (on) await this.writeMorning(user, todayIn()).catch((e: Error) => this.log.warn(`first brief for ${user.id}: ${e.message}`));
    return this.today(user);
  }

  /** The facts one person's brief is built from, as their role sees them. */
  async morningFacts(user: RequestUser, date: string): Promise<MorningFacts> {
    const [work, pending] = await Promise.all([this.home.myWork(user), this.lifecycle.pending(user)]);
    const today = parseDate(date).getTime();
    const ages = pending.map((p) => Math.round((today - parseDate(todayIn(undefined, new Date(p.submittedAt))).getTime()) / 86_400_000));
    const oldest = pending[0];
    const oldestBill = (work.receivables?.items ?? [])[0];
    return {
      today: date,
      approvals: work.approvals ? { count: pending.length, overTwoDays: ages.filter((a) => a > 2).length, oldestDays: ages.length ? Math.max(...ages) : 0, oldest: oldest ? { type: oldest.type, title: oldest.title, projectName: oldest.projectName } : null } : null,
      sentBack: work.sentBack ? { count: work.sentBack.count, href: work.sentBack.items[0]?.href ?? null } : null,
      warnings: work.watchList ? { count: work.watchList.count, top: work.watchList.items.slice(0, 2).map((i) => ({ title: i.label, projectName: i.projectName })) } : null,
      payablesDue: work.payablesDue ? { count: work.payablesDue.count, amount: work.payablesDue.amount ?? '0' } : null,
      lateDeliveries: work.lateDeliveries ? { count: work.lateDeliveries.count, amount: work.lateDeliveries.amount ?? '0' } : null,
      receivables: work.receivables ? { count: work.receivables.count, amount: work.receivables.amount ?? '0', oldestDays: Number(/(\d+)/.exec(oldestBill?.note ?? '')?.[1] ?? 0) } : null,
      expiring: work.expiring ? { count: work.expiring.count } : null,
      lowStock: work.lowStock ? { count: work.lowStock.count } : null,
    };
  }

  /** Writes one person's brief for `date`, once. Null when the assistant is not on for them. */
  async writeMorning(user: RequestUser, date: string) {
    const key = `MORNING:${user.id}:${date}`;
    const existing = await this.prisma.aiBrief.findUnique({ where: { organizationId_key: { organizationId: user.organizationId, key } } });
    if (existing) return existing;
    const facts = await this.morningFacts(user, date);
    const candidates = morningCandidates(facts);
    const draft = morningDraft(candidates);
    const numbered = { facts, candidates: candidates.map((c, i) => ({ number: i, line: c.text })) };
    const written = await this.ai.writeFromFacts(user, MORNING_PROMPT, numbered, asPicks(candidates, draft), (text) => parsePicks(text, candidates));
    if (!written) return null;
    const lines = written.value ?? draft;
    return this.save(user.organizationId, { kind: 'MORNING', key, userId: user.id, date, lines, written });
  }

  /** The overnight batch's briefs: every active user who asked for one, in a company with Ask Nirmaan on. */
  async writeMornings(date = todayIn()): Promise<BriefBatchResult> {
    const result: BriefBatchResult = { date, written: 0, byAssistant: 0, skipped: 0, costPaise: 0 };
    const users = await this.prisma.user.findMany({ where: { isActive: true, morningBrief: true, organization: { aiEnabled: true, suspendedAt: null } }, select: { id: true, organizationId: true, email: true, fullName: true, role: { select: { key: true } } } });
    await inBatches(users, async (u) => {
      const user = asUser(u);
      if (!canUseAi(user.roleKey)) return void result.skipped++;
      const before = await this.prisma.aiBrief.count({ where: { organizationId: u.organizationId, key: `MORNING:${u.id}:${date}` } });
      const row = before ? null : await this.writeMorning(user, date).catch((e: Error) => void this.log.warn(`brief for ${u.id}: ${e.message}`));
      if (!row) return void result.skipped++;
      result.written++;
      if (row.byAssistant) result.byAssistant++;
      result.costPaise += row.costPaise;
    });
    this.log.log(`Morning briefs ${date}: ${JSON.stringify(result)}`);
    return result;
  }

  /** Writes a project's narrative for the week starting `monday`, once, as `actor` (who must see the project). */
  async writeNarrative(actor: RequestUser, projectId: string, monday: string) {
    const key = `WEEK:${projectId}:${monday}`;
    const existing = await this.prisma.aiBrief.findUnique({ where: { organizationId_key: { organizationId: actor.organizationId, key } } });
    if (existing) return existing;
    const report = await this.reports.progress(actor, { projectId, from: monday, to: addDays(monday, 6) });
    const facts = narrativeFacts(report);
    const draft = narrativeDraft(facts);
    const written = await this.ai.writeFromFacts(actor, WEEK_PROMPT, facts, draft, (text) => (narrativeFits(text) ? text.trim().replace(/\s+/g, ' ') : null));
    if (!written) return null;
    return this.save(actor.organizationId, { kind: 'WEEK', key, projectId, date: monday, lines: [{ text: written.value ?? draft, href: null }], written });
  }

  /**
   * The weekly batch: last week's narrative (Monday to Sunday before `date`) for every active project in a company with
   * Ask Nirmaan on, written as the company's first admin. A project with nothing recorded that week gets none.
   */
  async writeNarratives(date = todayIn()): Promise<BriefBatchResult> {
    const monday = addDays(date, -(((parseDate(date).getUTCDay() + 6) % 7) + 7));
    const result: BriefBatchResult = { date: monday, written: 0, byAssistant: 0, skipped: 0, costPaise: 0 };
    const orgs = await this.prisma.organization.findMany({ where: { aiEnabled: true, suspendedAt: null }, select: { id: true } });
    for (const org of orgs) {
      const admin = await this.prisma.user.findFirst({ where: { organizationId: org.id, isActive: true, role: { key: 'ADMIN' } }, orderBy: { createdAt: 'asc' }, select: { id: true, organizationId: true, email: true, fullName: true, role: { select: { key: true } } } });
      if (!admin) continue;
      const from = parseDate(monday);
      const to = parseDate(addDays(monday, 6));
      const projects = await this.prisma.project.findMany({
        where: { organizationId: org.id, status: 'ACTIVE', OR: [{ dailyReports: { some: { date: { gte: from, lte: to }, status: 'APPROVED' } } }, { progressEntries: { some: { date: { gte: from, lte: to }, status: 'APPROVED' } } }] },
        select: { id: true },
      });
      await inBatches(projects, async (p) => {
        const row = await this.writeNarrative(asUser(admin), p.id, monday).catch((e: Error) => void this.log.warn(`narrative for ${p.id}: ${e.message}`));
        if (!row) return void result.skipped++;
        result.written++;
        if (row.byAssistant) result.byAssistant++;
        result.costPaise += row.costPaise;
      });
    }
    this.log.log(`Weekly narratives for ${monday}: ${JSON.stringify(result)}`);
    return result;
  }

  private async save(
    organizationId: string,
    b: { kind: 'MORNING' | 'WEEK'; key: string; userId?: string; projectId?: string; date: string; lines: BriefLineDto[]; written: NonNullable<Awaited<ReturnType<AiService['writeFromFacts']>>> },
  ) {
    const data = {
      organizationId,
      kind: b.kind,
      key: b.key,
      userId: b.userId ?? null,
      projectId: b.projectId ?? null,
      date: parseDate(b.date),
      lines: b.lines as unknown as Prisma.InputJsonValue,
      byAssistant: b.written.value !== null,
      unverified: b.written.unverified.length ? b.written.unverified : Prisma.DbNull,
      model: b.written.model,
      costPaise: b.written.costPaise,
    };
    try {
      return await this.prisma.aiBrief.create({ data });
    } catch (e) {
      // Written meanwhile by another run.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.prisma.aiBrief.findUniqueOrThrow({ where: { organizationId_key: { organizationId, key: b.key } } });
      throw e;
    }
  }
}

export function toBrief(row: { date: Date; lines: Prisma.JsonValue; createdAt: Date; byAssistant: boolean }): MorningBriefDto {
  return { date: dateOnly(row.date)!, lines: row.lines as unknown as BriefLineDto[], writtenAt: row.createdAt.toISOString(), byAssistant: row.byAssistant };
}
