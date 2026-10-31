'use client';

import React from 'react';
import { Flex, Progress, Typography } from 'antd';
import { CHECK_LEVEL_LABELS, type CheckLevel, type LevelCoverage } from '@erp/shared';
import { themeFontSize } from '@/lib/theme';

/** How far each level has checked a set of sheets against its share (item 172): one bar a level, the caller's marked. */
export function CheckCoverage({ coverage, level }: { coverage: LevelCoverage[]; level: CheckLevel | null }) {
  const by = coverage[0]?.byValue === false ? 'of the sheets' : 'by value';
  return (
    <Flex vertical gap={8}>
      {coverage.map((c) => {
        const name = `${CHECK_LEVEL_LABELS[c.level]}${c.level === level ? ' (you)' : ''}`;
        return (
          <div key={c.level}>
            <Flex justify="space-between" gap={8} style={{ fontSize: themeFontSize('fontSizeSM') }}>
              <Typography.Text strong={c.level === level}>{name}</Typography.Text>
              <Typography.Text type="secondary" translate="no">
                {c.checkedPct}% checked of {c.requiredPct}% {by}
              </Typography.Text>
            </Flex>
            <Progress
              size="small"
              showInfo={false}
              percent={Math.min(100, (c.checkedPct / c.requiredPct) * 100)}
              status={c.met ? 'success' : 'normal'}
              aria-label={`${name}: ${c.checkedPct}% checked of ${c.requiredPct}% needed`}
            />
          </div>
        );
      })}
    </Flex>
  );
}
