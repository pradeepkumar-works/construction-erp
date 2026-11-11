import { Injectable, Logger } from '@nestjs/common';
import { mayGiveEveryProject, modulesOffFor, scheduleDedupeKey, scheduleDue, type ReportFrequency, type ReportSourceKey, type RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/current-user';
import { dateOnly, parseDate } from '../common/serialize';
import { asTenant } from '../prisma/tenant-context';
import { todayIn } from '../notifications/time';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { MessagingService } from '../messaging/messaging.service';
import { ReportBuilderService, mayReceive } from './report-builder.service';
import { reportEmail } from './report-email';

export interface ReportSchedulesResult {
  job: 'REPORT_SCHEDULES';
  date: string;
  /** Schedules that owed a period today */
  due: number;
  /** Recipients sent their copy for the first time this period */
  sent: number;
  /** Copies handed to the mail service */
  emailed: number;
  /** Recipients who already had this period's copy, or whose role no longer opens the source */
  skipped: number;
  failed: number;
}

/**
 * Scheduled reports (ARCHITECTURE "Reports you build"): each schedule owes one period at a time (`scheduleDue`); each
 * recipient's copy is the report run as them, recorded as their notice under the period's dedupe key (the unique index
 * makes a second run send nothing) and emailed with its table. Rides on the approval digest's cron.
 */
@Injectable()
export class ReportSchedulesService {
  private readonly log = new Logger(ReportSchedulesService.name);

  constructor(
    private prisma: PrismaService,
    private reports: ReportBuilderService,
    private notifications: NotificationsService,
    private mail: EmailService,
    private messaging: MessagingService,
  ) {}

  async sendDue(date = todayIn()): Promise<ReportSchedulesResult> {
    const result: ReportSchedulesResult = { job: 'REPORT_SCHEDULES', date, due: 0, sent: 0, emailed: 0, skipped: 0, failed: 0 };
    const schedules = await this.prisma.reportSchedule.findMany({
      where: { organization: { suspendedAt: null } },
      include: { report: { select: { id: true, name: true, source: true, definition: true } }, organization: { select: { name: true, modulesOff: true, moduleTier: true } } },
    });
    for (const s of schedules) {
      const period = scheduleDue({ frequency: s.frequency as ReportFrequency, weekday: s.weekday, dayOfMonth: s.dayOfMonth, since: dateOnly(s.since)! }, date);
      if (!period) continue;
      result.due++;
      const source = s.report.source as ReportSourceKey;
      const dedupeKey = scheduleDedupeKey(s.id, period);
      let sentAny = false;
      await asTenant(s.organizationId, async () => {
        const users = await this.prisma.user.findMany({
          where: { organizationId: s.organizationId, id: { in: s.recipientIds }, isActive: true },
          select: { id: true, email: true, fullName: true, emailAlerts: true, seesAllProjects: true, role: { select: { key: true } } },
        });
        const off = modulesOffFor(s.organization);
        for (const u of users) {
          const role = u.role.key as RoleKey;
          if (!mayReceive(role, source)) {
            result.skipped++;
            continue;
          }
          const reader: RequestUser = {
            id: u.id,
            organizationId: s.organizationId,
            roleKey: role,
            email: u.email,
            fullName: u.fullName,
            ...(u.seesAllProjects && mayGiveEveryProject(role) ? { seesAllProjects: true } : {}),
            ...(off.length ? { modulesOff: off } : {}),
          };
          try {
            // Checked before the notice is kept, so a copy that cannot be made is tried again on the next run.
            const already = await this.prisma.notification.findFirst({ where: { userId: u.id, dedupeKey }, select: { id: true } });
            if (already) {
              result.skipped++;
              continue;
            }
            const report = await this.reports.run(reader, s.report.definition, { from: period.from, to: period.to, drop: true, title: s.report.name });
            const notice = await this.notifications.notify({
              organizationId: s.organizationId,
              userIds: [u.id],
              type: 'HANDOFF',
              title: `${s.report.name}: ${report.period}`,
              body: `${report.count} ${report.countLabel.toLowerCase()} in your scheduled report.`,
              entityType: 'SAVED_REPORT',
              entityId: s.report.id,
              dedupeKey,
            });
            if (!notice.created) {
              result.skipped++;
              continue;
            }
            result.sent++;
            sentAny = true;
            if (u.email && u.emailAlerts && this.mail.enabled) {
              const q = new URLSearchParams(report.from ? { from: report.from, to: report.to } : {});
              const mail = reportEmail(report, {
                firstName: u.fullName.split(' ')[0],
                href: this.messaging.webUrl(`/my-reports/${s.report.id}${q.size ? `?${q}` : ''}`),
                orgName: s.organization.name,
                count: report.count,
                countLabel: report.countLabel,
              });
              // Handed to the mail service; where none is set up it is written to the log instead.
              await this.mail.send({ to: u.email, ...mail });
              result.emailed++;
            }
          } catch (e) {
            result.failed++;
            this.log.warn(`Scheduled report ${s.report.id} for ${u.id}: ${(e as Error).message}`);
          }
        }
        if (sentAny) await this.prisma.reportSchedule.update({ where: { id: s.id }, data: { lastSentOn: parseDate(period.sendOn) } });
      });
    }
    this.log.log(`Report schedules ${date}: ${JSON.stringify(result)}`);
    return result;
  }
}
