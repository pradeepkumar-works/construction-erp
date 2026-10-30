'use client';

import { Table, Typography } from 'antd';
import type { IndentCheckDto, IndentCheckLineDto } from '@erp/shared';
import { formatQty, toNumber } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';

/** What a line's check says, in a few words (`@erp/shared/indent-check.ts`). */
function Verdict({ line }: { line: IndentCheckLineDto }) {
  const tags = [];
  if (line.notes.includes('OVER_BOQ'))
    tags.push(
      <AppTag key="over" tone="danger" dot>
        {formatQty(line.over)} past the BOQ
      </AppTag>,
    );
  if (line.notes.includes('STOCK_COVERS'))
    tags.push(
      <AppTag key="stock" tone="pending" dot>
        Store has it all
      </AppTag>,
    );
  else if (line.notes.includes('STOCK_PART'))
    tags.push(
      <AppTag key="part" tone="info">
        {formatQty(line.fromStock)} from the store
      </AppTag>,
    );
  if (!tags.length && line.notes.includes('NO_NORM')) return <span className="text-muted">No norm for this item</span>;
  if (!tags.length) return <AppTag tone="success">Within the BOQ</AppTag>;
  return <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>{tags}</span>;
}

const muted = (v: string | null) => (v === null ? <span className="text-muted">-</span> : toNumber(v) === 0 ? <span className="text-muted">0</span> : <span translate="no">{formatQty(v)}</span>);

/**
 * Indent checks (item 170): each line against the site's own store and what the BOQ allows for the item from the
 * project's norms, for the approver to read before deciding. Advice only.
 */
export function IndentChecks({ check, loading }: { check: IndentCheckDto | undefined; loading: boolean }) {
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        The BOQ allows what the project&apos;s norms give over the whole BOQ. Left is that less what was issued, what the store holds and what other requests waiting ask for.
      </Typography.Paragraph>
      <Table<IndentCheckLineDto>
        size="small"
        rowKey="materialRequestItemId"
        pagination={false}
        loading={loading}
        dataSource={check?.lines ?? []}
        scroll={{ x: 760 }}
        columns={[
          { title: 'Item', dataIndex: 'itemName', render: (v: string, l) => <span translate="no">{`${v} (${l.unit})`}</span> },
          { title: 'Asked', dataIndex: 'requested', align: 'right', width: 80, render: muted },
          { title: 'In store', dataIndex: 'onHand', align: 'right', width: 80, render: muted },
          { title: 'BOQ allows', dataIndex: 'allowance', align: 'right', width: 100, render: muted },
          { title: 'Issued', dataIndex: 'issued', align: 'right', width: 80, render: muted },
          { title: 'Waiting', dataIndex: 'waiting', align: 'right', width: 80, render: muted },
          { title: 'Left', dataIndex: 'left', align: 'right', width: 80, render: muted },
          { title: 'Check', key: 'verdict', width: 190, render: (_, l) => <Verdict line={l} /> },
        ]}
      />
    </>
  );
}
