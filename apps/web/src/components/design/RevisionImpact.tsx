'use client';

import React, { useState } from 'react';
import { Button, Divider, Flex, Table, Typography, theme } from 'antd';
import Link from 'next/link';
import { copyLabel, type ControlledCopyDto, type ImpactTone, type RevisionImpactItem } from '@erp/shared';
import { useRevisionImpact } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { AppTag, type TagTone } from '@/components/common/AppTag';
import { PlusOutlined } from '@/components/common/icons';
import { CopyStateTag, IssueCopiesDialog, ReissueDialog, TakeBackDialog } from './ControlledCopies';

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };
const TONE: Record<ImpactTone, TagTone> = { danger: 'danger', warning: 'pending', info: 'info' };
const KEY_LABEL: Record<RevisionImpactItem['key'], string> = {
  copies: 'Copies',
  submissions: 'Approval',
  takeoffs: 'Quantities',
  markups: 'Marks',
  rfis: 'RFIs',
  schedule: 'Schedule',
  deliverables: 'EPC',
};

/** What a revision changes, as a short list: each line with its area and what to do. */
export function ImpactList({ items }: { items: RevisionImpactItem[] }) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={token.marginXS}>
      {items.map((i, n) => (
        <Flex key={`${i.key}-${n}`} gap={token.marginXS} align="baseline">
          <AppTag tone={TONE[i.tone]} style={{ flex: 'none' }}>
            {KEY_LABEL[i.key]}
          </AppTag>
          <span>
            {i.text}
            {i.key === 'submissions' && i.ids?.length ? (
              <>
                {' '}
                {i.ids.map((id, k) => (
                  <React.Fragment key={id}>
                    {k ? ', ' : ''}
                    <Link href={`/design-submissions/${id}`} aria-label={`Open design submission ${k + 1} of ${i.ids!.length}`}>{i.ids!.length > 1 ? `Open ${k + 1}` : 'Open'}</Link>
                  </React.Fragment>
                ))}
              </>
            ) : null}
          </span>
        </Flex>
      ))}
    </Flex>
  );
}

/**
 * In the document drawer: what its current revision changes, then its controlled copies, with Issue copies, Give the new
 * revision and Take back for those who keep the register.
 */
export function RevisionImpactPanel({ documentId, projectId, manage, buildable }: { documentId: string; projectId: string; manage: boolean; buildable: boolean }) {
  const { token } = theme.useToken();
  const { data } = useRevisionImpact(documentId);
  const [issuing, setIssuing] = useState(false);
  const [takeBack, setTakeBack] = useState<ControlledCopyDto | null>(null);
  const [reissue, setReissue] = useState<ControlledCopyDto | null>(null);
  if (!data) return null;
  const out = data.copies.filter((c) => c.state !== 'CLOSED');
  const back = data.copies.length - out.length;
  const holding = new Set(out.filter((c) => c.state === 'IN_FORCE').map((c) => c.holder.toLowerCase()));
  const recall = [...new Set(out.filter((c) => c.state === 'TO_RECALL' && !holding.has(c.holder.toLowerCase())).map((c) => c.holder))];
  return (
    <>
      {data.items.length ? (
        <>
          <Divider titlePlacement="start" plain>
            {`What ${data.revision} changes`}
          </Divider>
          <ImpactList items={data.items} />
        </>
      ) : null}
      <Divider titlePlacement="start" plain>
        {`Controlled copies (${out.length})`}
      </Divider>
      {manage && buildable ? (
        <Button size="small" icon={<PlusOutlined />} onClick={() => setIssuing(true)} style={{ marginBottom: token.marginXS }}>
          {`Issue copies of ${data.revision}`}
        </Button>
      ) : null}
      {out.length ? (
        <Table<ControlledCopyDto>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={out}
          scroll={{ x: 560 }}
          columns={[
            { title: 'Copy', key: 'copy', width: 72, render: (_, c) => <span translate="no">{copyLabel(c.copyNo)}</span> },
            { title: 'Held by', dataIndex: 'holder', render: (v: string) => <span translate="no">{v}</span> },
            { title: 'Rev', dataIndex: 'revision', width: 60, render: (v: string) => <span translate="no">{v}</span> },
            { title: 'Issued', dataIndex: 'issuedOn', width: 110, render: (v: string) => <span translate="no">{formatDate(v)}</span> },
            { title: 'Status', key: 'state', width: 150, render: (_, c) => <CopyStateTag copy={c} /> },
            ...(manage
              ? [
                  {
                    title: <span style={srOnly}>Actions</span>,
                    key: 'act',
                    width: 120,
                    render: (_: unknown, c: ControlledCopyDto) =>
                      c.state === 'TO_RECALL' ? (
                        <Flex vertical gap={4} align="start">
                          <Button size="small" onClick={() => setTakeBack(c)}>
                            Withdraw copy
                          </Button>
                          {buildable && !holding.has(c.holder.toLowerCase()) ? (
                            <Button size="small" type="link" onClick={() => setReissue(c)} style={{ paddingInline: 0 }}>
                              {`Issue ${c.currentRevision}`}
                            </Button>
                          ) : null}
                        </Flex>
                      ) : null,
                  },
                ]
              : []),
          ]}
        />
      ) : (
        <Typography.Text type="secondary">No controlled copy out.</Typography.Text>
      )}
      {back ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: token.marginXS, marginBottom: 0 }}>
          {`${back} earlier cop${back === 1 ? 'y' : 'ies'} taken back. `}
          <Link href={`/controlled-copies?documentId=${documentId}`}>All copies of {data.docNo}</Link>
        </Typography.Paragraph>
      ) : null}
      <IssueCopiesDialog open={issuing} onClose={() => setIssuing(false)} documentId={documentId} projectId={projectId} title={`${data.docNo} ${data.revision}`} holders={recall} />
      <TakeBackDialog copy={takeBack} open={!!takeBack} onClose={() => setTakeBack(null)} />
      <ReissueDialog copy={reissue} open={!!reissue} onClose={() => setReissue(null)} />
    </>
  );
}
