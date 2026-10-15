'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Table, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockBalanceDto, StockCountResultDto } from '@erp/shared';
import { MAX_PAGE_SIZE } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useProjects, useStockBalances } from '@/lib/queries';
import { formatQty } from '@/lib/format';
import { downloadXlsx, exportFileName, type ExportColumn } from '@/lib/exportExcel';

const SHEET: ExportColumn<StockBalanceDto>[] = [
  { header: 'Item', value: (r) => r.itemName, width: 40 },
  { header: 'Category', value: (r) => r.category ?? '', width: 16 },
  { header: 'Unit', value: (r) => r.unit, width: 10 },
  { header: 'Book balance', value: (r) => Number(r.balance), width: 14 },
  { header: 'Counted', value: () => '', width: 14 },
  { header: 'Remarks', value: () => '', width: 30 },
];

/**
 * Physical stock count: the book balance of every item that has moved at the project, a counted quantity against
 * each, and the differences posted as one adjustment. The blank sheet downloads for counting on paper.
 */
export function StockCountModal({ open, onClose, projectId: fixedProject }: { open: boolean; onClose: () => void; projectId?: string }) {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [date, setDate] = useState(dayjs());
  const [remarks, setRemarks] = useState('');
  const [counts, setCounts] = useState<Record<string, string | null>>({});
  const projectId = fixedProject ?? projectFilter;
  const stock = useStockBalances({ projectId, pageSize: MAX_PAGE_SIZE, sortBy: 'item', sortOrder: 'asc' }, open && !!projectId);
  const rows = stock.data?.items ?? [];
  const project = (projects ?? []).find((p) => p.id === projectId);

  useEffect(() => {
    if (!open) return;
    setCounts({});
    setRemarks('');
    setDate(dayjs());
  }, [open, projectId]);

  const counted = rows.filter((r) => counts[r.itemId] !== undefined && counts[r.itemId] !== null && counts[r.itemId] !== '');
  const differing = counted.filter((r) => Number(counts[r.itemId]) !== Number(r.balance));

  const post = useMutation({
    mutationFn: async () =>
      (
        await api.post<StockCountResultDto>('/stock/counts', {
          projectId,
          date: date.format('YYYY-MM-DD'),
          remarks: remarks.trim() || null,
          lines: counted.map((r) => ({ itemId: r.itemId, countedQty: String(counts[r.itemId]) })),
        })
      ).data,
    onSuccess: ({ entry: e }) => {
      message.success(e ? `${e.entryNo} posted: ${e.lines.length} item${e.lines.length === 1 ? '' : 's'} corrected` : 'Every count matched the books; nothing to adjust');
      qc.invalidateQueries({ queryKey: ['stock'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const confirm = () =>
    modal.confirm({
      title: `Post the count for ${counted.length} item${counted.length === 1 ? '' : 's'}?`,
      content: differing.length ? `${differing.length} differ${differing.length === 1 ? 's' : ''} from the books and will be adjusted to the counted quantity.` : 'Every count matches the books.',
      okText: 'Post',
      onOk: () => post.mutateAsync(),
    });

  return (
    <Modal
      open={open}
      title="Stock count"
      onCancel={onClose}
      width={860}
      destroyOnHidden
      footer={[
        <Button key="sheet" icon={<DownloadOutlined />} disabled={!rows.length} onClick={() => downloadXlsx(exportFileName(`stock-count-${project?.code ?? 'project'}`), 'count', SHEET, rows)}>
          Blank count sheet
        </Button>,
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="post" type="primary" disabled={!counted.length} loading={post.isPending} onClick={confirm}>
          Post count
        </Button>,
      ]}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', columnGap: 12 }}>
        {!fixedProject && (
          <Form.Item label="Project" layout="vertical">
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Select project"
              value={projectFilter}
              onChange={setProjectFilter}
              options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
            />
          </Form.Item>
        )}
        <Form.Item label="Counted on" layout="vertical">
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" value={date} onChange={(d) => d && setDate(d)} disabledDate={(d) => d.isAfter(dayjs(), 'day')} allowClear={false} />
        </Form.Item>
        <Form.Item label="Remarks" layout="vertical">
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={800} placeholder="Who counted, which store" />
        </Form.Item>
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        Enter what is on the shelf. Items left blank are not touched. Posting sets each counted item to the counted quantity with one adjustment.
      </Typography.Paragraph>
      <Table<StockBalanceDto>
        rowKey="itemId"
        size="small"
        className="stock-count"
        loading={stock.isLoading}
        pagination={false}
        dataSource={rows}
        scroll={{ y: 380, x: 700 }}
        locale={{ emptyText: projectId ? 'Nothing has moved at this project yet' : 'Pick a project' }}
        columns={[
          { title: 'Item', dataIndex: 'itemName', render: (v, r) => <span>{v}{r.category ? <span className="text-muted"> · {r.category}</span> : null}</span> },
          { title: 'Book balance', dataIndex: 'balance', width: 150, align: 'right', render: (v, r) => <span className="mono">{`${formatQty(v)} ${r.unit}`}</span> },
          {
            title: 'Counted',
            key: 'counted',
            width: 170,
            render: (_, r) => (
              <InputNumber<string>
                stringMode
                min="0"
                size="small"
                style={{ width: '100%' }}
                aria-label={`Counted ${r.itemName}`}
                suffix={r.unit}
                value={counts[r.itemId] ?? null}
                onChange={(v) => setCounts((c) => ({ ...c, [r.itemId]: v }))}
              />
            ),
          },
          {
            title: 'Difference',
            key: 'diff',
            width: 130,
            align: 'right',
            render: (_, r) => {
              const c = counts[r.itemId];
              if (c === undefined || c === null || c === '') return <span className="text-muted">-</span>;
              const d = Number(c) - Number(r.balance);
              return <Typography.Text type={d < 0 ? 'danger' : d > 0 ? 'success' : 'secondary'}>{d === 0 ? 'matches' : `${d > 0 ? '+' : ''}${formatQty(String(d))}`}</Typography.Text>;
            },
          },
        ]}
      />
      <Typography.Text style={{ display: 'block', marginTop: 8 }}>
        {counted.length} counted, {differing.length} differ{differing.length === 1 ? 's' : ''}
      </Typography.Text>
    </Modal>
  );
}
