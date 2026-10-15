import { Injectable, Logger } from '@nestjs/common';
import { COMPLIANCE_DOC_KIND_LABELS, COMPLIANCE_ROLES, DOC_ALERT_DAYS, EQUIPMENT_DOC_TYPE_LABELS, SERVICE_STATE_LABELS, expiryState, APPROVER_ROLES, DPR_SUBMITTER_ROLES, PAYMENT_ROLES, SPECIALIST_APPROVERS, SUBMISSION_TYPE_LABELS, TEST_KIND_LABELS, type NotificationJobResult, type PendingApprovalDto, type RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
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
  ) {}

  /**
   * "DPR not submitted" reminder: for every ACTIVE project without a DPR for today (drafts don't count),
   * notify the project's site staff (Site Engineers and Team Leaders who are members; the PM when there are none).
   */
  async dprReminder(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'DPR_REMINDER', date, created: 0, pushed: 0, emailed: 0, messaged: 0, skipped: 0 };
    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
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
      const sent = await this.email.send({
        to: u.email,
        subject: `[${u.organization.name}] ${pending.length} submission${pending.length === 1 ? '' : 's'} waiting for your approval`,
        text: `Hello ${u.fullName},\n\nThese site submissions are waiting for your review:\n\n${summary.detailText}\n${WEB_URL ? `\nOpen the approvals queue: ${WEB_URL}/approvals\n` : ''}`,
        html: this.digestHtml(u.fullName, u.organization.name, pending),
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

  private digestHtml(name: string, orgName: string, pending: PendingApprovalDto[]): string {
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
      <p style="margin:0">${count.replace(/^\d+/, (n) => `<strong>${n}</strong>`)}.</p>
      ${sections}
      ${WEB_URL ? emailButton(`${WEB_URL}/approvals`, 'Open approvals') : ''}`,
      footnote: `Daily digest, sent at ${escapeHtml(new Date().toLocaleString('en-IN', { timeZone: JOB_TIMEZONE }))} (${escapeHtml(JOB_TIMEZONE)}).`,
    });
  }
}
