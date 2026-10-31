import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_NOTICE_DAYS,
  DELAY_PARTIES,
  HINDRANCE_LOOKBACK_DAYS,
  RISK_CATEGORIES,
  RISK_CATEGORY_LABELS,
  canDraftNotice,
  canReviewHindrances,
  canViewContract,
  canViewLetters,
  delayDays,
  needsNotice,
  type AiDraftDto,
  type DelayParty,
  type DelayRegisterDto,
  type DelayRegisterRowDto,
  type HindranceSource,
  type HindranceSuggestionDto,
  type NoticeClockDto,
  type NoticePeriodDto,
  type RiskCategory,
  type RiskDto,
} from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, parseDate } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from '../notifications/time';
import { RisksService } from '../risks/risks.service';
import { DocumentTextService } from '../documents/document-text.service';
import { AiService } from '../ai/ai.service';
import { addDays, classifyRemark, eotClause, noticeClause, noticeClock, noticeLetter, type Reading } from './hindrance-rules';
import type { RecordHindranceDto } from './hindrance.dto';

const sent = { in: ['SUBMITTED', 'APPROVED'] as ('SUBMITTED' | 'APPROVED')[] };
/** Remarks the model reads in one request, so a first load after a quiet month stays quick; the rest wait for the next. */
const MODEL_READS_PER_LOAD = 5;

const HINDRANCE_PROMPT = `You read one remark from a construction site's daily progress report (India; English, Hindi or Hinglish).
Say whether it records a hindrance: an event that stopped or slowed the works for a day or more. Routine notes, a few
hours lost to the contractor's own supply or machines, and "nil" are not hindrances.
Reply with JSON only: {"hindrance": true|false, "category": one of ${RISK_CATEGORIES.join(', ')}, "party": one of ${DELAY_PARTIES.join(', ')} or null, "title": a short title of under 80 characters}.
CONTRACTOR is the contractor's own labour, material or machines; CLIENT the client's land, drawings, decisions, payments
or supplied material; THIRD_PARTY villagers, utilities and permitting bodies; FORCE_MAJEURE weather, bandh and the like.`;

/** "Clause 9.1 of RD-AGR-01, page 3" */
const clauseSource = (c: { clause: string; docNo: string; page: number }) => `Clause ${c.clause} of ${c.docNo}, page ${c.page}`;

/**
 * Hindrance register to notice. DPR remarks are read for hindrances (rules first, the model for those the
 * rules cannot place) and kept with what the project manager decided, so each is read once. Recording one raises a delay
 * through `RisksService`; an open delay the contractor is not answerable for runs a notice clock (`noticeDays` on the
 * contract, else 14) until an outgoing letter is linked to it, which the watch list shows as NOTICE_DUE. Draft notice
 * writes that letter from the delay's own facts and the contract's clauses; nothing is sent or saved by it.
 */
@Injectable()
export class HindranceService {
  private readonly log = new Logger(HindranceService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private risks: RisksService,
    private documents: DocumentTextService,
    private ai: AiService,
  ) {}

  private assertReviewer(user: RequestUser) {
    if (!canReviewHindrances(user.roleKey)) throw new ForbiddenException('Hindrances from the DPRs are for project managers to record');
  }

  // Reading the DPRs

  /** The model's reading of a remark the rules could not place, or null when it is off, fails or answers out of shape. */
  private async modelRead(user: RequestUser, remark: string, reportDate: string): Promise<Reading | null> {
    try {
      const { text } = await this.ai.singleTurn(user, HINDRANCE_PROMPT, [{ type: 'text', text: `Hindrance check.\nReport date: ${reportDate}\nRemark: ${remark}` }], 20_000);
      const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { hindrance?: unknown; category?: unknown; party?: unknown; title?: unknown };
      if (typeof json.hindrance !== 'boolean') return null;
      const rules = classifyRemark(remark, reportDate);
      if (!json.hindrance) return { ...rules, verdict: 'NONE' };
      const category = RISK_CATEGORIES.includes(json.category as RiskCategory) ? (json.category as RiskCategory) : 'OTHER';
      const party = DELAY_PARTIES.includes(json.party as DelayParty) ? (json.party as DelayParty) : null;
      const title = typeof json.title === 'string' && json.title.trim() ? json.title.trim().slice(0, 120) : rules.title;
      return { ...rules, verdict: 'HINDRANCE', category, party, title };
    } catch (e) {
      this.log.warn(`hindrance read: ${(e as Error).message}`);
      return null;
    }
  }

