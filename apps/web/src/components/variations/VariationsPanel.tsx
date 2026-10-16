'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, Col, Row, Select, Statistic, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { VariationDto, VariationStatus } from '@erp/shared';
import { VARIATION_CAUSE_LABELS, VARIATION_STATUSES, VARIATION_STATUS_LABELS, canManageVariations } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useAuth } from '@/lib/auth';
import { useListState } from '@/lib/listState';
import { useVariationSummary, useVariations } from '@/lib/queries';
import { formatDate, formatINR, formatINRCompact, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { VariationDrawer, VariationStatusTag } from './VariationDrawer';
import { VariationFormModal } from './VariationFormModal';

type SortField = 'varNo' | 'createdAt' | 'claimedAmount';

/** Contract value, approved and pending variations and the revised contract value; the register below. */
export function VariationsPanel({ projectId: fixedProject, openId }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const list = useListState<SortField>({ sortBy: fixedProject ? 'varNo' : 'createdAt', sortOrder: fixedProject ? 'asc' : 'desc' });
  const [projectFilter, setProjectFilter] = useProjectScope();
  const [status, setStatus] = useState<VariationStatus | undefined>();
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [creating, setCreating] = useState(false);
  useEffect(() => setOpen(openId ?? null), [openId]);
  const projectId = fixedProject ?? projectFilter;
  const { data, isLoading, isFetching, error, refetch } = useVariations({ ...list.params, projectId, status });
  const { data: summary } = useVariationSummary(projectId);
  const manage = !!user && canManageVariations(user.roleKey);
  const sum = (k: 'approved' | 'pending' | 'contractValue' | 'revisedContractValue') => (summary ?? []).reduce((s, p) => s + toNumber(p[k]), 0);
  const extras = (summary ?? []).reduce((s, p) => s + p.unapprovedExtraItems, 0);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: SortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const columns: TableProps<VariationDto>['columns'] = [
    { title: 'No.', dataIndex: 'label', width: 70, className: 'mono', ...sort('varNo') },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectCode', width: 130, render: (v: string, r: VariationDto) => <Link href={`/projects/${r.projectId}?tab=variations`}>{v}</Link> }]),
    {
      title: 'Variation',
      width: 320,
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => setOpen(r.id)}>{r.title}</Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {VARIATION_CAUSE_LABELS[r.cause]} · {r.lines.length} item{r.lines.length === 1 ? '' : 's'}
          </div>
        </div>
      ),
    },
    { title: 'Status', dataIndex: 'status', width: 150, render: (v: VariationStatus) => <VariationStatusTag status={v} /> },
    { title: 'Claimed', dataIndex: 'claimedAmount', width: 130, align: 'right', className: 'mono', render: (v) => formatINR(v), ...sort('claimedAmount') },
    { title: 'Approved', dataIndex: 'approvedAmount', width: 130, align: 'right', className: 'mono', render: (v) => (v ? formatINR(v) : <span className="text-muted">-</span>) },
    {
      title: 'Sent / decided',
      width: 130,
      render: (_, r) => (r.decidedDate ? formatDate(r.decidedDate) : r.submittedDate ? formatDate(r.submittedDate) : <span className="text-muted">Not sent</span>),
    },
    {
      title: '',
      key: 'actions',
      fixed: 'right' as const,
      width: 80,
      render: (_, r) => (
        <Button size="small" onClick={() => setOpen(r.id)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <>
      {extras > 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ margin: fixedProject ? '0 0 12px' : 12 }}
          title={`${extras} extra item${extras === 1 ? '' : 's'} in the BOQ without a quantity`}
          description="RA bills leave out extra items until the client approves a variation that gives them a quantity and rate."
        />
      ) : null}
      <Row gutter={[12, 12]} style={{ padding: fixedProject ? '0 0 12px' : 12 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Contract value" value={formatINRCompact(sum('contractValue'))} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Approved variations" value={formatINRCompact(sum('approved'))} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Revised contract value" value={formatINRCompact(sum('revisedContractValue'))} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Claimed, not yet approved" value={formatINRCompact(sum('pending'))} />
          </Card>
        </Col>
      </Row>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={reset(setProjectFilter)}
        hideProject={!!fixedProject}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search title or item"
        extra={
          manage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              New variation
            </Button>
          ) : null
        }
      >
        <Select allowClear placeholder="All statuses" value={status} onChange={reset(setStatus)} style={{ width: 180 }} options={VARIATION_STATUSES.map((s) => ({ value: s, label: VARIATION_STATUS_LABELS[s] }))} />
      </ListToolbar>
      <Table<VariationDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<VariationDto>(data?.total)}
        scroll={{ x: fixedProject ? 1050 : 1180 }}
        locale={{ emptyText: 'No variations yet' }}
      />
      <VariationDrawer id={open} open={!!open} onClose={() => setOpen(null)} />
      <VariationFormModal open={creating} onClose={() => setCreating(false)} projectId={fixedProject} onSaved={(v) => setOpen(v.id)} />
    </>
  );
}
