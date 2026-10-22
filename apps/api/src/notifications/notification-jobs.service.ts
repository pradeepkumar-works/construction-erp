import { Injectable, Logger } from '@nestjs/common';
import { EMI_DUE_DAYS, TALLY_ROLES, COMPLIANCE_DOC_KIND_LABELS, COMPLIANCE_ROLES, DLP_ALERT_DAYS, DOC_ALERT_DAYS, EQUIPMENT_DOC_TYPE_LABELS, SERVICE_STATE_LABELS, expiryState, APPROVER_ROLES, DPR_SUBMITTER_ROLES, PAYMENT_ROLES, SPECIALIST_APPROVERS, SUBMISSION_TYPE_LABELS, TEST_KIND_LABELS, canSeeWatchList, type BriefLineDto, type NotificationJobResult, type PendingApprovalDto, type RoleKey, type SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { escalationRoles, levelRoles } from '../common/approval-levels';
import { ProjectAccessService } from '../common/project-access.service';
import { RequestUser } from '../common/current-user';
import { parseDate } from '../common/serialize';
import { NotificationsService } from './notifications.service';
import { EmailService, escapeHtml } from './email.service';
import { MessagingService } from '../messaging/messaging.service';
import { PayablesService } from '../payables/payables.service';
import { EMAIL_COLORS, emailButton, emailLayout } from './email-layout';
import { JOB_TIMEZONE, todayIn } from './time';
import { latestDocIds, serviceStatuses } from '../maintenance/service-status';
import { WarningsService } from '../warnings/warnings.service';
import { BriefsService, toBrief } from '../briefs/briefs.service';

const WEB_URL = (process.env.WEB_URL || '').replace(/\/+$/, '');
/** Bills falling due within this many days (today included) trigger the payments-due alert. */
const BILLS_DUE_DAYS = 3;
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 3)}...` : s);

/**
 * Scheduled notifications. Both jobs are idempotent for a given day: running them twice sends nothing twice.
 * Triggered by Vercel Cron (see apps/api/vercel.json), by the in-process scheduler, or by hand with the cron secret.
 */
@Injectable()
export class NotificationJobsService {
  private readonly log = new Logger(NotificationJobsService.name);

  constructor(
    private prisma: PrismaService,
    private lifecycle: SubmissionLifecycleService,
    private notifications: NotificationsService,
    private email: EmailService,
    private access: ProjectAccessService,
    private messaging: MessagingService,
    private payables: PayablesService,
    private warnings: WarningsService,
    private briefs: BriefsService,
    private rights: ApprovalRightsService,
  ) {}

  /**
   * Reminders and escalation (v5 item 94), meant to run hourly: an entry that has waited at its level past its type's
   * `remindAfterHours` reminds that level's approvers once; past `escalateAfterHours`, the next level's roles
   * (management above the top level) may decide it too and are told. Each is an `ApprovalStep` of the entry's round,
   * so it happens once per level, however often the job runs.
   */
  async approvalEscalation(now = new Date()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'APPROVAL_ESCALATION', date: todayIn(), created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const settings = await this.prisma.approvalEscalation.findMany({ where: { OR: [{ remindAfterHours: { not: null } }, { escalateAfterHours: { not: null } }] } });
    for (const set of settings) {
      const type = set.submissionType as SubmissionType;
      const model = this.rights.submissionModel(type);
      if (!model) continue;
      const rows = (await model.findMany({
        where: { organizationId: set.organizationId, status: 'SUBMITTED' },
        select: { id: true, projectId: true, submittedAt: true, createdAt: true },
      })) as { id: string; projectId: string; submittedAt: Date | null; createdAt: Date }[];
      if (!rows.length) continue;
      const entries = await Promise.all(
        rows.map(async (r) => ({ type, id: r.id, amount: (await this.rights.amountOf(type, r.id))?.toString() ?? null, round: r.submittedAt ?? r.createdAt, projectId: r.projectId })),
      );
      const { rules, stages } = await this.rights.stages(set.organizationId, entries);
      for (const e of entries) {
        const stage = stages.get(`${type}:${e.id}`)!;
        const hours = (now.getTime() - stage.since.getTime()) / 3_600_000;
        const escalate = !!set.escalateAfterHours && hours >= set.escalateAfterHours && !stage.escalated;
        const remind = !escalate && !!set.remindAfterHours && hours >= set.remindAfterHours && !stage.reminded && !stage.escalated;
        if (!escalate && !remind) {
          result.skipped++;
          continue;
        }
        await this.prisma.approvalStep.create({
          data: { organizationId: set.organizationId, entityType: type, entityId: e.id, level: stage.level, action: escalate ? 'ESCALATED' : 'REMINDED', round: e.round, note: `Waited ${Math.floor(hours)} hours` },
        });
        const roles: RoleKey[] = escalate ? escalationRoles(type, rules, stage.level) : ['ADMIN', ...levelRoles(type, rules, stage.level, e.amount)];
        const users = await this.access.usersWithRoles(set.organizationId, e.projectId, [...new Set(roles)]);
        const r = await this.notifications.onWaiting(set.organizationId, type, e.id, users.map((u) => u.id), hours, escalate);
        result.created += r.created;
        result.pushed += r.pushed;
        result.messaged! += r.messaged ?? 0;
      }
    }
    this.log.log(`Approval escalation: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * The overnight batch (AI item 74): today's morning briefs for everyone who asked, and on Mondays last week's summary
   * paragraph for each active project's report. Writes only; `morningBrief` sends the briefs after the digest.
   */
  async writeBriefs(date = todayIn()) {
    const mornings = await this.briefs.writeMornings(date);
    const weekly = (parseDate(date).getUTCDay() + 6) % 7 === 0 ? await this.briefs.writeNarratives(date) : null;
    return { mornings, weekly };
  }

  /**
   * Sends today's morning briefs: in the app and on the phone, on WhatsApp once its template is approved (or by SMS),
   * and by email unless the brief already went in the approvals digest email. Once per user per day.
   */
  async morningBrief(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'MORNING_BRIEF', date, created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const dedupeKey = `MORNING_BRIEF:${date}`;
    const rows = await this.prisma.aiBrief.findMany({
      where: { kind: 'MORNING', date: parseDate(date), user: { isActive: true, morningBrief: true } },
      include: { user: { select: { id: true, email: true, fullName: true } }, organization: { select: { name: true } } },
    });
    for (const row of rows) {
      const u = row.user!;
      const brief = toBrief(row);
      const r = await this.notifications.notify({
        organizationId: row.organizationId,
        userIds: [u.id],
        type: 'MORNING_BRIEF',
        title: 'Your morning brief',
        body: brief.lines.map((l) => l.text).join('\n'),
        dedupeKey,
        message: { template: 'MORNING_BRIEF', params: [u.fullName.split(' ')[0], cut(brief.lines.map((l) => l.text).join(' · '), 600), this.messaging.webUrl('/')] },
      });
      if (r.created === 0) {
        result.skipped++;
        continue;
      }
      result.created += r.created;
      result.pushed += r.pushed;
      result.messaged! += r.messaged;
      const inDigest = await this.prisma.notification.findFirst({ where: { userId: u.id, dedupeKey: `APPROVAL_DIGEST:${date}`, emailedAt: { not: null } }, select: { id: true } });
      if (inDigest) continue;
      const sent = await this.email.send({
        to: u.email,
        subject: `[${row.organization.name}] Your morning brief`,
        text: `Good morning ${u.fullName.split(' ')[0]},\n\n${brief.lines.map((l) => `- ${l.text}`).join('\n')}\n${WEB_URL ? `\nOpen ${WEB_URL}\n` : ''}`,
        html: emailLayout({
          preheader: brief.lines[0]?.text ?? 'Your morning brief',
          orgName: row.organization.name,
          body: `<p style="margin:0 0 12px">Good morning ${escapeHtml(u.fullName.split(' ')[0])},</p>${this.briefHtml(brief.lines)}${WEB_URL ? emailButton(`${WEB_URL}/`, 'Open Nirmaan') : ''}`,
          footnote: 'You asked for this brief. Turn it off from the brief on your home page.',
        }),
      });
      if (sent) {
        result.emailed++;
        await this.prisma.notification.updateMany({ where: { userId: u.id, dedupeKey }, data: { emailedAt: new Date() } });
      }
    }
    this.log.log(`Morning brief ${date}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * The weekly watch list (AI item 73): on Mondays (any day with `anyDay`, for a manual run), each user whose role has
   * early warnings and who has open ones gets one notification naming the first few. Once per user per week.
   */
  async watchList(date = todayIn(), anyDay = false): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'WATCH_LIST', date, created: 0, pushed: 0, emailed: 0, skipped: 0 };
    const weekday = (parseDate(date).getUTCDay() + 6) % 7;
    if (weekday !== 0 && !anyDay) return result;
    const dedupeKey = `WATCH_LIST:${new Date(parseDate(date).getTime() - weekday * 86_400_000).toISOString().slice(0, 10)}`;
    const users = await this.prisma.user.findMany({ where: { isActive: true }, include: { role: { select: { key: true } } } });
    for (const u of users) {
      const roleKey = u.role.key as RoleKey;
      if (!canSeeWatchList(roleKey)) continue;
      const already = await this.prisma.notification.findFirst({ where: { userId: u.id, dedupeKey }, select: { id: true } });
      if (already) {
        result.skipped++;
        continue;
      }
      const user: RequestUser = { id: u.id, organizationId: u.organizationId, roleKey, email: u.email, fullName: u.fullName };
      const open = await this.warnings.open(user).catch((e: Error) => {
        this.log.warn(`watch list for ${u.id}: ${e.message}`);
        return [];
      });
      if (!open.length) {
        result.skipped++;
        continue;
      }
      const r = await this.notifications.notify({
        organizationId: u.organizationId,
        userIds: [u.id],
        type: 'WATCH_LIST',
        title: `${open.length} early warning${open.length === 1 ? '' : 's'} on your watch list`,
        body: `${open
          .slice(0, 3)
          .map((w) => w.title)
          .join('; ')}${open.length > 3 ? `; and ${open.length - 3} more` : ''}`,
        dedupeKey,
      });
      result.created += r.created;
      result.pushed += r.pushed;
    }
    return result;
  }

  /**
   * "DPR not submitted" reminder: for every ACTIVE project without a DPR for today (drafts don't count),
   * notify the project's site staff (Site Engineers and Team Leaders who are members; the PM when there are none).
   */
  async dprReminder(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'DPR_REMINDER', date, created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const projects = await this.prisma.project.findMany({
      // A central store files no DPR (v6 item 106).
      where: { status: 'ACTIVE', type: { not: 'STORE' } },
      include: {
        dailyReports: { where: { date: parseDate(date), status: { not: 'DRAFT' } }, select: { id: true } },
        projectManager: { select: { id: true, isActive: true } },
        members: { include: { user: { select: { id: true, isActive: true, role: { select: { key: true } } } } } },
      },
    });
    for (const p of projects) {
      if (p.dailyReports.length > 0) {
        result.skipped++;
        continue;
      }
      let userIds = p.members.filter((m) => m.user.isActive && DPR_SUBMITTER_ROLES.includes(m.user.role.key as RoleKey)).map((m) => m.user.id);
      if (userIds.length === 0 && p.projectManager?.isActive) userIds = [p.projectManager.id];
      if (userIds.length === 0) {
        result.skipped++;
        continue;
      }
      const r = await this.notifications.notify({
        organizationId: p.organizationId,
        userIds,
        type: 'DPR_REMINDER',
        title: 'DPR not submitted today',
        body: `No daily progress report has been submitted for ${p.name} (${p.code}) today. Please submit it before end of day.`,
        projectId: p.id,
        dedupeKey: `DPR_REMINDER:${p.id}:${date}`,
        message: { template: 'DPR_REMINDER', params: [`${p.name} (${p.code})`, this.messaging.webUrl('/dpr')] },
      });
      result.created += r.created;
      result.pushed += r.pushed;
      result.messaged! += r.messaged;
      result.skipped += r.skipped;
    }
    this.log.log(`DPR reminder ${date}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Daily digest of pending approvals: one in-app notification, push and email per approver who has
   * something waiting, listing the items by project.
   */
  async approvalDigest(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'APPROVAL_DIGEST', date, created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const dedupeKey = `APPROVAL_DIGEST:${date}`;
    // Everyone whose role appears in an approval matrix, plus the fixed approver roles; pending() then applies each
    // organisation's actual rights, so a user with nothing to approve gets nothing.
    const ruleRoles = await this.prisma.approvalRule.findMany({ distinct: ['roleId'], select: { roleId: true } });
    const approvers = await this.prisma.user.findMany({
      where: { isActive: true, OR: [{ role: { key: { in: [...APPROVER_ROLES, ...Object.values(SPECIALIST_APPROVERS).flat()] } } }, { roleId: { in: ruleRoles.map((r) => r.roleId) } }] },
      include: { role: { select: { key: true } }, organization: { select: { name: true } } },
    });
    for (const u of approvers) {
      const already = await this.prisma.notification.findFirst({ where: { userId: u.id, dedupeKey }, select: { id: true } });
      if (already) {
        result.skipped++;
        continue;
      }
      const reqUser: RequestUser = { id: u.id, organizationId: u.organizationId, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
      const pending = await this.lifecycle.pending(reqUser);
      if (pending.length === 0) {
        result.skipped++;
        continue;
      }
      const summary = this.summarise(pending);
      const r = await this.notifications.notify({
        organizationId: u.organizationId,
        userIds: [u.id],
        type: 'APPROVAL_DIGEST',
        title: `${pending.length} submission${pending.length === 1 ? '' : 's'} waiting for your approval`,
        body: summary.text,
        dedupeKey,
        message: {
          template: 'APPROVAL_DIGEST',
          params: [u.fullName.split(' ')[0], `${pending.length} submission${pending.length === 1 ? ' is' : 's are'}`, cut(summary.text, 300), this.messaging.webUrl('/approvals')],
        },
      });
      if (r.created === 0) {
        result.skipped++;
        continue;
      }
      result.created += r.created;
      result.pushed += r.pushed;
      result.messaged! += r.messaged;
      // A morning brief written for today rides in this email rather than in one of its own.
      const briefRow = await this.prisma.aiBrief.findUnique({ where: { organizationId_key: { organizationId: u.organizationId, key: `MORNING:${u.id}:${date}` } } });
      const brief = briefRow && u.morningBrief ? toBrief(briefRow).lines : null;
      const sent = await this.email.send({
        to: u.email,
        subject: `[${u.organization.name}] ${pending.length} submission${pending.length === 1 ? '' : 's'} waiting for your approval`,
        text: `Hello ${u.fullName},\n\n${brief ? `Your morning brief:\n${brief.map((l) => `- ${l.text}`).join('\n')}\n\n` : ''}These site submissions are waiting for your review:\n\n${summary.detailText}\n${WEB_URL ? `\nOpen the approvals queue: ${WEB_URL}/approvals\n` : ''}`,
        html: this.digestHtml(u.fullName, u.organization.name, pending, brief),
      });
      if (sent) {
        result.emailed++;
        await this.prisma.notification.updateMany({ where: { userId: u.id, dedupeKey }, data: { emailedAt: new Date() } });
      }
    }
    this.log.log(`Approval digest ${date}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Test readings falling due: every reading due on or before `date` with no value yet (the 7-day and 28-day cubes),
   * on a test still pending, goes once to whoever recorded the test and the QA/QC on the project. Runs with the digest.
   */
  async testsDue(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'TESTS_DUE', date, created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const readings = await this.prisma.qualityTestReading.findMany({
      where: { value: null, dueOn: { lte: parseDate(date) }, test: { result: 'PENDING', project: { status: 'ACTIVE' } } },
      include: { test: { include: { project: { select: { name: true } } } } },
      orderBy: [{ dueOn: 'asc' }, { sortOrder: 'asc' }],
    });
    const watchers = new Map<string, string[]>();
    for (const r of readings) {
      const t = r.test;
      if (!watchers.has(t.projectId)) watchers.set(t.projectId, (await this.access.qualityWatchers(t.organizationId, t.projectId, { onProjectOnly: true })).map((u) => u.id));
      const due = r.dueOn!.toISOString().slice(0, 10);
      const n = await this.notifications.notify({
        organizationId: t.organizationId,
        userIds: [...new Set([t.createdById, ...watchers.get(t.projectId)!])],
        type: 'TEST_DUE',
        title: `${r.label} test ${due < date ? 'overdue' : 'due today'}: ${t.title}`,
        body: `${t.testNo} (${TEST_KIND_LABELS[t.kind]}) at ${t.project.name}, sampled ${t.sampledOn.toISOString().slice(0, 10)}. Enter the ${r.label.toLowerCase()} result once tested.`,
        projectId: t.projectId,
        entityId: t.id,
        dedupeKey: `TEST_DUE:${r.id}`,
        message: {
          template: 'TEST_DUE',
          params: [r.label.toLowerCase(), `${t.testNo} (${t.title})`, t.project.name, due < date ? `overdue since ${due}` : 'due today', this.messaging.webUrl(`/inspections?tab=tests&id=${t.id}`)],
        },
      });
      result.created += n.created;
      result.pushed += n.pushed;
      result.messaged! += n.messaged;
      result.skipped += n.skipped;
    }
    this.log.log(`Tests due ${date}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Payments due: once a day, to each admin, management and accounts user, the approved vendor and subcontractor bills
   * still unpaid on their projects, when at least one falls due within BILLS_DUE_DAYS (overdue ones alone do not
   * repeat the alert every day). In-app, push, and WhatsApp / SMS for those who switched it on. Runs with the digest.
   */
  async billsDue(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'BILLS_DUE', date, created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const dedupeKey = `BILLS_DUE:${date}`;
    const day = parseDate(date).getTime();
    const users = await this.prisma.user.findMany({ where: { isActive: true, role: { key: { in: PAYMENT_ROLES } } }, include: { role: { select: { key: true } } } });
    for (const u of users) {
      const reqUser: RequestUser = { id: u.id, organizationId: u.organizationId, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
      const open = (await this.payables.summary(reqUser)).openBills
        .map((b) => ({ ...b, days: Math.round((parseDate(b.dueDate).getTime() - day) / 86_400_000) }))
        .filter((b) => Number(b.outstanding) > 0);
      const soon = open.filter((b) => b.days >= 0 && b.days <= BILLS_DUE_DAYS).sort((a, b) => a.days - b.days);
      const overdue = open.filter((b) => b.days < 0);
      if (!soon.length) {
        result.skipped++;
        continue;
      }
      const sum = (bills: typeof open) => (bills.length ? `${bills.length} bill${bills.length === 1 ? '' : 's'}, ${inr(bills.reduce((s, b) => s + Number(b.outstanding), 0))}` : 'none');
      const r = await this.notifications.notify({
        organizationId: u.organizationId,
        userIds: [u.id],
        type: 'BILLS_DUE',
        title: `Payments due in the next ${BILLS_DUE_DAYS} days: ${sum(soon)}`,
        body: `${soon
          .slice(0, 5)
          .map((b) => `${b.vendorName} ${b.billLabel} ${inr(Number(b.outstanding))} due ${b.days === 0 ? 'today' : `on ${b.dueDate}`}`)
          .join(' · ')}${soon.length > 5 ? ` and ${soon.length - 5} more` : ''}. Overdue: ${sum(overdue)}.`,
        dedupeKey,
        message: { template: 'BILLS_DUE', params: [sum(soon), sum(overdue), this.messaging.webUrl('/payables')] },
      });
      result.created += r.created;
      result.pushed += r.pushed;
      result.messaged! += r.messaged;
      result.skipped += r.skipped;
    }
    this.log.log(`Bills due ${date}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Machine loan EMIs (v6 item 108): each EMI of a running loan is reminded once when it falls due within EMI_DUE_DAYS and
   * once more if it is still unpaid after its date, to admin, management and accounts (who keep the loans). In-app and
   * push, under Payments due. Runs with the digest.
   */
  async loanEmisDue(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'LOAN_EMIS_DUE', date, created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const today = parseDate(date);
    const until = parseDate(date);
    until.setUTCDate(until.getUTCDate() + EMI_DUE_DAYS);
    const emis = await this.prisma.loanEmi.findMany({
      where: { paidOn: null, dueDate: { lte: until }, loan: { status: 'ACTIVE' } },
      include: { loan: { select: { id: true, organizationId: true, lenderName: true, loanNo: true, equipment: { select: { code: true, name: true } } } } },
      orderBy: { dueDate: 'asc' },
    });
    const keepers = new Map<string, string[]>();
    for (const e of emis) {
      const org = e.loan.organizationId;
      if (!keepers.has(org)) keepers.set(org, (await this.prisma.user.findMany({ where: { organizationId: org, isActive: true, role: { key: { in: TALLY_ROLES } } }, select: { id: true } })).map((u) => u.id));
      const userIds = keepers.get(org)!;
      if (!userIds.length) continue;
      const overdue = e.dueDate < today;
      const due = e.dueDate.toISOString().slice(0, 10);
      const machine = `${e.loan.equipment.code} ${e.loan.equipment.name}`;
      const r = await this.notifications.notify({
        organizationId: org,
        userIds,
        type: 'BILLS_DUE',
        title: overdue ? `EMI overdue: ${inr(e.emi.toNumber())} to ${e.loan.lenderName} on ${machine}` : `EMI due ${due === date ? 'today' : `on ${due}`}: ${inr(e.emi.toNumber())} to ${e.loan.lenderName}`,
        body: `EMI ${e.no} of loan ${e.loan.loanNo} on ${machine}${overdue ? `, due on ${due}, is still unpaid. Pay it, or record it paid on the loan.` : '. Keep the money in the account it is debited from, and record it paid on the loan.'}`,
        entityType: 'EQUIPMENT_LOAN',
        entityId: e.loan.id,
        dedupeKey: `LOAN_EMI:${e.id}:${overdue ? 'OVERDUE' : 'DUE'}`,
      });
      result.created += r.created;
      result.pushed += r.pushed;
      result.skipped += r.skipped;
    }
    this.log.log(`Loan EMIs due ${date}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Machinery due (v4 item 42): machines falling due for service (with no open service job card), and vehicle papers
   * and driving licences expiring within 30 days or expired. Each is alerted once as it becomes due and once more
   * when it is overdue or expired, to admins and management and to the store managers and manager of the project the
   * machine is at. Runs with the digest.
   */
  async machineryDue(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'MACHINERY_DUE', date, created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const soon = parseDate(date);
    soon.setUTCDate(soon.getUTCDate() + 30);
    type Alert = { organizationId: string; projectId: string | null; title: string; body: string; entityType: 'EQUIPMENT' | 'EQUIPMENT_DOCUMENT' | 'DRIVER'; entityId: string; dedupeKey: string };
    const alerts: Alert[] = [];
    const orgs = await this.prisma.equipment.findMany({ where: { isActive: true }, distinct: ['organizationId'], select: { organizationId: true } });
    for (const { organizationId } of orgs) {
      for (const m of await serviceStatuses(this.prisma, { organizationId }, date)) {
        if ((m.state !== 'DUE_SOON' && m.state !== 'OVERDUE') || m.openServiceJobId) continue;
        const over = m.state === 'OVERDUE';
        const left = [
          m.hoursLeft !== null && (!over || m.hoursLeft <= 0) ? `${Math.abs(m.hoursLeft)} h` : null,
          m.daysLeft !== null && (!over || m.daysLeft <= 0) ? `${Math.abs(m.daysLeft)} days` : null,
        ]
          .filter(Boolean)
          .join(' or ');
        alerts.push({
          organizationId,
          projectId: m.projectId,
          title: `Service ${SERVICE_STATE_LABELS[m.state].toLowerCase()}: ${m.equipmentCode} ${m.equipmentName}`,
          body: `${m.hoursSince} h worked since the last service${m.lastServiceDate ? ` on ${m.lastServiceDate}` : ''}; ${over ? 'overdue by' : 'due in'} ${left}${m.projectName ? ` · at ${m.projectName}` : ''}.`,
          entityType: 'EQUIPMENT',
          entityId: m.equipmentId,
          dedupeKey: `SERVICE:${m.equipmentId}:${m.lastServiceDate ?? 'never'}:${m.state}`,
        });
      }
    }
    const docs = await this.prisma.equipmentDocument.findMany({
      where: { id: { in: await latestDocIds(this.prisma) }, validTo: { lte: soon }, equipment: { isActive: true } },
      include: { equipment: { select: { code: true, name: true, projectId: true, project: { select: { name: true } } } } },
    });
    for (const d of docs) {
      const e = expiryState(d.validTo.toISOString().slice(0, 10), date)!;
      const what = `${EQUIPMENT_DOC_TYPE_LABELS[d.type]} of ${d.equipment.code} ${d.equipment.name}`;
      alerts.push({
        organizationId: d.organizationId,
        projectId: d.equipment.projectId,
        title: e.state === 'EXPIRED' ? `${what} has expired` : `${what} expires in ${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'}`,
        body: `${d.number ? `No. ${d.number}, ` : ''}valid to ${d.validTo.toISOString().slice(0, 10)}${d.equipment.project ? ` · at ${d.equipment.project.name}` : ''}. Renew it and add the new paper on the Machinery page.`,
        entityType: 'EQUIPMENT_DOCUMENT',
        entityId: d.id,
        dedupeKey: `EQUIPMENT_DOC:${d.id}:${e.state}`,
      });
    }
    const drivers = await this.prisma.driver.findMany({
      where: { isActive: true, licenceValidTo: { lte: soon } },
      include: { equipment: { select: { code: true, projectId: true } } },
    });
    for (const d of drivers) {
      const validTo = d.licenceValidTo!.toISOString().slice(0, 10);
      const e = expiryState(validTo, date)!;
      alerts.push({
        organizationId: d.organizationId,
        projectId: d.equipment?.projectId ?? null,
        title: e.state === 'EXPIRED' ? `Driving licence of ${d.name} has expired` : `Driving licence of ${d.name} expires in ${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'}`,
        body: `${d.licenceNo ? `${d.licenceNo}, ` : ''}valid to ${validTo}${d.equipment ? ` · drives ${d.equipment.code}` : ''}.`,
        entityType: 'DRIVER',
        entityId: d.id,
        dedupeKey: `LICENCE:${d.id}:${validTo}:${e.state}`,
      });
    }
    const heads = new Map<string, string[]>();
    for (const a of alerts) {
      if (!heads.has(a.organizationId))
        heads.set(
          a.organizationId,
          (await this.prisma.user.findMany({ where: { organizationId: a.organizationId, isActive: true, role: { key: { in: ['ADMIN', 'MANAGEMENT'] } } }, select: { id: true } })).map((u) => u.id),
        );
      const userIds = [...heads.get(a.organizationId)!, ...(await this.access.maintenanceWatchers(a.organizationId, a.projectId))];
      const r = await this.notifications.notify({ organizationId: a.organizationId, userIds, type: 'MACHINERY', title: a.title, body: a.body, projectId: a.projectId, entityType: a.entityType, entityId: a.entityId, dedupeKey: a.dedupeKey });
      result.created += r.created;
      result.pushed += r.pushed;
      result.skipped += r.skipped;
    }
    this.log.log(`Machinery due ${date}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Guarantees, insurance and licences (v4 item 46): active entries expiring within DOC_ALERT_DAYS, alerted once as
   * they start expiring and once more when expired, to accounts, admins and management and the project's manager.
   * Runs with the digest.
   */
  async complianceDue(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'COMPLIANCE_DUE', date, created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const soon = parseDate(date);
    soon.setUTCDate(soon.getUTCDate() + DOC_ALERT_DAYS);
    const docs = await this.prisma.complianceDoc.findMany({
      where: { status: 'ACTIVE', expiresOn: { lte: soon } },
      include: { project: { select: { name: true, projectManagerId: true } } },
      orderBy: { expiresOn: 'asc' },
    });
    const keepers = new Map<string, string[]>();
    for (const d of docs) {
      const expiresOn = d.expiresOn!.toISOString().slice(0, 10);
      const e = expiryState(expiresOn, date)!;
      if (!keepers.has(d.organizationId))
        keepers.set(
          d.organizationId,
          (await this.prisma.user.findMany({ where: { organizationId: d.organizationId, isActive: true, role: { key: { in: COMPLIANCE_ROLES } } }, select: { id: true } })).map((u) => u.id),
        );
      const userIds = [...keepers.get(d.organizationId)!];
      if (d.project?.projectManagerId && !userIds.includes(d.project.projectManagerId)) userIds.push(d.project.projectManagerId);
      const what = `${d.category || COMPLIANCE_DOC_KIND_LABELS[d.kind]} ${d.reference}`;
      const amount = d.amount ? ` for ${inr(Number(d.amount))}` : '';
      const r = await this.notifications.notify({
        organizationId: d.organizationId,
        userIds,
        type: 'COMPLIANCE',
        title: e.state === 'EXPIRED' ? `${what} has expired` : `${what} expires in ${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'}`,
        body: `${[d.issuer, d.beneficiary ? `in favour of ${d.beneficiary}` : null].filter(Boolean).join(', ') || COMPLIANCE_DOC_KIND_LABELS[d.kind]}${amount}, valid to ${expiresOn}${d.project ? ` · ${d.project.name}` : ''}. Renew it or record its release on the Guarantees & Licences page.`,
        projectId: d.projectId,
        entityType: 'COMPLIANCE_DOC',
        entityId: d.id,
        dedupeKey: `COMPLIANCE:${d.id}:${e.state}`,
      });
      result.created += r.created;
      result.pushed += r.pushed;
      result.skipped += r.skipped;
    }
    this.log.log(`Compliance due ${date}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Handover (v4 item 47): the defect liability period ending within DLP_ALERT_DAYS (or just ended), so retention and
   * the performance guarantee are claimed back; and snags or defects past their due date, to whoever is to put them right.
   */
  async handoverDue(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'HANDOVER_DUE', date, created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const today = parseDate(date);
    const soon = new Date(today.getTime() + DLP_ALERT_DAYS * 86_400_000);
    const lately = new Date(today.getTime() - DLP_ALERT_DAYS * 86_400_000);
    const add = (r: { created: number; pushed: number; skipped: number }) => {
      result.created += r.created;
      result.pushed += r.pushed;
      result.skipped += r.skipped;
    };
    const handovers = await this.prisma.projectHandover.findMany({
      where: { dlpEndsOn: { gte: lately, lte: soon } },
      include: { project: { select: { name: true, projectManagerId: true } } },
      orderBy: { dlpEndsOn: 'asc' },
    });
    const keepers = new Map<string, string[]>();
    for (const h of handovers) {
      const endsOn = h.dlpEndsOn.toISOString().slice(0, 10);
      const daysLeft = Math.round((h.dlpEndsOn.getTime() - today.getTime()) / 86_400_000);
      const state = daysLeft > 0 ? 'ENDING' : 'ENDED';
      if (!keepers.has(h.organizationId))
        keepers.set(
          h.organizationId,
          (await this.prisma.user.findMany({ where: { organizationId: h.organizationId, isActive: true, role: { key: { in: COMPLIANCE_ROLES } } }, select: { id: true } })).map((u) => u.id),
        );
      const userIds = [...keepers.get(h.organizationId)!];
      if (h.project.projectManagerId && !userIds.includes(h.project.projectManagerId)) userIds.push(h.project.projectManagerId);
      const open = await this.prisma.defect.count({ where: { projectId: h.projectId, status: { in: ['OPEN', 'FIXED'] } } });
      const pending = open ? `${open} snag${open === 1 ? '' : 's'} or defect${open === 1 ? '' : 's'} still to be closed. ` : '';
      add(
        await this.notifications.notify({
          organizationId: h.organizationId,
          userIds,
          type: 'DEFECT',
          title: state === 'ENDED' ? `Defect liability period over: ${h.project.name}` : `Defect liability period ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}: ${h.project.name}`,
          body: `The DLP ${state === 'ENDED' ? 'ended' : 'ends'} on ${endsOn}. ${pending}Claim back the retention money and the performance guarantee.`,
          projectId: h.projectId,
          entityType: 'HANDOVER',
          entityId: h.projectId,
          dedupeKey: `HANDOVER:${h.id}:${endsOn}:${state}`,
        }),
      );
    }
    const overdue = await this.prisma.defect.findMany({
      where: { status: 'OPEN', dueDate: { lt: today } },
      include: { project: { select: { name: true, projectManagerId: true } } },
      orderBy: { dueDate: 'asc' },
      take: 500,
    });
    for (const d of overdue) {
      const userIds = [...new Set([d.assignedToId, d.project.projectManagerId].filter((u): u is string => !!u))];
      if (!userIds.length) continue;
      const due = d.dueDate!.toISOString().slice(0, 10);
      add(
        await this.notifications.notify({
          organizationId: d.organizationId,
          userIds,
          type: 'DEFECT',
          title: `Overdue: ${d.defectNo} ${d.title}`,
          body: `${d.project.name}${d.location ? ` at ${d.location}` : ''}${d.contractor ? ` (${d.contractor})` : ''} was to be put right by ${due}.`,
          projectId: d.projectId,
          entityType: 'DEFECT',
          entityId: d.id,
          dedupeKey: `DEFECT_OVERDUE:${d.id}:${due}`,
        }),
      );
    }
    this.log.log(`Handover due ${date}: ${JSON.stringify(result)}`);
    return result;
  }

  private groupByProject(pending: PendingApprovalDto[]) {
    const groups = new Map<string, PendingApprovalDto[]>();
    for (const p of pending) groups.set(p.projectName, [...(groups.get(p.projectName) ?? []), p]);
    return groups;
  }

  private summarise(pending: PendingApprovalDto[]) {
    const groups = this.groupByProject(pending);
    const text = [...groups.entries()].map(([project, items]) => `${project}: ${items.length}`).join(' · ');
    const detailText = [...groups.entries()]
      .map(([project, items]) => `${project}\n${items.map((i) => `  - ${SUBMISSION_TYPE_LABELS[i.type]} · ${i.title} · by ${i.submittedByName}`).join('\n')}`)
      .join('\n\n');
    return { text, detailText };
  }

  /** A morning brief as an email block: its lines, each linked where it has a page. */
  private briefHtml(lines: BriefLineDto[]): string {
    const item = (l: BriefLineDto) => `<li style="margin:0 0 6px">${l.href && WEB_URL ? `<a href="${escapeHtml(`${WEB_URL}${l.href}`)}" style="color:${EMAIL_COLORS.link}">${escapeHtml(l.text)}</a>` : escapeHtml(l.text)}</li>`;
    return `<ul style="margin:0 0 16px;padding-left:20px">${lines.map(item).join('')}</ul>`;
  }

  private digestHtml(name: string, orgName: string, pending: PendingApprovalDto[], brief: BriefLineDto[] | null = null): string {
    const groups = this.groupByProject(pending);
    const cell = `padding:7px 8px;border-bottom:1px solid ${EMAIL_COLORS.border}`;
    const sections = [...groups.entries()]
      .map(
        ([project, items]) => `
        <h3 style="margin:22px 0 6px;font-family:Archivo,'Arial Narrow',Arial,sans-serif;font-size:16px;font-weight:800;color:${EMAIL_COLORS.ink}">${escapeHtml(project)} <span style="color:${EMAIL_COLORS.muted};font-weight:normal">(${items.length})</span></h3>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
          ${items
            .map(
              (i) => `<tr>
                <td style="${cell};white-space:nowrap;color:${EMAIL_COLORS.link};font-weight:600">${escapeHtml(SUBMISSION_TYPE_LABELS[i.type])}</td>
                <td style="${cell}">${escapeHtml(i.title)}</td>
                <td style="${cell};color:${EMAIL_COLORS.muted};white-space:nowrap">${escapeHtml(i.submittedByName)}</td>
              </tr>`,
            )
            .join('')}
        </table>`,
      )
      .join('');
    const count = `${pending.length} site submission${pending.length === 1 ? ' is' : 's are'} waiting for your review`;
    return emailLayout({
      preheader: `${count}.`,
      orgName,
      body: `<p style="margin:0 0 12px">Hello ${escapeHtml(name)},</p>
      ${brief ? `<p style="margin:0 0 6px;font-weight:600">Your morning brief</p>${this.briefHtml(brief)}` : ''}
      <p style="margin:0">${count.replace(/^\d+/, (n) => `<strong>${n}</strong>`)}.</p>
      ${sections}
      ${WEB_URL ? emailButton(`${WEB_URL}/approvals`, 'Open approvals') : ''}`,
      footnote: `Daily digest, sent at ${escapeHtml(new Date().toLocaleString('en-IN', { timeZone: JOB_TIMEZONE }))} (${escapeHtml(JOB_TIMEZONE)}).`,
    });
  }
}
