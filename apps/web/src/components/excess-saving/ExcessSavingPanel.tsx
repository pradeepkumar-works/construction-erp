'use client';

import React from 'react';
import { App, Button, Col, InputNumber, Row, Statistic, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExcessSavingDto, ExcessSavingRowDto } from '@erp/shared';
import { unitLabel } from '@erp/shared';
import { tk } from '@/ds';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useExcessSaving } from '@/lib/queries';
import { formatINR, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { Money } from '@/components/common/Money';
import { PrinterOutlined } from '@/components/common/icons';
import { Loading, QueryError } from '@/components/common/QueryState';
import { Section } from '@/components/common/Section';
import { usePrintPaper } from '@/components/print/usePrintPaper';
import { useIsPhone } from '@/lib/screen';
import { openExcessSavingPrint } from './excessSavingPrint';

const RED = tk.color.tone.danger.fg;
const GREEN = tk.color.tone.success.fg;
const qty = (v: string) => (toNumber(v) ? <span className="mono" translate="no">{formatQty(v)}</span> : <span className="text-muted">{NO_VALUE}</span>);
const amount = (v: string) => (toNumber(v) ? <Money value={v} /> : <span className="text-muted">{NO_VALUE}</span>);

/** What the quantity surveyor expects an item to end at: typed in place, saved on leaving the box. */
function AnticipatedCell({ row, editable }: { row: ExcessSavingRowDto; editable: boolean }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const save = useMutation({
    mutationFn: async (v: number | null) => (await api.patch<ExcessSavingDto>(`/boq-items/${row.boqItemId}/anticipated`, { anticipatedQty: v === null ? null : String(v) })).data,
    onSuccess: (d) => {
      qc.setQueryData(['excess-saving', d.projectId], d);
      message.success(`Item ${row.itemNo} saved`);
    },
    meta: FAIL_NOTICE,
  });
  if (!editable) return qty(row.anticipatedQty);
  return (
    <div>
      <InputNumber<number>
        key={row.anticipatedQty}
        size="small"
        min={0}
        defaultValue={toNumber(row.anticipatedQty)}
        disabled={save.isPending}
        aria-label={`Item ${row.itemNo} expected to end at`}
        style={{ width: '100%' }}
        onBlur={(e) => {
          const v = e.target.value === '' ? null : Number(e.target.value.replace(/,/g, ''));
          if (v === null || Number.isNaN(v) || v === toNumber(row.anticipatedQty)) return;
          save.mutate(v);
        }}
        onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
      />
      {row.anticipatedSet ? (
        <Button size="small" type="link" style={{ padding: 0 }} onClick={() => save.mutate(null)} aria-label={`Item ${row.itemNo}: go back to the measured or sanctioned quantity`}>
          Use the default
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A project's excess and saving statement (ARCHITECTURE "Excess and saving statement"): each BOQ item's agreement
 * quantity against what it is expected to end at, the excess and saving at the bill rate, and the net.
 */
export function ExcessSavingPanel({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useExcessSaving(projectId);
  const print = usePrintPaper();
  const phone = useIsPhone();
  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  const t = data.totals;
  const net = toNumber(t.net);

  const columns: TableProps<ExcessSavingRowDto>['columns'] = [
    {
      title: 'Item',
      key: 'item',
      width: 260,
      fixed: phone ? undefined : 'left',
      render: (_, r) => (
        <div style={{ paddingInlineStart: r.kind === 'EXCESS' ? tk.space[4] : 0 }}>
          <span className="mono" translate="no">
            {r.itemNo}
          </span>{' '}
          {r.description}
          <div>
            {r.kind === 'EXCESS' ? <AppTag variant="kind">Beyond the limit</AppTag> : r.kind === 'EXTRA' ? <AppTag variant="kind">Extra item</AppTag> : null}
            {r.pastLimitQty ? (
              <AppTag meaning="failed">
                {formatQty(r.pastLimitQty)} {unitLabel(r.unit)} past the {data.tolerancePct}% limit
              </AppTag>
            ) : null}
          </div>
        </div>
      ),
    },
    { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 100, align: 'right', render: (v: string) => <Money value={v} paise /> },
    {
      title: 'Agreement',
      key: 'agreement',
      width: 140,
      align: 'right',
      render: (_, r) => (
        <div>
          {qty(r.agreementQty)} {toNumber(r.agreementQty) ? <span className="text-muted">{unitLabel(r.unit)}</span> : null}
          <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
            {toNumber(r.agreementAmount) ? formatINR(r.agreementAmount) : null}
          </div>
        </div>
      ),
    },
    { title: 'Measured', dataIndex: 'measuredQty', key: 'measured', width: 100, align: 'right', render: (v: string) => qty(v) },
    {
      title: 'Expected to end at',
      key: 'anticipated',
      width: 140,
      render: (_, r) => <AnticipatedCell row={r} editable={data.canEdit} />,
    },
    {
      title: 'Excess',
      key: 'excess',
      width: 130,
      align: 'right',
      render: (_, r) => (
        <div>
          {qty(r.excessQty)}
          <div style={{ fontSize: tk.type.caption.fontSize }}>{amount(r.excessAmount)}</div>
        </div>
      ),
    },
    {
      title: 'Saving',
      key: 'saving',
      width: 130,
      align: 'right',
      render: (_, r) => (
        <div>
          {qty(r.savingQty)}
          <div style={{ fontSize: tk.type.caption.fontSize }}>{amount(r.savingAmount)}</div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: tk.space[3], flexWrap: 'wrap', alignItems: 'center', marginBottom: tk.space[3] }}>
        <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
          Deviation limit {data.tolerancePct}% over the sanctioned quantity
        </Typography.Text>
        <Button icon={<PrinterOutlined />} onClick={() => print((l) => openExcessSavingPrint(data, l))} style={{ marginLeft: 'auto' }}>
          Print
        </Button>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} lg={5}>
          <Statistic title="As per agreement" value={formatINR(t.agreement)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
        </Col>
        <Col xs={12} md={8} lg={5}>
          <Statistic title="Expected to end at" value={formatINR(t.anticipated)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
        </Col>
        <Col xs={12} md={8} lg={5}>
          <Statistic title="Excess" value={formatINR(t.excess)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Statistic title="Saving" value={formatINR(t.saving)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
        </Col>
        <Col xs={24} md={8} lg={5}>
          <Statistic
            title={net < 0 ? 'Net saving' : 'Net excess'}
            value={formatINR(Math.abs(net))}
            styles={{ content: { fontSize: tk.type.subhead.fontSize, color: net > 0 ? RED : net < 0 ? GREEN : undefined } }}
          />
          {t.netPct !== null ? (
            <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
              {Math.abs(t.netPct)}% of the agreement
            </div>
          ) : null}
        </Col>
      </Row>
      <Section
        style={{ marginTop: tk.space[4] }}
        title="By item"
        help={
          <>
            Expected to end at starts at the larger of what is measured and what is sanctioned (the agreement with approved variations), so an item
            still in progress shows no saving until you type what it will end at. Quantity past the deviation limit is paid at a revised rate: record
            a variation line at a revised rate on the item, and its approval adds the excess item under it.
          </>
        }
      >
        <Table<ExcessSavingRowDto>
          rowKey="boqItemId"
          size="small"
          pagination={false}
          dataSource={data.rows}
          columns={columns}
          scroll={{ x: 1000 }}
          locale={{ emptyText: 'No BOQ items yet' }}
        />
      </Section>
    </div>
  );
}