  /** Reads the remarks of DPRs sent in the look-back that have not been read, or were changed since. */
  private async readNew(user: RequestUser, projectIds: string[], today: string) {
    if (!projectIds.length) return;
    const reports = await this.prisma.dailyReport.findMany({
      where: { projectId: { in: projectIds }, status: sent, date: { gte: parseDate(addDays(today, -HINDRANCE_LOOKBACK_DAYS)) }, issues: { not: null } },
      select: { id: true, projectId: true, date: true, issues: true, hindrance: { select: { remark: true, decision: true } } },
      orderBy: { date: 'asc' },
    });
    let modelReads = 0;
    let modelOn: boolean | null = null;
    for (const r of reports) {
      const remark = (r.issues ?? '').trim();
      if (!remark || (r.hindrance && (r.hindrance.remark === remark || r.hindrance.decision !== 'PENDING'))) continue;
      const date = dateOnly(r.date);
      let reading = classifyRemark(remark, date);
      let source: HindranceSource = 'RULES';
      if (reading.verdict === 'UNSURE' && modelReads < MODEL_READS_PER_LOAD) {
        modelOn ??= (await this.ai.status(user)).enabled === true;
        if (modelOn) {
          modelReads++;
          const read = await this.modelRead(user, remark, date);
          if (read) {
            reading = read;
            source = 'MODEL';
          }
        }
      }
      const data = {
        remark,
        verdict: reading.verdict,
        category: reading.verdict === 'NONE' ? null : reading.category,
        party: reading.verdict === 'NONE' ? null : reading.party,
        title: reading.verdict === 'NONE' ? null : reading.title,
        delayStart: reading.verdict === 'NONE' ? null : parseDate(addDays(date, -reading.startOffset)),
        matched: reading.matched,
        source,
      };
      await this.prisma.hindranceCheck.upsert({
        where: { dailyReportId: r.id },
        create: { organizationId: user.organizationId, dailyReportId: r.id, projectId: r.projectId, ...data },
        update: data,
      });
    }
  }

  private async scopeProjects(user: RequestUser, projectId?: string) {
    const projects = await this.prisma.project.findMany({
      where: { ...this.access.projectWhere(user), status: 'ACTIVE', type: { notIn: ['STORE', 'PLANT'] }, ...(projectId ? { id: projectId } : {}) },
      select: { id: true, code: true, name: true },
    });
    return projects;
  }

  /** DPR remarks read as hindrances and not yet recorded or dismissed, newest first. */
  async suggestions(user: RequestUser, projectId?: string): Promise<HindranceSuggestionDto[]> {
    this.assertReviewer(user);
    const today = todayIn();
    const projects = await this.scopeProjects(user, projectId);
    await this.readNew(
      user,
      projects.map((p) => p.id),
      today,
    );
    return this.pending(user, projects);
  }

