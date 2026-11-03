'use client';

import React from 'react';
import Link from 'next/link';
import { Flex, Typography } from 'antd';
import { OTHER_DECISION_LABELS, plural, type OtherDecisionGroupDto } from '@erp/shared';
import { tk } from '@/ds';
import { formatDate, formatINR } from '@/lib/format';
import { Section } from '@/components/common/Section';

const waited = (since: string) => {
  const days = Math.max(0, Math.round((Date.now() - Date.parse(`${since}T00:00:00`)) / 86_400_000));
  return days === 0 ? 'since today' : `waiting ${plural(days, 'day')}`;
};

/**
 * Decisions that wait on the caller outside the submission queue: leave, overtime, salary runs, vouchers and letters to
 * sign. Each group says how many and what is at stake, lists the oldest, and links to where they are decided.
 */
export function OtherDecisions({ groups }: { groups: OtherDecisionGroupDto[] }) {
  if (!groups.length) return null;
  const total = groups.reduce((n, g) => n + g.count, 0);
  return (
    <Section title="Also waiting for you" extra={<span className="text-muted">{plural(total, 'decision')} decided in their own modules</span>} style={{ marginTop: tk.space[5] }}>
      <Flex vertical gap={tk.space[4]}>
        {groups.map((g) => (
          <section key={g.kind} aria-label={OTHER_DECISION_LABELS[g.kind]}>
            <Flex align="baseline" gap={tk.space[3]} wrap className="link-row" style={{ paddingBottom: tk.space[1], borderBottom: tk.line('hairline') }}>
              <Typography.Text strong>{OTHER_DECISION_LABELS[g.kind]}</Typography.Text>
              <span className="text-muted" translate="no">
                {[`${g.count} waiting`, g.amount !== null ? formatINR(g.amount) : null].filter(Boolean).join(' · ')}
              </span>
              <Link href={g.href} className="text-link" style={{ marginInlineStart: 'auto' }}>
                Open {OTHER_DECISION_LABELS[g.kind].toLowerCase()}
              </Link>
            </Flex>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {g.items.map((d) => (
                <li key={d.id} style={{ borderBottom: tk.line('hairline') }}>
                  <Link href={d.href} style={{ display: 'block', minHeight: 44, padding: `${tk.space[2]} 0`, color: 'inherit' }}>
                    <Flex justify="space-between" gap={tk.space[2]} align="baseline">
                      <Typography.Text ellipsis={{ tooltip: d.title }} style={{ minWidth: 0, color: tk.color.text.link }}>
                        {d.title}
                      </Typography.Text>
                      {d.amount !== null && (
                        <Typography.Text className="mono" translate="no" style={{ whiteSpace: 'nowrap', fontSize: tk.type.caption.fontSize }}>
                          {formatINR(d.amount)}
                        </Typography.Text>
                      )}
                    </Flex>
                    <Flex justify="space-between" gap={tk.space[2]}>
                      <Typography.Text type="secondary" ellipsis style={{ minWidth: 0, fontSize: tk.type.caption.fontSize }}>
                        {[d.projectName, d.note].filter(Boolean).join(' · ')}
                      </Typography.Text>
                      <Typography.Text type="secondary" title={formatDate(d.since)} style={{ whiteSpace: 'nowrap', fontSize: tk.type.caption.fontSize }}>
                        {waited(d.since)}
                      </Typography.Text>
                    </Flex>
                  </Link>
                </li>
              ))}
            </ul>
            {g.count > g.items.length && (
              <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
                {g.count - g.items.length} more under {OTHER_DECISION_LABELS[g.kind].toLowerCase()}
              </Typography.Text>
            )}
          </section>
        ))}
      </Flex>
    </Section>
  );
}

/**
 * The same decisions in one line above the inbox, for an approver, whose queue and review pane fill the window: how many
 * of each and the rupees at stake, each linking to where they are decided.
 */
export function OtherDecisionsLine({ groups }: { groups: OtherDecisionGroupDto[] }) {
  if (!groups.length) return null;
  return (
    <Flex component="section" aria-label="Also waiting for you" wrap align="center" gap={tk.space[4]} className="link-row" style={{ marginBottom: tk.space[3] }}>
      <Typography.Text type="secondary">Also waiting for you</Typography.Text>
      {groups.map((g) => (
        <Link key={g.kind} href={g.href} className="text-link" translate="no">
          {[OTHER_DECISION_LABELS[g.kind], String(g.count), g.amount !== null ? formatINR(g.amount) : null].filter(Boolean).join(' · ')}
        </Link>
      ))}
    </Flex>
  );
}
