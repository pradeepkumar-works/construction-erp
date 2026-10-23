'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Flex, Tag, Typography, theme } from 'antd';
import { DELAY_PARTY_LABELS, RISK_CATEGORY_LABELS, type HindranceSuggestionDto, type RiskDto } from '@erp/shared';
import { useDecideHindrance, useDprHindrance, useHindranceSuggestions } from '@/lib/queries';
import { formatDate } from '@/lib/format';

const SHOWN = 4;

/** One DPR remark read as a hindrance: what it says, what was read from it, and Record / Add to / Dismiss. */
export function HindranceRow({ s, onRecorded, showProject = true, showDpr = true }: { s: HindranceSuggestionDto; onRecorded?: (r: RiskDto) => void; showProject?: boolean; showDpr?: boolean }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const decide = useDecideHindrance();
  const busy = decide.isPending ? (decide.variables?.dismiss ? 'dismiss' : decide.variables?.riskId ? 'add' : 'record') : null;
  const record = async (riskId?: string) => {
    const r = (await decide.mutateAsync({ id: s.id, riskId })) as RiskDto;
    message.success(riskId ? `Added to ${r.riskNo}` : `${r.riskNo} recorded`);
    onRecorded?.(r);
  };
  return (
    <Flex data-hindrance={s.id} vertical gap={token.marginXXS} style={{ paddingBlock: token.paddingXS, borderTop: `1px solid ${token.colorSplit}` }}>
      <Flex wrap align="center" gap={token.marginXS}>
        <Typography.Text strong>{s.title}</Typography.Text>
        <Tag>{RISK_CATEGORY_LABELS[s.category]}</Tag>
        {s.party ? <Typography.Text type="secondary">{DELAY_PARTY_LABELS[s.party]}</Typography.Text> : <Typography.Text type="secondary">Cause not clear</Typography.Text>}
        {s.source === 'MODEL' ? <Tag color="purple">Check this</Tag> : null}
      </Flex>
      <p style={{ margin: 0 }}>
        “{s.remark}”{' '}
        <Typography.Text type="secondary">
          {showProject ? <span translate="no">{s.projectCode}</span> : null}
          {showProject ? ', ' : ''}
          {showDpr ? (
            <>
              <Link href={`/dpr/${s.dprId}`} className="text-link">
                DPR of {formatDate(s.reportDate)}
              </Link>
              ,{' '}
            </>
          ) : null}
          {showDpr ? 'held' : 'Held'} up since {formatDate(s.delayStart)}
          {s.matched.length ? `. Read from: ${s.matched.join(', ')}` : ''}
          {s.source === 'MODEL' ? '. Read by Ask Nirmaan' : ''}
        </Typography.Text>
      </p>
      <Flex wrap gap={token.marginXS}>
        {s.openDelay ? (
          <Button size="small" type="primary" loading={busy === 'add'} disabled={!!busy} onClick={() => void record(s.openDelay!.id)}>
            Add to {s.openDelay.riskNo}
          </Button>
        ) : null}
        <Button size="small" type={s.openDelay ? 'default' : 'primary'} loading={busy === 'record'} disabled={!!busy} onClick={() => void record()}>
          {s.openDelay ? 'Record as a new delay' : 'Record delay'}
        </Button>
        <Button size="small" loading={busy === 'dismiss'} disabled={!!busy} onClick={() => decide.mutateAsync({ id: s.id, dismiss: true }).then(() => message.success('Dismissed'))}>
          Dismiss
        </Button>
      </Flex>
    </Flex>
  );
}

/**
 * Hindrances read from the DPRs' remarks (AI item 123), for the project manager on the delay register: each recorded as
 * a delay (which then runs its notice clock), added to the open delay it belongs to, or dismissed.
 */
export function HindranceSuggestions({ projectId, onRecorded }: { projectId?: string; onRecorded: (r: RiskDto) => void }) {
  const { token } = theme.useToken();
  const { data } = useHindranceSuggestions(projectId);
  const [all, setAll] = useState(false);
  if (!data?.length) return null;
  const shown = all ? data : data.slice(0, SHOWN);
  return (
    <section aria-labelledby="hindrances-title" style={{ margin: `${token.marginSM}px ${token.margin}px 0`, padding: `${token.paddingSM}px ${token.padding}px`, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, background: token.colorFillQuaternary }}>
      <Typography.Title level={2} id="hindrances-title" style={{ fontSize: token.fontSize, margin: `0 0 ${token.marginXXS}px` }}>
        {data.length === 1 ? '1 hindrance from the DPRs to record' : `${data.length} hindrances from the DPRs to record`}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: token.marginXS }}>
        Read from what the site wrote under issues. Recording one starts its notice clock when the client or a third party is answerable.
      </Typography.Paragraph>
      {shown.map((s) => (
        <HindranceRow key={s.id} s={s} onRecorded={onRecorded} showProject={!projectId} />
      ))}
      {data.length > SHOWN ? (
        <Button type="link" size="small" onClick={() => setAll((v) => !v)} style={{ paddingInline: 0 }}>
          {all ? 'Show fewer' : `Show all ${data.length}`}
        </Button>
      ) : null}
    </section>
  );
}

/** Under a DPR's issues: the hindrance its remark reads as, to record from the report itself. */
export function DprHindrance({ dprId }: { dprId: string }) {
  const { token } = theme.useToken();
  const { data } = useDprHindrance(dprId);
  if (!data) return null;
  return (
    <div style={{ marginBottom: token.marginSM }}>
      <Typography.Text type="secondary">This reads as a hindrance to record in the delay register:</Typography.Text>
      <HindranceRow s={data} showProject={false} showDpr={false} />
    </div>
  );
}
