'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { NcrSeverity, NcrStatus, QualityTestDto, TestResult } from '@erp/shared';
import { NCR_SEVERITY_LABELS, NCR_STATUS_LABELS, TEST_RESULT_LABELS } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';

const RESULT_TAG: Record<TestResult, string> = { PENDING: 'default', PASS: 'green', FAIL: 'red' };
const SEVERITY_TAG: Record<NcrSeverity, string> = { MINOR: 'gold', MAJOR: 'orange', CRITICAL: 'red' };
const STATUS_TAG: Record<NcrStatus, string> = { OPEN: 'red', ACTION_TAKEN: 'blue', CLOSED: 'default' };

export const TestResultTag = ({ result }: { result: TestResult }) => (
  <AppTag color={RESULT_TAG[result]} dot style={{ margin: 0 }}>
    {TEST_RESULT_LABELS[result]}
  </AppTag>
);

export const SeverityTag = ({ severity }: { severity: NcrSeverity }) => (
  <AppTag color={SEVERITY_TAG[severity]} style={{ margin: 0 }}>
    {NCR_SEVERITY_LABELS[severity]}
  </AppTag>
);

export const NcrStatusTag = ({ status }: { status: NcrStatus }) => (
  <AppTag color={STATUS_TAG[status]} dot style={{ margin: 0 }}>
    {NCR_STATUS_LABELS[status]}
  </AppTag>
);

/** "7 days 18.9 · 28 days due 11 Nov": each reading's value, or when it is due. */
export function ReadingsSummary({ t }: { t: QualityTestDto }) {
  return (
    <div style={{ fontSize: themeFontSize('fontSizeSM') }}>
      {t.readings.map((r) => (
        <div key={r.id} style={{ whiteSpace: 'nowrap' }}>
          {t.readings.length > 1 ? <span className="text-muted">{r.label}: </span> : null}
          {r.value !== null ? (
            <span>
              {Number(r.value)}
              {t.unit ? ` ${t.unit}` : ''}
            </span>
          ) : r.dueOn ? (
            <span className={r.overdue ? 'text-danger' : 'text-muted'}>{r.overdue ? `overdue since ${formatDate(r.dueOn)}` : `due ${formatDate(r.dueOn)}`}</span>
          ) : (
            <span className="text-muted">-</span>
          )}
        </div>
      ))}
    </div>
  );
}
