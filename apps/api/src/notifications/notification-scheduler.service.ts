import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationJobsService } from './notification-jobs.service';
import { JOB_TIMEZONE, todayIn, wallClockIn } from './time';

/**
 * Optional in-process scheduler for hosts that keep the API running (Docker / Railway).
 * Enabled with NOTIFICATION_JOBS_INPROCESS=true; fires the DPR reminder at DPR_REMINDER_TIME and the
 * approval digest at APPROVAL_DIGEST_TIME (HH:mm in NOTIFICATION_TIMEZONE). On Vercel use Cron instead.
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
    this.log.log(`In-process notification jobs enabled: DPR reminder at ${reminderAt}, approval digest at ${digestAt} (${JOB_TIMEZONE})`);
    this.timer = setInterval(() => void this.tick(reminderAt, digestAt), 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(reminderAt: string, digestAt: string) {
    const now = wallClockIn();
    const today = todayIn();
    await this.runIfDue('DPR_REMINDER', reminderAt, now, today, () => this.jobs.dprReminder(today));
    await this.runIfDue('APPROVAL_DIGEST', digestAt, now, today, () => this.jobs.approvalDigest(today));
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
