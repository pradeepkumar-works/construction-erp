'use client';

import React, { useState } from 'react';
import { Button, Flex, Table, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { tk } from '@/ds';
import { canMeasure, type ToMeasureItemDto, type WorkOrderProgressLineDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useWorkOrderProgress } from '@/lib/queries';
import { formatDate, formatQty, toNumber } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { QueryError } from '@/components/common/QueryState';
import { MeasurementFormModal, type MeasurementPrefill } from '@/components/measurements/MeasurementFormModal';
import { MeasureFromProgressModal, progressPrefill } from '@/components/measurements/MeasureFromProgressModal';

interface OrderRef {
  id: string;
  woNo: string;
  projectId: string;
}

/**
 * Measure a work order from its daily reports: the days the site reported under the order that none of its sheets
 * holds, started as a sheet tagged to the order. `modals` is drawn outside any form of the caller's, since a sheet is a
 * form of its own.
 */
export function useMeasureOrder() {
  const qc = useQueryClient();
  const [order, setOrder] = useState<OrderRef | null>(null);
  const [started, setStarted] = useState<{ order: OrderRef; boqItemId: string; prefill: MeasurementPrefill } | null>(null);
  const start = (item: ToMeasureItemDto) => order && setStarted({ order, boqItemId: item.boqItemId, prefill: progressPrefill(item) });
  const modals = (
    <>
      {order ? <MeasureFromProgressModal open onClose={() => setOrder(null)} projectId={order.projectId} workOrder={order} onStart={start} /> : null}
      <MeasurementFormModal
        open={!!started}
        onClose={() => setStarted(null)}
        projectId={started?.order.projectId}
        boqItemId={started?.boqItemId}
        prefill={started?.prefill}
        onSaved={() => qc.invalidateQueries({ queryKey: ['work-orders'] })}
      />
    </>
  );
  return { measure: setOrder, modals };
}

const qtyCell = (v: string, l: WorkOrderProgressLineDto) => (
  <span className="mono" translate="no">
    {formatQty(v)} {l.unit}
  </span>
);

/**
 * A work order against the daily reports (ARCHITECTURE "Subcontracts", From the DPR to the bill): per BOQ line, what
 * approved DPR lines report under the order, what its sheets hold, what its bills took, and what is reported and still
 * to measure. The bill pays only the measured quantity, so what is left to measure is offered as a sheet.
 */
export function OrderSiteProgress({ workOrderId, upTo, onMeasure }: { workOrderId: string; upTo?: string; onMeasure?: (order: OrderRef) => void }) {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useWorkOrderProgress(workOrderId, upTo);
  if (error) return <QueryError error={error} onRetry={() => refetch()} />;
  const lines = data?.lines ?? [];
  const waiting = lines.filter((l) => toNumber(l.toMeasureQty) > 0);
  const mayMeasure = !!user && canMeasure(user.roleKey) && !!onMeasure;
  return (
    <>
      <Table<WorkOrderProgressLineDto>
        rowKey="workOrderLineId"
        size="small"
        pagination={false}
        loading={isLoading}
        dataSource={lines}
        scroll={{ x: 640 }}
        locale={{ emptyText: 'This order has no BOQ items; its own items are entered on the bill' }}
        columns={[
          {
            title: 'Item',
            render: (_, l) => (
              <div>
                <AppTag variant="kind" style={{ marginInlineEnd: tk.space[2] }}>
                  {l.itemNo}
                </AppTag>
                {l.description}
                {l.lastReportedOn || l.otherUnitActivities.length ? (
                  <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
                    {l.lastReportedOn ? `${l.days} approved ${l.days === 1 ? 'day' : 'days'}, last on ${formatDate(l.lastReportedOn)}` : ''}
                    {l.otherUnitActivities.length ? `${l.lastReportedOn ? ' · ' : ''}${l.otherUnitActivities.join(', ')} reported in another unit, not counted` : ''}
                  </div>
                ) : null}
              </div>
            ),
          },
          { title: 'On daily reports', dataIndex: 'reportedQty', width: 140, align: 'right', render: qtyCell },
          { title: 'Measured', dataIndex: 'measuredQty', width: 120, align: 'right', render: qtyCell },
          { title: 'Billed', dataIndex: 'billedQty', width: 120, align: 'right', render: qtyCell },
          {
            title: 'To measure',
            dataIndex: 'toMeasureQty',
            width: 130,
            align: 'right',
            render: (v: string, l) => (toNumber(v) > 0 ? <strong>{qtyCell(v, l)}</strong> : qtyCell(v, l)),
          },
        ]}
      />
      {data && lines.length > 0 ? (
        <Flex align="center" justify="space-between" gap={tk.space[3]} wrap style={{ marginTop: tk.space[2] }}>
          <Typography.Text type="secondary">
            {!data.reported
              ? `No approved daily report names ${data.woNo} yet. Choose the work order on the DPR's work lines and its days show here.`
              : waiting.length
                ? `${waiting.length === 1 ? 'One item has' : `${waiting.length} items have`} work on the daily reports that is not measured yet, so the bill does not take it.`
                : 'Everything the daily reports show under this order is measured.'}
          </Typography.Text>
          {mayMeasure && waiting.length ? <Button onClick={() => onMeasure!({ id: data.workOrderId, woNo: data.woNo, projectId: data.projectId })}>Measure from daily reports</Button> : null}
        </Flex>
      ) : null}
    </>
  );
}
