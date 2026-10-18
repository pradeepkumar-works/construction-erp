'use client';

import React, { useEffect } from 'react';
import { App, Button, DatePicker, Form, Input, InputNumber, Select, Table, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockBalanceDto, StockCountResultDto } from '@erp/shared';
import { MAX_PAGE_SIZE } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useProjects, useStockBalances } from '@/lib/queries';
import { formatQty } from '@/lib/format';
import { downloadXlsx, exportFileName, type ExportColumn } from '@/lib/exportExcel';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { themeFontSize } from '@/lib/theme';

const SHEET: ExportColumn<StockBalanceDto>[] = [
  { header: 'Item', value: (r) => r.itemName, width: 40 },
  { header: 'Category', value: (r) => r.category ?? '', width: 16 },
  { header: 'Unit', value: (r) => r.unit, width: 10 },
  { header: 'Book balance', value: (r) => Number(r.balance), width: 14 },
  { header: 'Counted', value: () => '', width: 14 },
  { header: 'Remarks', value: () => '', width: 30 },
];

interface FormValues {
  projectId?: string;
  date: dayjs.Dayjs;
  remarks?: string;
  /** Counted quantity by item id */
  counts?: Record<string, string | null>;
}

const filled = (v: string | null | undefined) => v !== undefined && v !== null && v !== '';

/**
 * Physical stock count: the book balance of every item that has moved at the project, a counted quantity against
 * each, and the differences posted as one adjustment. The blank sheet downloads for counting on paper.
 */
export function StockCountModal({ open, onClose, projectId: fixedProject }: { open: boolean; onClose: () => void; projectId?: string }) {
  const [form] = Form.useForm<FormValues>();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const watchedProject = Form.useWatch('projectId', form);
  const counts = (Form.useWatch('counts', form) ?? {}) as Record<string, string | null>;
  const projectId = fixedProject ?? watchedProject;
  const stock = useStockBalances({ projectId, pageSize: MAX_PAGE_SIZE, sortBy: 'item', sortOrder: 'asc' }, open && !!projectId);
  const rows = stock.data?.items ?? [];
  const project = (projects ?? []).find((p) => p.id === projectId);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ date: dayjs(), counts: {} });
  }, [open, form]);

  const counted = rows.filter((r) => filled(counts[r.itemId]));
  const differing = counted.filter((r) => Number(counts[r.itemId]) !== Number(r.balance));

  const post = useMutation({
    mutationFn: async (v: FormValues) =>
      (
        await api.post<StockCountResultDto>('/stock/counts', {
          projectId,
          date: v.date.format('YYYY-MM-DD'),
          remarks: v.remarks?.trim() || null,
          lines: rows.filter((r) => filled(v.counts?.[r.itemId])).map((r) => ({ itemId: r.itemId, countedQty: String(v.counts?.[r.itemId]) })),
        })
      ).data,
    onSuccess: ({ entry: e }) => {
      message.success(e ? `${e.entryNo} posted: ${e.lines.length} item${e.lines.length === 1 ? '' : 's'} corrected` : 'Every count matched the books; nothing to adjust');
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
    meta: FAIL_NOTICE,
  });

  // Posting asks first; the form closes once the count is posted and stays open if the question is turned down.
  const confirmAndPost = (v: FormValues) =>
    new Promise((resolve, reject) =>
      modal.confirm({
        title: `Post the count for ${counted.length} item${counted.length === 1 ? '' : 's'}?`,
        content: differing.length ? `${differing.length} differ${differing.length === 1 ? 's' : ''} from the books and will be adjusted to the counted quantity.` : 'Every count matches the books.',
        okText: 'Post',
        onOk: () => post.mutateAsync(v).then(resolve),
        onCancel: () => reject(new Error('Not posted')),
      }),
    );

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={860}
      title="Stock count"
      okText="Post count"
      okDisabled={!counted.length}
      allValues
      onSubmit={(v) => confirmAndPost(v)}
      footerExtra={
        <Button icon={<DownloadOutlined />} disabled={!rows.length} onClick={() => downloadXlsx(exportFileName(`stock-count-${project?.code ?? 'project'}`), 'count', SHEET, rows)}>
          Blank count sheet
        </Button>
      }
    >
      <Form form={form} layout="vertical">
        <FormGrid cols={fixedProject ? 2 : 3}>
          {!fixedProject && (
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Select project"
                onChange={() => form.setFieldValue('counts', {})}
                options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
              />
            </Form.Item>
          )}
          <Form.Item name="date" label="Counted on" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} allowClear={false} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input maxLength={800} placeholder="Who counted, which store" />
          </Form.Item>
        </FormGrid>
        <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
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
            { title: 'Book balance', dataIndex: 'balance', width: 150, align: 'right', render: (v, r) => <span className="mono" translate="no">{`${formatQty(v)} ${r.unit}`}</span> },
            {
              title: 'Counted',
              key: 'counted',
              width: 170,
              render: (_, r) => (
                <Form.Item name={['counts', r.itemId]} noStyle>
                  <InputNumber<string> stringMode min="0" size="small" style={{ width: '100%' }} aria-label={`Counted ${r.itemName}`} suffix={r.unit} />
                </Form.Item>
              ),
            },
            {
              title: 'Difference',
              key: 'diff',
              width: 130,
              align: 'right',
              render: (_, r) => {
                const c = counts[r.itemId];
                if (!filled(c)) return <span className="text-muted">-</span>;
                const d = Number(c) - Number(r.balance);
                return <Typography.Text type={d < 0 ? 'danger' : d > 0 ? 'success' : 'secondary'}>{d === 0 ? 'matches' : `${d > 0 ? '+' : ''}${formatQty(String(d))}`}</Typography.Text>;
              },
            },
          ]}
        />
        <Typography.Text style={{ display: 'block', marginTop: 8 }}>
          {counted.length} counted, {differing.length} differ{differing.length === 1 ? 's' : ''}
        </Typography.Text>
      </Form>
    </FormShell>
  );
}
