import { Injectable, Logger } from '@nestjs/common';
import { APPROVER_ROLES, DPR_SUBMITTER_ROLES, SUBMISSION_TYPE_LABELS, type NotificationJobResult, type PendingApprovalDto, type RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { RequestUser } from '../common/current-user';
import { parseDate } from '../common/serialize';
import { NotificationsService } from './notifications.service';
import { EmailService, escapeHtml } from './email.service';
import { JOB_TIMEZONE, todayIn } from './time';

const WEB_URL = (process.env.WEB_URL || '').replace(/\/+$/, '');

/**
 * Scheduled notifications. Both jobs are idempotent for a given day: running them twice sends nothing twice.
 * Triggered by Vercel Cron (see apps/api/vercel.json), by the in-process scheduler, or by hand with the cron secret.
 */
@Injectable()
export class NotificationJobsService {
  private readonly log = new Logger(NotificationJobsService.name);

  constructor(private prisma: PrismaService, private lifecycle: SubmissionLifecycleService, private notifications: NotificationsService, private email: EmailService) {}

  /**
   * "DPR not submitted" reminder: for every ACTIVE project without a DPR for today (drafts don't count),
   * notify the project's site staff (Site Engineers and Team Leaders who are members; the PM when there are none).
   */
  async dprReminder(date = todayIn()): Promise<NotificationJobResult> {
    const result: NotificationJobResult = { job: 'DPR_REMINDER', date, created: 0, pushed: 0, emailed: 0, skipped: 0 };
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
      });
      result.created += r.created;
      result.pushed += r.pushed;
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
    const result: NotificationJobResult = { job: 'APPROVAL_DIGEST', date, created: 0, pushed: 0, emailed: 0, skipped: 0 };
    const dedupeKey = `APPROVAL_DIGEST:${date}`;
    // Everyone whose role appears in an approval matrix, plus the fixed approver roles; pending() then applies each
    // organisation's actual rights, so a user with nothing to approve gets nothing.
    const ruleRoles = await this.prisma.approvalRule.findMany({ distinct: ['roleId'], select: { roleId: true } });
    const approvers = await this.prisma.user.findMany({
      where: { isActive: true, OR: [{ role: { key: { in: APPROVER_ROLES } } }, { roleId: { in: ruleRoles.map((r) => r.roleId) } }] },
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
      });
      if (r.created === 0) {
        result.skipped++;
        continue;
      }
      result.created += r.created;
      result.pushed += r.pushed;
      const sent = await this.email.send({
        to: u.email,
        subject: `[${u.organization.name}] ${pending.length} submission${pending.length === 1 ? '' : 's'} waiting for your approval`,
        text: `Hello ${u.fullName},\n\nThese site submissions are waiting for your review:\n\n${summary.detailText}\n${WEB_URL ? `\nOpen the approvals queue: ${WEB_URL}/approvals\n` : ''}`,
        html: this.digestHtml(u.fullName, pending),
      });
      if (sent) {
        result.emailed++;
        await this.prisma.notification.updateMany({ where: { userId: u.id, dedupeKey }, data: { emailedAt: new Date() } });
      }
    }
    this.log.log(`Approval digest ${date}: ${JSON.stringify(result)}`);
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

  private digestHtml(name: string, pending: PendingApprovalDto[]): string {
    const groups = this.groupByProject(pending);
    const sections = [...groups.entries()]
      .map(
        ([project, items]) => `
        <h3 style="margin:20px 0 6px;font-size:15px;color:#0f2a4d">${escapeHtml(project)} <span style="color:#6b7280;font-weight:normal">(${items.length})</span></h3>
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
          ${items
            .map(
              (i) => `<tr>
                <td style="padding:6px 8px;border-bottom:1px solid #eef0f3;white-space:nowrap;color:#1659a8">${escapeHtml(SUBMISSION_TYPE_LABELS[i.type])}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eef0f3">${escapeHtml(i.title)}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eef0f3;color:#6b7280;white-space:nowrap">${escapeHtml(i.submittedByName)}</td>
              </tr>`,
            )
            .join('')}
        </table>`,
      )
      .join('');
    const link = WEB_URL
      ? `<p style="margin:24px 0"><a href="${escapeHtml(WEB_URL)}/approvals" style="background:#1659a8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Open approvals</a></p>`
      : '';
    return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;max-width:640px;margin:0 auto;padding:24px">
      <p>Hello ${escapeHtml(name)},</p>
      <p><strong>${pending.length}</strong> site submission${pending.length === 1 ? ' is' : 's are'} waiting for your review.</p>
      ${sections}
      ${link}
      <p style="color:#6b7280;font-size:12px">Sent by Construction ERP at ${escapeHtml(new Date().toLocaleString('en-IN', { timeZone: JOB_TIMEZONE }))} (${escapeHtml(JOB_TIMEZONE)}).</p>
    </body></html>`;
  }
}
