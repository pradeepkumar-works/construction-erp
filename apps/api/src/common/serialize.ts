import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { todayIn } from '../notifications/time';

/** Decimal -> string, Date -> ISO string (date-only columns -> YYYY-MM-DD). */
export const dec = (v: Prisma.Decimal | number | null | undefined): string | null =>
  v === null || v === undefined ? null : new Prisma.Decimal(v).toFixed(3).replace(/\.?0+$/, '') || '0';

export const money = (v: Prisma.Decimal | number | null | undefined): string | null =>
  v === null || v === undefined ? null : new Prisma.Decimal(v).toFixed(2);

/** An exchange rate, to six places without trailing zeros. */
export const fxRate = (v: Prisma.Decimal | null | undefined): string | null => (v ? v.toFixed(6).replace(/\.?0+$/, '') : null);

export const dateOnly = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export const pct = (executed: Prisma.Decimal | number, planned: Prisma.Decimal | number): number => {
  const p = new Prisma.Decimal(planned);
  if (p.lte(0)) return 0;
  const r = new Prisma.Decimal(executed).div(p).mul(100).toNumber();
  return Math.round(Math.min(Math.max(r, 0), 100) * 10) / 10;
};

/** Parse a YYYY-MM-DD string into a UTC date for @db.Date columns. */
export const parseDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

/**
 * A day's record cannot be dated after today in the company's time zone: a DPR,
 * progress or attendance for a day still to come was taken before.
 */
export function assertNotAfterToday(date: string, what: string) {
  if (date.slice(0, 10) > todayIn()) throw new BadRequestException(`The ${what} date cannot be after today. Choose today or an earlier day.`);
}

/** A YYYY-MM-DD day as people read it in a message: 31 Mar 2026. */
export const formatDay = (d: string | null | undefined): string =>
  d ? parseDate(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
