'use client';

import React from 'react';
import Link from 'next/link';
import { Flex, Typography, theme } from 'antd';
import { DPR_CHECK_LABELS, type DprCheckDto } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';
import type { RecordSection } from '@/components/record/RecordFrame';

/**
 * What an approver should look at twice before approving a DPR: work with no crew, work whose
 * material was not issued, figures the same as on the reports before, a photo sent before. Advice; it stops nothing.
 */
function DprChecks({ checks }: { checks: DprCheckDto[] }) {
  const { token } = theme.useToken();
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: token.marginSM }}>
        Worth a second look before approving. These are checks over the records, not findings; nothing here stops the approval.
      </Typography.Paragraph>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: token.marginSM }}>
        {checks.map((c, i) => (
          <li key={`${c.kind}-${c.lineId ?? 'day'}-${i}`}>
            <Flex gap={token.marginXS} wrap align="baseline">
              <AppTag tone="pending">{DPR_CHECK_LABELS[c.kind]}</AppTag>
              <Typography.Text>{c.text}</Typography.Text>
              {c.refs.map((r) => (
                <Link key={r.href} href={r.href}>
                  {r.label}
                </Link>
              ))}
            </Flex>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The Checks section for a DPR's sections list; none while there is nothing to say. */
export const dprChecksSection = (checks: DprCheckDto[] | undefined): RecordSection[] =>
  checks?.length ? [{ key: 'checks', title: 'Checks', count: checks.length, children: <DprChecks checks={checks} /> }] : [];
