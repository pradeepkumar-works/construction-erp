'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { NcrSeverity, NcrStatus, QualityTestDto, TestResult } from '@erp/shared';
import { NCR_SEVERITY_LABELS, NCR_STATUS_LABELS, TEST_RESULT_LABELS } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';


export const TestResultTag = ({ result }: { result: TestResult }) => (
  <AppTag kind="testResult" status={result} style={{ margin: 0 }}>
    {TEST_RESULT_LABELS[result]}
  </AppTag>
);

export const SeverityTag = ({ severity }: { severity: NcrSeverity }) => (
  <AppTag variant="kind" style={{ margin: 0 }}>
    {NCR_SEVERITY_LABELS[severity]}
  </AppTag>
);

export const NcrStatusTag = ({ status }: { status: NcrStatus }) => (
  <AppTag kind="ncr" status={status} style={{ margin: 0 }}>
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