  private async pending(user: RequestUser, projects: { id: string; code: string; name: string }[], dprId?: string): Promise<HindranceSuggestionDto[]> {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const rows = await this.prisma.hindranceCheck.findMany({
      where: { organizationId: user.organizationId, projectId: { in: [...byId.keys()] }, decision: 'PENDING', verdict: { not: 'NONE' }, ...(dprId ? { dailyReportId: dprId } : {}) },
      include: { dailyReport: { select: { date: true } } },
      orderBy: [{ dailyReport: { date: 'desc' } }, { id: 'asc' }],
    });
    const open = await this.prisma.risk.findMany({
      where: { organizationId: user.organizationId, projectId: { in: [...byId.keys()] }, kind: 'DELAY', status: { not: 'CLOSED' } },
      select: { id: true, riskNo: true, title: true, projectId: true, category: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => {
      const p = byId.get(r.projectId)!;
      const category = r.category ?? 'OTHER';
      const same = open.find((d) => d.projectId === r.projectId && d.category === category);
      return {
        id: r.id,
        dprId: r.dailyReportId,
        projectId: r.projectId,
        projectCode: p.code,
        projectName: p.name,
        reportDate: dateOnly(r.dailyReport.date),
        remark: r.remark,
        title: r.title ?? r.remark.slice(0, 80),
        category,
        party: r.party,
        delayStart: dateOnly(r.delayStart) ?? dateOnly(r.dailyReport.date),
        matched: r.matched,
        source: r.source as HindranceSource,
        openDelay: same ? { id: same.id, riskNo: same.riskNo, title: same.title } : null,
      };
    });
  }

  /** The hindrance a DPR's remark reads as, for its record page; null when there is none to record. */
  async forReport(user: RequestUser, dprId: string): Promise<HindranceSuggestionDto | null> {
    if (!canReviewHindrances(user.roleKey)) return null;
    const dpr = await this.prisma.dailyReport.findFirst({ where: { id: dprId, ...this.access.submissionWhere(user) }, select: { projectId: true } });
    if (!dpr) throw new NotFoundException('DPR not found');
    const projects = await this.scopeProjects(user, dpr.projectId);
    await this.readNew(
      user,
      projects.map((p) => p.id),
      todayIn(),
    );
    return (await this.pending(user, projects, dprId))[0] ?? null;
  }

  private async pendingCheck(user: RequestUser, id: string) {
    const check = await this.prisma.hindranceCheck.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { dailyReport: { select: { date: true, projectId: true } } },
    });
    if (!check || !(await this.prisma.project.count({ where: { id: check.projectId, ...this.access.projectWhere(user) } }))) throw new NotFoundException('Hindrance not found');
    if (check.decision !== 'PENDING') throw new BadRequestException(check.decision === 'RECORDED' ? 'This hindrance is already recorded' : 'This hindrance was dismissed');
    return check;
  }

  /** Records a hindrance: as a new delay with the values given (the suggestion's by default), or into an open delay. */
  async record(user: RequestUser, id: string, dto: RecordHindranceDto): Promise<RiskDto> {
    this.assertReviewer(user);
    const check = await this.pendingCheck(user, id);
    let risk: RiskDto;
    if (dto.riskId) {
      risk = await this.risks.get(user, dto.riskId);
      if (risk.projectId !== check.projectId || risk.kind !== 'DELAY') throw new BadRequestException('Choose an open delay on the same project');
    } else {
      const reportDate = dateOnly(check.dailyReport.date);
      risk = await this.risks.create(user, {
        projectId: check.projectId,
        kind: 'DELAY',
        category: dto.category ?? check.category ?? 'OTHER',
        title: (dto.title ?? check.title ?? check.remark).slice(0, 200),
        description: `From the DPR of ${reportDate}: ${check.remark}`.slice(0, 2000),
        activityId: dto.activityId ?? null,
        impact: 3,
        delayStart: dto.delayStart ?? dateOnly(check.delayStart) ?? reportDate,
        responsibleParty: dto.party !== undefined ? dto.party : check.party,
      });
    }
    await this.prisma.hindranceCheck.update({ where: { id }, data: { decision: 'RECORDED', riskId: risk.id, decidedById: user.id, decidedAt: new Date() } });
    await this.audit.log(user, 'RISK', risk.id, 'UPDATED', `Hindrance from the DPR of ${dateOnly(check.dailyReport.date)} recorded`);
    return risk;
  }

  async dismiss(user: RequestUser, id: string) {
    this.assertReviewer(user);
    await this.pendingCheck(user, id);
    await this.prisma.hindranceCheck.update({ where: { id }, data: { decision: 'DISMISSED', decidedById: user.id, decidedAt: new Date() } });
    return { ok: true };
  }

  // The notice period and the clock

  private async project(user: RequestUser, projectId: string) {
    const p = await this.prisma.project.findFirst({
      where: { id: projectId, ...this.access.projectWhere(user) },
      select: { id: true, code: true, name: true, noticeDays: true, agreementNo: true, clientName: true, client: { select: { name: true } } },
    });
    if (!p) throw new NotFoundException('Project not found or not accessible');
    return p;
  }

