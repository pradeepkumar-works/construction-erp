import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

/**
 * Reads makers' feeds every hour on a host that keeps the API running (NOTIFICATION_JOBS_INPROCESS=true, as for the
 * notification jobs). On Vercel an external hourly cron calls GET /api/integrations/jobs/machine-feeds, and the daily
 * digest runs it too.
 */
@Injectable()
export class IntegrationsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(IntegrationsSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private integrations: IntegrationsService) {}

  onModuleInit() {
    if (process.env.NOTIFICATION_JOBS_INPROCESS !== 'true') return;
    // Each feed waits its own hour (feedDue), so looking every five minutes spreads them out.
    this.timer = setInterval(() => void this.tick(), 5 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.integrations.pollDue();
    } catch (e) {
      this.log.error(`Machine feeds failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
