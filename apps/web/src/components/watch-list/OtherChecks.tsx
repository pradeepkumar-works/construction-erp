'use client';

import React from 'react';
import Link from 'next/link';
import { INSIGHT_HREFS, INSIGHT_TITLES, PRODUCT_NAME, type InsightDto } from '@erp/shared';
import { FigureStrip, type StripFigure } from '@/components/management/FigureStrip';
import { formatDate, formatINRCompact, formatMonthName } from '@/lib/format';

const AI_OFF: Record<NonNullable<InsightDto['aiReason']>, string> = {
  NOT_CONFIGURED: 'The server has no AI key yet: set OPENROUTER_API_KEY on the API, then switch it on here.',
  COMPANY_OFF: 'Off for the company: switch it on to use Ask, drafts, document reading and the morning brief.',
  CAP_REACHED: "This month's allowance is used: raise it to carry on.",
  READ_ONLY: 'Off while the subscription is read-only.',
  ROLE_OFF: 'Not open to your role.',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What one check's headline says: the figure, and a line on what it means. */
function figureOf(c: InsightDto): Pick<StripFigure, 'value' | 'note' | 'tone'> {
  if (c.failed) return { value: '–', note: 'Could not be worked out just now. Open the page for the figures.' };
  const n = c.count ?? 0;
  switch (c.key) {
    case 'leakage':
      return {
        value: c.inr !== null ? formatINRCompact(c.inr) : plural(n, 'flag'),
        note: n ? `${plural(n, 'flag')} in ${formatMonthName(c.month)}${c.inr !== null ? ', at risk' : ''}` : `Nothing flagged in ${formatMonthName(c.month)}`,
        tone: n ? 'danger' : undefined,
      };
    case 'cashForecast':
      return {
        value: n ? plural(n, 'week') + ' short' : 'No week short',
        note: c.date ? `From the week of ${formatDate(c.date)}; lowest ${formatINRCompact(c.inr)}` : `Over 13 weeks; lowest ${formatINRCompact(c.inr)}`,
        tone: n ? 'danger' : undefined,
      };
    case 'billingReadiness':
      return {
        value: formatINRCompact(c.inr),
        note: n ? `Measured and not billed, on ${plural(n, 'project')}` : 'Everything measured is billed',
      };
    case 'attendanceCheck':
      return {
        value: plural(n, 'flag'),
        note: n ? `Man-days above the records in ${formatMonthName(c.month)}${c.inr ? `, ${formatINRCompact(c.inr)}` : ''}` : `Nothing above the records in ${formatMonthName(c.month)}`,
        tone: n ? 'danger' : undefined,
      };
    case 'ai':
      return { value: 'Off', note: c.aiReason ? AI_OFF[c.aiReason] : `Switch Ask ${PRODUCT_NAME} on here.` };
  }
}

/**
 * The watch list's Other checks: the checks that have pages of their own, each with its headline
 * and a link, so one page shows everything Nirmaan's rules have found. Only the checks the person may open.
 */
export function OtherChecks({ checks }: { checks: InsightDto[] }) {
  if (!checks.length) return null;
  const figures: StripFigure[] = checks.map((c) => ({
    key: c.key,
    label: <Link href={INSIGHT_HREFS[c.key]}>{INSIGHT_TITLES[c.key]}</Link>,
    ...figureOf(c),
  }));
  return <FigureStrip label="Other checks" figures={figures} />;
}
