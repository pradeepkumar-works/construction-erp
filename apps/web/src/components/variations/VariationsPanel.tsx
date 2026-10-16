'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, Col, Row, Select, Statistic, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { VariationDto, VariationStatus } from '@erp/shared';
import { VARIATION_CAUSE_LABELS, VARIATION_STATUSES, VARIATION_STATUS_LABELS, canManageVariations } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useVariationSummary, useVariations } from '@/lib/queries';
import { formatDate, formatINR, formatINRCompact, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { VariationDrawer, VariationStatusTag } from './VariationDrawer';
import { VariationFormModal } from './VariationFormModal';

type SortField = 'varNo' | 'createdAt' | 'claimedAmount';
const KEYS = ['status'] as const;
const SORT_FIELDS: SortField[] = ['varNo', 'createdAt', 'claimedAmount'];

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** Contract value, approved and pending variations and the revised contract value; the register below. */
export function VariationsPanel({ projectId: fixedProject, openId }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [creating, setCreating] = useState(false);
  useEffect(() => setOpen(openId ?? null), [openId]);
  const frame = useListFrame<SortField, VariationDto>({
    list: 'variations',
    keys: KEYS,
    sortBy: fixedProject ? 'varNo' : 'createdAt',
    sortOrder: fixedProject ? 'asc' : 'desc',
    sortFields: SORT_FIELDS,
    fixedProject,
    statusLabels: VARIATION_STATUS_LABELS,
    moreViews: [
      { key: 'draft', label: 'Not sent', filters: { status: 'DRAFT' } },
      { key: 'submitted', label: 'With the client', filters: { status: 'SUBMITTED' } },
      { key: 'approved', label: 'Approved', filters: { status: 'APPROVED' } },
    ],
    columns: (sortOrderFor): ListColumn<VariationDto>[] => {
      const sort = (key: SortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'No.', dataIndex: 'label', width: 70, className: 'mono', ...sort('varNo') },
        ...(fixedProject
          ? []
          : [{ key: 'projectCode', title: 'Project', dataIndex: 'projectCode', width: 130, render: (v: string, r: VariationDto) => <Link href={`/projects/${r.projectId}?tab=variations`}>{v}</Link> } satisfies ListColumn<VariationDto>]),
        {
          title: 'Variation',
          key: 'title',
          locked: true,
          width: 320,
          render: (_, r) => (
            <div>
              <RecordLink onOpen={() => setOpen(r.id)}>{r.title}</RecordLink>
              <Sub>
                {VARIATION_CAUSE_LABELS[r.cause]} · {r.lines.length} item{r.lines.length === 1 ? '' : 's'}
              </Sub>
            </div>
          ),
        },
        { key: 'status', title: 'Status', dataIndex: 'status', width: 150, render: (v: VariationStatus) => <VariationStatusTag status={v} /> },
        { title: 'Claimed', dataIndex: 'claimedAmount', width: 130, align: 'right', className: 'mono', render: (v) => formatINR(v), ...sort('claimedAmount'), total: (rows) => formatINR(rows.reduce((n, r) => n + toNumber(r.claimedAmount), 0)) },
        {
          key: 'approvedAmount',
          title: 'Approved',
          dataIndex: 'approvedAmount',
          width: 130,
          align: 'right',
          className: 'mono',
          render: (v) => (v ? formatINR(v) : <Sub>-</Sub>),
          total: (rows) => formatINR(rows.reduce((n, r) => n + toNumber(r.approvedAmount), 0)),
        },
        {
          key: 'decided',
          title: 'Sent / decided',
          label: 'Sent or decided',
          width: 130,
          render: (_, r) => (r.decidedDate ? formatDate(r.decidedDate) : r.submittedDate ? formatDate(r.submittedDate) : <Sub>Not sent</Sub>),
        },
        { title: 'Created', width: 110, defaultHidden: true, ...sort('createdAt'), render: (_, r) => formatDate(r.createdAt) },
      ];
    },
  });
  const { page } = frame;
  const status = page.filters.status as VariationStatus | undefined;
  const projectId = frame.projectId;
  const { data, isLoading, isFetching, error, refetch } = useVariations({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId, status });
  const { data: summary } = useVariationSummary(projectId);
  const manage = !!user && canManageVariations(user.roleKey);
  const sum = (k: 'approved' | 'pending' | 'contractValue' | 'revisedContractValue') => (summary ?? []).reduce((acc, p) => acc + toNumber(p[k]), 0);
  const extras = (summary ?? []).reduce((acc, p) => acc + p.unapprovedExtraItems, 0);

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
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search title or item"
        extra={
          manage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              New variation
            </Button>
          ) : null
        }
      >
        <Select<VariationStatus> allowClear placeholder="All statuses" aria-label="Status" value={status} onChange={(v) => page.setFilter('status', v)} style={{ width: 180 }} options={VARIATION_STATUSES.map((v) => ({ value: v, label: VARIATION_STATUS_LABELS[v] }))} />
      </ListToolbar>
      <DataTable<VariationDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<VariationDto>(data?.total)}
        onOpen={setOpen}
        chips={frame.chips}
        scrollX={fixedProject ? 1000 : 1130}
        emptyText={<EmptyArt art="entries" title={status || page.params.q ? 'No variation matches these filters' : 'No variations yet'} />}
      />
      <VariationDrawer id={open} open={!!open} onClose={() => setOpen(null)} />
      <VariationFormModal open={creating} onClose={() => setCreating(false)} projectId={fixedProject} onSaved={(v) => setOpen(v.id)} />
    </>
  );
}