  /** The notice clause in the project's filed contract, with its page, or null. */
  private async foundClause(user: RequestUser, projectId: string): Promise<NoticePeriodDto['found']> {
    const hits = (await this.documents.search(user, { query: 'notice hindrance within days', projectId, limit: 5 })).hits.filter((h) => h.source === 'DOCUMENT' && h.page);
    for (const h of hits) {
      const c = noticeClause(h.text);
      if (c) return { days: c.days, clause: c.no, text: c.text, docNo: h.title.split(' ')[0], page: h.page!, documentId: /file=([^&]+)/.exec(h.href)?.[1] ?? '' };
    }
    return null;
  }

  async noticePeriod(user: RequestUser, projectId: string): Promise<NoticePeriodDto> {
    if (!canViewContract(user.roleKey) && !canDraftNotice(user.roleKey)) throw new ForbiddenException('Your role does not see the contract');
    const p = await this.project(user, projectId);
    return { projectId, days: p.noticeDays, effectiveDays: p.noticeDays ?? DEFAULT_NOTICE_DAYS, found: await this.foundClause(user, projectId) };
  }

  /** The clocks of a project's delays (or one delay), as of today. */
  private async clocks(user: RequestUser, where: { projectId: string; id?: string }, noticeDays: number | null) {
    const today = todayIn();
    const delays = await this.prisma.risk.findMany({
      where: { organizationId: user.organizationId, kind: 'DELAY', ...where },
      include: {
        letters: { where: { status: { in: ['ISSUED', 'OPEN', 'CLOSED'] } }, select: { id: true, letterNo: true, letterDate: true, direction: true, subject: true }, orderBy: { letterDate: 'asc' } },
        activity: { select: { name: true } },
        hindrances: { where: { decision: 'RECORDED' }, select: { remark: true, dailyReport: { select: { date: true } } } },
      },
      orderBy: [{ delayStart: 'asc' }, { riskNo: 'asc' }],
    });
    const days = noticeDays ?? DEFAULT_NOTICE_DAYS;
    const source = noticeDays !== null ? 'Set on the contract' : `${DEFAULT_NOTICE_DAYS} days assumed: set the contract’s notice period on its Contract tab`;
    return delays.map((d) => {
      const start = dateOnly(d.delayStart) ?? dateOnly(d.createdAt);
      const clock = noticeClock(start, days, today);
      const out = d.letters.find((l) => l.direction === 'OUT');
      const notice: NoticeClockDto = {
        riskId: d.id,
        running: d.status !== 'CLOSED' && needsNotice(d.responsibleParty) && !out,
        noticeDays: days,
        due: clock.due,
        daysLeft: clock.daysLeft,
        noticeSent: out ? { letterId: out.id, letterNo: out.letterNo ?? '', letterDate: dateOnly(out.letterDate) } : null,
        source,
      };
      return { d, start, notice };
    });
  }

  async notice(user: RequestUser, riskId: string): Promise<NoticeClockDto> {
    const risk = await this.risks.get(user, riskId);
    if (risk.kind !== 'DELAY') throw new BadRequestException('Only a delay has a notice clock');
    const p = await this.project(user, risk.projectId);
    return (await this.clocks(user, { projectId: p.id, id: riskId }, p.noticeDays))[0].notice;
  }

