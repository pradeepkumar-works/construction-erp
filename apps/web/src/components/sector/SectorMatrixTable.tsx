'use client';

import React from 'react';
import { Table, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import type { SectorCell, SectorMatrix } from '@erp/shared';
import { BRAND } from '@/lib/brand';
import { formatDate, formatQty } from '@/lib/format';

type Row = { key: string; label: string; none?: boolean };

/** Floors (top floor first) or villages down the side, activities across; each cell the approved quantity there. */
export function SectorMatrixTable({ matrix }: { matrix: SectorMatrix }) {
  const cell = new Map<string, SectorCell>(matrix.cells.map((c) => [`${c.row}|${c.activityId}`, c]));
  const unassigned = new Map(matrix.unassigned.map((u) => [u.activityId, u.approvedQty]));
  const ordered = matrix.rowLabel === 'Floor' ? [...matrix.rows].reverse() : matrix.rows;
  const rows: Row[] = [...ordered.map((r) => ({ key: r, label: r })), ...(matrix.unassigned.length ? [{ key: '__none', label: `No ${matrix.rowLabel.toLowerCase()} given`, none: true }] : [])];

  const columns: TableProps<Row>['columns'] = [
    { title: matrix.rowLabel, dataIndex: 'label', fixed: 'left', width: 150, render: (v: string, r) => (r.none ? <span className="text-muted">{v}</span> : <strong>{v}</strong>) },
    ...matrix.activities.map((a) => ({
      key: a.id,
      title: (
        <Tooltip title={`${formatQty(a.executedQty)} of ${formatQty(a.plannedQty)} ${a.unit} done in all`}>
          <span>
            {a.name}
            <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>
              {a.unit}
            </div>
          </span>
        </Tooltip>
      ),
      width: 120,
      align: 'right' as const,
      onCell: (r: Row) => {
        const c = cell.get(`${r.key}|${a.id}`);
        return { style: { background: c && Number(c.approvedQty) > 0 ? `${BRAND.colors.success}22` : c && Number(c.pendingQty) > 0 ? `${BRAND.colors.pending}1F` : undefined } };
      },
      render: (_: unknown, r: Row) => {
        if (r.none) {
          const q = unassigned.get(a.id);
          return q ? <span className="text-muted">{formatQty(q)}</span> : null;
        }
        const c = cell.get(`${r.key}|${a.id}`);
        if (!c) return null;
        return (
          <Tooltip title={c.lastDate ? `Last entry ${formatDate(c.lastDate)}` : undefined}>
            <div>
              {Number(c.approvedQty) ? <div style={{ fontWeight: 600, color: BRAND.colors.success }}>{formatQty(c.approvedQty)}</div> : null}
              {Number(c.pendingQty) ? <div style={{ fontSize: 12, color: BRAND.colors.pending }}>+{formatQty(c.pendingQty)} waiting</div> : null}
            </div>
          </Tooltip>
        );
      },
    })),
  ];

  return <Table<Row> className="sector-matrix" size="small" bordered rowKey="key" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 150 + matrix.activities.length * 120 }} />;
}
