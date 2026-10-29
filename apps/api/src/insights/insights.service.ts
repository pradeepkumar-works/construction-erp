import { Injectable, Logger } from '@nestjs/common';
import { insightKeysFor, type InsightDto, type InsightKey, type InsightsDto } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { todayIn } from '../notifications/time';
import { LeakageService } from '../leakage/leakage.service';
import { CashForecastService } from '../cash-forecast/cash-forecast.service';
import { AttendanceCheckService } from '../attendance-check/attendance-check.service';
import { AiService } from '../ai/ai.service';

const blank = (key: InsightKey): InsightDto => ({ key, attention: false, count: null, inr: null, date: null, month: null, aiReason: null, failed: false });

/**
 * The watch list's Other checks strip (intelligence quick win Q0): the headline of each check that has a page of its own,
 * read through that check's own service with the caller, so a figure here never shows more than the page would.
 */
@Injectable()
export class InsightsService {
  private readonly log = new Logger(InsightsService.name);

  constructor(
    private leakage: LeakageService,
    private cash: CashForecastService,
    private attendance: AttendanceCheckService,
    private ai: AiService,
  ) {}

  async get(user: RequestUser): Promise<InsightsDto> {
    const checks = await Promise.all(
      insightKeysFor(user.roleKey).map(async (key): Promise<InsightDto | null> => {
        try {
          return await this.one(user, key);
        } catch (e) {
          this.log.warn(`Insight ${key} failed: ${(e as Error).message}`);
          return { ...blank(key), failed: true };
        }
      }),
    );
    return { asOf: todayIn(), checks: checks.filter((c): c is InsightDto => !!c) };
  }

  private async one(user: RequestUser, key: InsightKey): Promise<InsightDto | null> {
    switch (key) {
      case 'leakage': {
        const l = await this.leakage.get(user);
        return { ...blank(key), count: l.flags.length, inr: l.totalInr, month: l.month, attention: l.flags.length > 0 };
      }
      case 'cashForecast': {
        const f = await this.cash.forecast(user);
        const short = f.weeks.filter((w) => w.short).length;
        return { ...blank(key), count: short, inr: f.lowest.closing.likely, date: f.firstShort, attention: !!f.firstShort };
      }
      case 'billingReadiness': {
        const r = await this.cash.readiness(user);
        return { ...blank(key), count: r.rows.filter((x) => x.unbilledValue > 0).length, inr: r.totals.unbilled, attention: r.totals.unbilled > 0 || r.totals.pastDue > 0 };
      }
      case 'attendanceCheck': {
        const a = await this.attendance.get(user);
        const inr = a.flags.reduce((s, x) => s + (x.valueInr ?? 0), 0);
        return { ...blank(key), count: a.flags.length, inr: inr || null, month: a.month, attention: a.flags.length > 0 };
      }
      case 'ai': {
        const s = await this.ai.status(user);
        // Shown only while it is off: on, the assistant is in the header for everyone.
        return s.enabled ? null : { ...blank(key), aiReason: s.reason, attention: true };
      }
    }
  }
}
