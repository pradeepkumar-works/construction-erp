'use client';

import React from 'react';
import { Select, Tag } from 'antd';
import type { MixDesignStatus, RmcBatchStatus, RmcInvoiceStatus, RmcOrderStatus } from '@erp/shared';
import { MIX_DESIGN_STATUS_LABELS, RMC_BATCH_STATUS_LABELS, RMC_INVOICE_STATUS_LABELS, RMC_ORDER_STATUS_LABELS } from '@erp/shared';
import { useRmcPlants } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatINR, formatQty } from '@/lib/format';

const ORDER_COLOR: Record<RmcOrderStatus, string> = { QUOTED: 'default', CONFIRMED: 'processing', CLOSED: 'success', CANCELLED: 'default' };
const BATCH_COLOR: Record<RmcBatchStatus, string> = { DISPATCHED: 'processing', DELIVERED: 'success', REJECTED: 'error' };
const DESIGN_COLOR: Record<MixDesignStatus, string> = { DRAFT: 'warning', APPROVED: 'success', RETIRED: 'default' };

export const OrderStatusTag = ({ status }: { status: RmcOrderStatus }) => <Tag color={ORDER_COLOR[status]}>{RMC_ORDER_STATUS_LABELS[status]}</Tag>;
export const BatchStatusTag = ({ status }: { status: RmcBatchStatus }) => <Tag color={BATCH_COLOR[status]}>{RMC_BATCH_STATUS_LABELS[status]}</Tag>;
export const DesignStatusTag = ({ status }: { status: MixDesignStatus }) => <Tag color={DESIGN_COLOR[status]}>{MIX_DESIGN_STATUS_LABELS[status]}</Tag>;
export const InvoiceStatusTag = ({ status }: { status: RmcInvoiceStatus }) => <Tag color={status === 'ISSUED' ? 'blue' : 'default'}>{RMC_INVOICE_STATUS_LABELS[status]}</Tag>;

/** Cubic metres, as people say them: "6 m³", "16.5 m³". */
export const m3 = (v: string | number | null | undefined) => `${formatQty(v)} m³`;
export const M3 = ({ value }: { value: string | number | null | undefined }) => <span translate="no">{m3(value)}</span>;
export const Rupees = ({ value }: { value: string | number | null | undefined }) => (value === null || value === undefined ? null : <span translate="no">{formatINR(value, true)}</span>);

/**
 * The plant the RMC lists show: the header's project when it is a plant, else all of them. Choosing one here sets the
 * header's project, as every list's project filter does.
 */
export function usePlantScope(): [string | undefined, (id?: string) => void, { id: string; code: string; name: string }[]] {
  const [projectId, setProjectId] = useProjectScope();
  const { data: plants } = useRmcPlants();
  const list = plants ?? [];
  return [list.some((p) => p.id === projectId) ? projectId : undefined, setProjectId, list];
}

export function PlantFilter() {
  const [plantId, setPlantId, plants] = usePlantScope();
  if (plants.length < 2 && !plantId) return null;
  return (
    <Select
      aria-label="Plant"
      allowClear
      placeholder="All plants"
      value={plantId}
      onChange={(v) => setPlantId(v)}
      options={plants.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
      style={{ minWidth: 220 }}
    />
  );
}
