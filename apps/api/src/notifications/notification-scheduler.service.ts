import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationJobsService } from './notification-jobs.service';
import { JOB_TIMEZONE, todayIn, wallClockIn } from './time';

/**
 * Optional in-process scheduler for hosts that keep the API running (Docker / Railway).
 * Enabled with NOTIFICATION_JOBS_INPROCESS=true; fires the DPR reminder at DPR_REMINDER_TIME and the
 * approval digest at APPROVAL_DIGEST_TIME (HH:mm in NOTIFICATION_TIMEZONE), and approval reminders and escalation
 * every hour on the hour. On Vercel use Cron instead.
 */
@Injectable()
export class NotificationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NotificationSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private lastRun = new Map<string, string>();

  constructor(private jobs: NotificationJobsService) {}

  onModuleInit() {
    if (process.env.NOTIFICATION_JOBS_INPROCESS !== 'true') return;
    const reminderAt = process.env.DPR_REMINDER_TIME || '17:00';
    const digestAt = process.env.APPROVAL_DIGEST_TIME || '09:00';
    const briefsAt = process.env.MORNING_BRIEF_TIME || '06:00';
    this.log.log(`In-process notification jobs enabled: DPR reminder at ${reminderAt}, approval digest at ${digestAt}, morning briefs written at ${briefsAt} (${JOB_TIMEZONE})`);
    this.timer = setInterval(() => void this.tick(reminderAt, digestAt, briefsAt), 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(reminderAt: string, digestAt: string, briefsAt: string) {
    const now = wallClockIn();
    const today = todayIn();
    await this.runIfDue('DPR_REMINDER', reminderAt, now, today, () => this.jobs.dprReminder(today));
    await this.runIfDue('BRIEFS', briefsAt, now, today, () => this.jobs.writeBriefs(today));
    await this.runIfDue('APPROVAL_DIGEST', digestAt, now, today, () => this.jobs.approvalDigest(today));
    await this.runIfDue('MORNING_BRIEF', digestAt, now, today, () => this.jobs.morningBrief(today));
    await this.runIfDue('TESTS_DUE', digestAt, now, today, () => this.jobs.testsDue(today));
    await this.runIfDue('BILLS_DUE', digestAt, now, today, () => this.jobs.billsDue(today));
    await this.runIfDue('LOAN_EMIS_DUE', digestAt, now, today, () => this.jobs.loanEmisDue(today));
    await this.runIfDue('MACHINERY_DUE', digestAt, now, today, () => this.jobs.machineryDue(today));
    await this.runIfDue('COMPLIANCE_DUE', digestAt, now, today, () => this.jobs.complianceDue(today));
    await this.runIfDue('HANDOVER_DUE', digestAt, now, today, () => this.jobs.handoverDue(today));
    await this.runIfDue('WATCH_LIST', digestAt, now, today, () => this.jobs.watchList(today));
    if (now.endsWith(':00')) await this.runIfDue(`ESCALATION_${now}`, now, now, today, () => this.jobs.approvalEscalation());
  }

  private async runIfDue(key: string, at: string, now: string, today: string, run: () => Promise<unknown>) {
    if (now !== at || this.lastRun.get(key) === today) return;
    this.lastRun.set(key, today);
    try {
      await run();
    } catch (e) {
      this.log.error(`${key} failed: ${(e as Error).message}`);
    }
  }
}
