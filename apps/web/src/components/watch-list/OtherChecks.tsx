'use client';

import React from 'react';
import Link from 'next/link';
import { Flex } from 'antd';
import { INSIGHT_HREFS, INSIGHT_TITLES, PRODUCT_NAME, figure, type FigureInput, type InsightDto } from '@erp/shared';
import { formatDate, plural } from '@/lib/format';
import { Figures } from '@/components/figures';
import { tk } from '@/ds';

const AI_OFF: Record<NonNullable<InsightDto['aiReason']>, string> = {
  NOT_CONFIGURED: 'The server has no AI key yet: set OPENROUTER_API_KEY on the API, then switch it on here.',
  COMPANY_OFF: 'Switch it on for the company to use Ask, drafts, document reading and the morning brief.',
  CAP_REACHED: "This month's allowance is used: raise it to carry on.",
  READ_ONLY: 'It stays off while the subscription is read-only.',
  ROLE_OFF: 'It is not open to your role.',
};

const FAILED = { none: 'Could not be worked out just now; open the page for the figures' };

/** One check's headline as facts; the assistant is a switch, not a figure, so it has none. */
function figureOf(c: InsightDto): FigureInput {
  const n = c.count ?? 0;
  const month = c.month ? { month: c.month } : undefined;
  switch (c.key) {
    case 'leakage':
      if (c.failed) return figure('leakageFlags', FAILED);
      return c.inr ? figure('leakageAtRisk', c.inr, { when: month, count: n }) : figure('leakageFlags', n, { when: month });
    case 'cashForecast':
      if (c.failed || c.inr === null) return figure('cashLowest', FAILED);
      return figure('cashLowest', c.inr, n ? { attention: { level: 'act', because: `${plural(n, 'week')} short${c.date ? `, from the week of ${formatDate(c.date)}` : ''}` } } : undefined);
    case 'billingReadiness':
      return figure('measuredNotBilled', c.failed || c.inr === null ? FAILED : c.inr, { count: n });
    case 'attendanceCheck':
      if (c.failed) return figure('attendanceFlags', FAILED);
      return c.inr ? figure('attendanceFlags', n, { when: month, versus: { part: figure('attendanceFlagValue', c.inr) } }) : figure('attendanceFlags', n, { when: month });
    case 'ai':
      return null;
  }
}

/**
 * The watch list's Other checks: the checks that have pages of their own, each with its headline figure linking to its
 * page, so one page shows everything Nirmaan's rules have found. Only the checks the person may open.
 */
export function OtherChecks({ checks }: { checks: InsightDto[] }) {
  const figures = checks.map(figureOf).filter(Boolean);
  const ai = checks.find((c) => c.key === 'ai');
  if (!figures.length && !ai) return null;
  return (
    <Flex vertical gap={tk.space[2]}>
      {figures.length > 0 && <Figures label="Other checks" figures={figures} />}
      {ai && (
        <p style={{ ...tk.type.body, margin: 0, color: tk.color.text.muted }}>
          <Link href={INSIGHT_HREFS.ai}>{INSIGHT_TITLES.ai}</Link> is off. {ai.aiReason ? AI_OFF[ai.aiReason] : `Switch Ask ${PRODUCT_NAME} on here.`}
        </p>
      )}
    </Flex>
  );
}