  /** The notice letter for a delay, for the letter form: from the delay, its DPR remarks and photos and the contract's clauses. */
  async draftNotice(user: RequestUser, riskId: string): Promise<AiDraftDto> {
    if (!canDraftNotice(user.roleKey)) throw new ForbiddenException('Your role cannot write letters');
    const risk = await this.risks.get(user, riskId);
    if (risk.kind !== 'DELAY' || !risk.delayStart) throw new BadRequestException('Only a delay with the date work was held up has a notice');
    const p = await this.project(user, risk.projectId);
    const [{ d, notice }] = await this.clocks(user, { projectId: p.id, id: riskId }, p.noticeDays);
    const found = await this.foundClause(user, p.id);
    const eotHits = (await this.documents.search(user, { query: 'extension of time claim delay', projectId: p.id, limit: 5 })).hits.filter((h) => h.source === 'DOCUMENT');
    const eot = eotHits.map((h) => eotClause(h.text)).find(Boolean) ?? null;
    const photos = await this.prisma.attachment.count({ where: { OR: [{ riskId }, { dailyReportId: { in: (await this.prisma.hindranceCheck.findMany({ where: { riskId }, select: { dailyReportId: true } })).map((h) => h.dailyReportId) } }], mimeType: { startsWith: 'image/' } } });
    const today = todayIn();
    const party = p.client?.name ?? p.clientName ?? undefined;
    const { subject, lines } = noticeLetter({
      projectName: p.name,
      agreementNo: p.agreementNo,
      title: risk.title,
      description: risk.description && !risk.description.startsWith('From the DPR of') ? risk.description : null,
      categoryLabel: RISK_CATEGORY_LABELS[risk.category],
      activityName: risk.activityName,
      delayStart: risk.delayStart,
      delayEnd: risk.delayEnd,
      today,
      remarks: d.hindrances.map((h) => ({ date: dateOnly(h.dailyReport.date), text: h.remark })).sort((a, b) => a.date.localeCompare(b.date)),
      photos,
      clause: found ? { no: found.clause, docNo: found.docNo, days: found.days } : null,
      noticeDays: notice.noticeDays,
      eotClause: eot,
      party: risk.responsibleParty,
    });
    const flags: { field: string; note: string }[] = [];
    if (!party) flags.push({ field: 'party', note: 'The project has no client name: say who the notice is to' });
    if (!found) flags.push({ field: 'body', note: 'No notice clause was found in the filed contract: check the clause before sending' });
    if (notice.noticeSent) flags.push({ field: 'subject', note: `${notice.noticeSent.letterNo} of ${notice.noticeSent.letterDate} is already linked to this delay: send this as a further notice only if it is one` });
    return {
      kind: 'letter',
      title: `Notice of hindrance for ${risk.riskNo}, ${p.name}`,
      projectId: p.id,
      projectName: p.name,
      values: { projectId: p.id, direction: 'OUT', letterDate: today, party, subject: subject.slice(0, 300), body: lines.join('\n').slice(0, 20000), category: 'hindrance', riskId },
      flags,
      note: found ? `Drafted from ${risk.riskNo}, its DPR entries and clause ${found.clause} of ${found.docNo}, page ${found.page}` : `Drafted from ${risk.riskNo} and its DPR entries`,
    };
  }

  // The register printout

  async register(user: RequestUser, projectId: string): Promise<DelayRegisterDto> {
    if (!canViewLetters(user.roleKey) && !canViewContract(user.roleKey)) throw new ForbiddenException('Your role does not see the delay register');
    const p = await this.project(user, projectId);
    const today = todayIn();
    const rows: DelayRegisterRowDto[] = (await this.clocks(user, { projectId }, p.noticeDays)).map(({ d, start, notice }) => {
      const end = dateOnly(d.delayEnd);
      return {
        riskId: d.id,
        riskNo: d.riskNo,
        title: d.title,
        category: d.category,
        party: d.responsibleParty,
        activityName: d.activity?.name ?? null,
        delayStart: start,
        delayEnd: end,
        daysLost: d.daysLost ?? delayDays(start, end, today) ?? 0,
        status: d.status,
        eotClaimed: d.eotClaimed,
        eotGrantedDays: d.eotGrantedDays,
        notice,
        letters: d.letters.map((l) => ({ letterNo: l.letterNo ?? '', letterDate: dateOnly(l.letterDate), direction: l.direction, subject: l.subject })),
        remarks: d.hindrances.map((h) => ({ reportDate: dateOnly(h.dailyReport.date), remark: h.remark })).sort((a, b) => a.reportDate.localeCompare(b.reportDate)),
      };
    });
    return {
      projectId,
      projectCode: p.code,
      projectName: p.name,
      clientName: p.client?.name ?? p.clientName ?? null,
      agreementNo: p.agreementNo,
      asOf: today,
      rows,
      excusableDays: rows.filter((r) => needsNotice(r.party)).reduce((s, r) => s + r.daysLost, 0),
    };
  }
}
