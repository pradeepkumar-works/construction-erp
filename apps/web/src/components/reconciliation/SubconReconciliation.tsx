'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Button, Empty, Form, Input, Skeleton, Table, Tooltip, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import { DeleteOutlined } from '@/components/common/icons';
import type { ExcessRecoveryDto, ReconciliationStatus, SubconMaterialDto, SubconMaterialLineDto, SubconReconciliationDto } from '@erp/shared';
import { SUBMISSION_STATUS_LABELS } from '@erp/shared';
import { useCancelRecovery, useRecoverExcess, useSubconReconciliation } from '@/lib/queries';
import { formatDate, formatINR, formatQty, toNumber } from '@/lib/format';
import { themeColor, themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { Section, SectionStack } from '@/components/common/Section';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { StatusCell, qty } from './ReconciliationPanel';

const RED = themeColor('colorErrorText');

/**
 * Material issued to each subcontractor against what their approved measured work should have taken,
 * since the start of the work order. What they used beyond the allowance can be raised for recovery on their next bill.
 */
export function SubconReconciliation({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useSubconReconciliation(projectId);
  const [recovering, setRecovering] = useState<{ wo: SubconReconciliationDto; item: SubconMaterialDto } | null>(null);

  if (error) return <QueryError error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <Skeleton active />;
  return (
    <SectionStack>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Each work order&apos;s approved measurements × the norms (with their wastage) against the material issued to it, since the order began. Issued material is already charged
        on their bills at the issue rate; what was used beyond the allowance can be recovered again as a penalty on their next bill.
      </Typography.Paragraph>
      {!data.workOrders.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No subcontractor has measured work with norms, or material issued to their work order, yet. Issue material against the work order to see it here."
        />
      ) : null}
      {data.workOrders.map((wo) => (
        <WorkOrderBlock key={wo.workOrderId} wo={wo} projectId={projectId} canRecover={data.canRecover} values={data.canSeeValues} onRecover={(item) => setRecovering({ wo, item })} />
      ))}
      <RecoverModal projectId={projectId} target={recovering} onClose={() => setRecovering(null)} />
    </SectionStack>
  );
}

function WorkOrderBlock({
  wo,
  projectId,
  canRecover,
  values,
  onRecover,
}: {
  wo: SubconReconciliationDto;
  projectId: string;
  canRecover: boolean;
  values: boolean;
  onRecover: (item: SubconMaterialDto) => void;
}) {
  const cancel = useCancelRecovery();
  const columns: TableProps<SubconMaterialDto>['columns'] = [
    { title: 'Material', dataIndex: 'itemName', fixed: 'left', width: 170 },
    { title: 'Theoretical', dataIndex: 'theoreticalQty', width: 110, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    { title: 'Allowed', dataIndex: 'allowedQty', width: 110, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    { title: 'Issued', dataIndex: 'issuedQty', width: 110, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    {
      title: 'Variance',
      key: 'variance',
      width: 120,
      align: 'right',
      render: (_, r) => (
        <span className="mono" translate="no" style={{ color: r.status === 'OVER' ? RED : undefined }}>
          {toNumber(r.varianceQty) > 0 ? '+' : ''}
          {formatQty(r.varianceQty)}
          {r.variancePct !== null ? ` (${r.variancePct > 0 ? '+' : ''}${r.variancePct}%)` : ''}
        </span>
      ),
    },
    { title: 'Status', dataIndex: 'status', width: 130, render: (s: ReconciliationStatus) => <StatusCell status={s} /> },
    {
      title: 'Over the allowance',
      key: 'excess',
      width: 140,
      align: 'right',
      render: (_, r) =>
        toNumber(r.excessQty) > 0 ? (
          <>
            {qty(r.excessQty, r.unit)}
            {values && r.excessValue ? (
              <div className="mono" translate="no" style={{ fontSize: themeFontSize('fontSizeSM'), color: RED }}>
                {formatINR(r.excessValue)}
              </div>
            ) : null}
            {toNumber(r.recoveredQty) > 0 ? (
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {formatQty(r.recoveredQty)} raised
              </div>
            ) : null}
          </>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    ...(canRecover
      ? [
          {
            title: '',
            key: 'recover',
            width: 160,
            render: (_: unknown, r: SubconMaterialDto) =>
              toNumber(r.toRecoverQty) > 0 && !wo.closed ? (
                <Button size="small" onClick={() => onRecover(r)}>
                  Recover on next bill
                </Button>
              ) : null,
          },
        ]
      : []),
  ];
  const lineColumns = (unit: string): TableProps<SubconMaterialLineDto>['columns'] => [
    { title: 'BOQ item', dataIndex: 'boqItemNo', width: 80, className: 'mono' },
    { title: 'Description', dataIndex: 'description', ellipsis: { showTitle: false }, render: (v: string) => <Tooltip title={v}>{v}</Tooltip> },
    { title: 'Measured', dataIndex: 'measuredQty', width: 130, align: 'right', render: (v: string, l) => qty(v, l.unit) },
    { title: 'Norm', dataIndex: 'qtyPerUnit', width: 170, align: 'right', render: (v: string, l) => <span className="mono" translate="no">{`${v} ${unit} / ${l.unit}`}</span> },
    { title: 'Wastage', dataIndex: 'wastagePct', width: 90, align: 'right', render: (v: string) => <span className="mono">{`${v}%`}</span> },
    { title: 'Theoretical', dataIndex: 'theoreticalQty', width: 130, align: 'right', render: (v: string) => qty(v, unit) },
  ];
  const recoveryColumns: TableProps<ExcessRecoveryDto>['columns'] = [
    { title: 'Raised', dataIndex: 'createdAt', width: 110, render: (v: string) => formatDate(v.slice(0, 10)) },
    { title: 'Material', dataIndex: 'itemName', render: (v: string, r) => (r.note ? <Tooltip title={r.note}>{v}</Tooltip> : v) },
    { title: 'Quantity', dataIndex: 'quantity', width: 130, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v: string) => <span className="mono">{formatINR(v, true)}</span> },
    { title: 'Amount', dataIndex: 'amount', width: 120, align: 'right', render: (v: string) => <strong className="mono">{formatINR(v, true)}</strong> },
    {
      title: 'On bill',
      key: 'bill',
      width: 220,
      render: (_, r) =>
        r.billId ? (
          <>
            <Link href={`/subcontract-bills/${r.billId}`} className="mono" translate="no">
              {r.billLabel}
            </Link>{' '}
            {r.billStatus ? <AppTag style={{ marginLeft: 4 }}>{SUBMISSION_STATUS_LABELS[r.billStatus as keyof typeof SUBMISSION_STATUS_LABELS] ?? r.billStatus}</AppTag> : null}
          </>
        ) : (
          <span className="text-muted">Their next bill</span>
        ),
    },
    ...(canRecover
      ? [
          {
            title: '',
            key: 'cancel',
            width: 52,
            render: (_: unknown, r: ExcessRecoveryDto) =>
              r.canCancel ? (
                <ConfirmDelete verb="Remove" what={`the recovery of ${r.itemName}`} description={r.billLabel ? `It comes off ${r.billLabel}.` : undefined} onConfirm={() => cancel.mutateAsync({ projectId, id: r.id })}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove the recovery of ${r.itemName}`} />
                </ConfirmDelete>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <Section
      title={
        <span>
          <Link href={`/work-orders/${wo.workOrderId}`} className="mono" translate="no">
            {wo.woNo}
          </Link>{' '}
          <span translate="no">{wo.vendorName}</span>
        </span>
      }
      extra={
        <span className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
          {wo.title}
          {wo.closed ? ' · closed' : ''}
          {wo.openBill ? (
            <>
              {' · being prepared: '}
              <Link href={`/subcontract-bills/${wo.openBill.id}`} className="mono" translate="no">
                {wo.openBill.label}
              </Link>
            </>
          ) : null}
        </span>
      }
    >
      <Table<SubconMaterialDto>
        rowKey="itemId"
        size="small"
        pagination={false}
        dataSource={wo.items}
        columns={columns}
        scroll={{ x: canRecover ? 1060 : 900 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing measured or issued yet" /> }}
        expandable={{
          expandedRowRender: (r) => <Table<SubconMaterialLineDto> rowKey="boqItemNo" size="small" pagination={false} dataSource={r.lines} columns={lineColumns(r.unit)} scroll={{ x: 760 }} />,
          rowExpandable: (r) => r.lines.length > 0,
        }}
      />
      {wo.recoveries.length ? (
        <>
          <Typography.Text strong style={{ display: 'block', marginTop: 12, marginBottom: 4 }}>
            Raised for recovery
          </Typography.Text>
          <Table<ExcessRecoveryDto> rowKey="id" size="small" pagination={false} dataSource={wo.recoveries} columns={recoveryColumns} scroll={{ x: 820 }} />
        </>
      ) : null}
    </Section>
  );
}

interface RecoverValues {
  quantity?: number;
  rate?: number;
  note?: string;
}

/** Raise the excess for recovery: the quantity left over the allowance, at the item rate, both editable. */
function RecoverModal({ projectId, target, onClose }: { projectId: string; target: { wo: SubconReconciliationDto; item: SubconMaterialDto } | null; onClose: () => void }) {
  const [form] = Form.useForm<RecoverValues>();
  const { message } = App.useApp();
  const recover = useRecoverExcess();
  const q = Form.useWatch('quantity', form);
  const r = Form.useWatch('rate', form);
  const most = target ? toNumber(target.item.toRecoverQty) : 0;

  useEffect(() => {
    if (!target) return;
    form.resetFields();
    form.setFieldsValue({ quantity: most, rate: target.item.rate ? toNumber(target.item.rate) : undefined });
  }, [target, most, form]);

  return (
    <FormShell
      open={!!target}
      onClose={onClose}
      form={form}
      layout="modal"
      width={560}
      projectDefault={false}
      title={target ? `Recover ${target.item.itemName} from ${target.wo.vendorName}` : 'Recover material'}
      okText="Raise the recovery"
      footerExtra={
        q && r ? (
          <span className="mono" translate="no">
            {formatINR(q * r)}
          </span>
        ) : null
      }
      onSubmit={async (v) => {
        const res = await recover.mutateAsync({ projectId, workOrderId: target!.wo.workOrderId, itemId: target!.item.itemId, quantity: String(v.quantity), rate: String(v.rate), note: v.note?.trim() || undefined });
        message.success(res.billLabel ? `${formatINR(res.recovery.amount)} added to ${res.billLabel}` : `${formatINR(res.recovery.amount)} will come off ${target!.wo.vendorName}'s next bill`);
      }}
    >
      {target ? (
        <Form form={form} layout="vertical">
          <Typography.Paragraph type="secondary">
            {target.wo.woNo}: {formatQty(target.item.issuedQty)} {target.item.unit} issued against {formatQty(target.item.allowedQty)} {target.item.unit} allowed for the
            measured work. The issue rate is already on their bills; this is taken off their {target.wo.openBill ? `bill being prepared (${target.wo.openBill.label})` : 'next bill'} as
            a penalty, as in CPWD clause 42. Change the rate if your contract says otherwise.
          </Typography.Paragraph>
          <FormGrid>
            <Form.Item
              name="quantity"
              label="Quantity"
              rules={[
                { required: true, message: 'Enter the quantity to recover' },
                { type: 'number', min: 0.001, max: most, message: `Enter up to ${formatQty(String(most))} ${target.item.unit}` },
              ]}
            >
              <QuantityInput unit={target.item.unit} />
            </Form.Item>
            <Form.Item name="rate" label={`Rate per ${target.item.unit}`} rules={[{ required: true, message: 'Enter the rate' }, { type: 'number', min: 0.01, message: 'Enter a rate above zero' }]}>
              <MoneyInput />
            </Form.Item>
          </FormGrid>
          <Form.Item name="note" label="Note">
            <Input maxLength={500} placeholder="e.g. As per clause 42 of the work order" />
          </Form.Item>
        </Form>
      ) : null}
    </FormShell>
  );
}
