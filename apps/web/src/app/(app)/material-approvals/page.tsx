'use client';

import React, { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Row, Select, Statistic, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { AppTabs } from '@/components/common/AppTabs';
import { DeleteOutlined, PlusOutlined } from '@/components/common/icons';
import {
  APPROVED_MAKE_SOURCE_LABELS,
  MATERIAL_APPROVAL_KIND_LABELS,
  canManageApprovedMakes,
  canRaiseMaterialApprovals,
  revisionLabel,
  type ApprovedMakeDto,
  type MaterialApprovalDto,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useApprovedMakes, useMaterialApprovalAction, useMaterialApprovals } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
import { useNewIntent } from '@/lib/new-intent';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate, NO_VALUE } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { RecordLink } from '@/components/record/RecordLink';
import { ApprovedMakeForm, MaterialApprovalForm, MaterialApprovalStatusTag } from '@/components/material-approvals/MaterialApprovalForms';

const KEYS = ['view', 'status', 'kind'] as const;
const STATUS = [
  { value: 'open', label: 'Open requests' },
  { value: 'review', label: 'With the reviewer' },
  { value: 'decided', label: 'Decided or withdrawn' },
  { value: 'all', label: 'All requests' },
];
const KINDS = [
  { value: 'all', label: 'Makes and samples' },
  { value: 'MATERIAL', label: 'Makes' },
  { value: 'SAMPLE', label: 'Samples' },
];

/**
 * Material approvals (v6 item 113): requests to the client's engineer or the consultant to approve a make or a sample,
 * each submission a revision with its outcome, and each project's list of approved makes (from the contract, or
 * approved on request), which purchase orders are checked against.
 */
function MaterialApprovalsPage() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const router = useRouter();
  const canRaise = !!user && canRaiseMaterialApprovals(user.roleKey);
  const canManage = !!user && canManageApprovedMakes(user.roleKey);
  const [adding, setAdding] = useState(false);
  const [addingMake, setAddingMake] = useState(false);
  useNewIntent('material-approval', canRaise, () => setAdding(true));
  const [projectId] = useProjectScope();
  const page = useListPage<'createdAt'>({ keys: KEYS, sortBy: 'createdAt', sortOrder: 'desc', scope: projectId });
  const view = page.filters.view === 'makes' ? 'makes' : 'requests';
  const status = (page.filters.status as string | undefined) ?? 'open';
  const kind = (page.filters.kind as string | undefined) ?? 'all';
  const requests = useMaterialApprovals({ status, kind: kind === 'all' ? undefined : kind, projectId, q: page.params.q }, view === 'requests');
  const makes = useApprovedMakes({ projectId, q: page.params.q }, view === 'makes');
  const act = useMaterialApprovalAction<{ ok: boolean }>();
  const [askDelete, deleteDialog] = useConfirmDelete();
  const q = view === 'requests' ? requests : makes;
  const open = (id: string) => router.push(`/material-approvals/${id}`);
  const sub = (text: React.ReactNode) => (
    <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
      {text}
    </Typography.Text>
  );

  const requestColumns: ListColumn<MaterialApprovalDto>[] = [
    {
      key: 'material',
      title: 'Material and make',
      locked: true,
      width: 300,
      card: 'title',
      cardText: (r) => `${r.material}: ${r.make}`,
      render: (_, r) => (
        <div>
          <RecordLink href={`/material-approvals/${r.id}`} onOpen={() => open(r.id)} strong>
            {r.material}
          </RecordLink>
          {sub(<span translate="no">{[r.make, r.model].filter(Boolean).join(', ')}</span>)}
        </div>
      ),
    },
    {
      key: 'marNo',
      title: 'Request',
      width: 150,
      card: 'meta',
      cardText: (r) => `${r.marNo}${r.status === 'DRAFT' ? '' : ` ${revisionLabel(r.revision)}`} · ${r.projectCode}`,
      render: (_, r) => (
        <div translate="no">
          {`${r.marNo} ${r.status === 'DRAFT' ? '' : revisionLabel(r.revision)}`.trim()}
          {sub(MATERIAL_APPROVAL_KIND_LABELS[r.kind])}
        </div>
      ),
    },
    {
      key: 'project',
      title: 'Project',
      width: 170,
      card: false,
      render: (_, r) => (
        <div translate="no">
          {r.projectCode}
          {sub(r.boqItemNo ? `BOQ ${r.boqItemNo}` : r.projectName)}
        </div>
      ),
    },
    { key: 'to', title: 'With', width: 200, card: false, render: (_, r) => <span translate="no">{r.toParty}</span> },
    {
      key: 'submitted',
      title: 'Submitted',
      width: 140,
      card: 'date',
      cardText: (r) => (r.submittedOn ? formatDate(r.submittedOn) : 'Not yet'),
      render: (_, r) =>
        r.submittedOn ? (
          <div translate="no">
            {formatDate(r.submittedOn)}
            {r.daysOutstanding !== null ? sub(`${r.daysOutstanding} day${r.daysOutstanding === 1 ? '' : 's'} waiting`) : null}
          </div>
        ) : (
          <Typography.Text type="secondary">Not yet</Typography.Text>
        ),
    },
    {
      key: 'status',
      title: 'Status',
      width: 170,
      card: 'status',
      render: (_, r) => (
        <div>
          <MaterialApprovalStatusTag status={r.status} overdue={r.overdue} />
          {r.status === 'UNDER_REVIEW' && r.replyBy ? sub(<span translate="no">{`Reply by ${formatDate(r.replyBy)}`}</span>) : null}
        </div>
      ),
    },
  ];
  const makeColumns: ListColumn<ApprovedMakeDto>[] = [
    {
      key: 'material',
      title: 'Material',
      locked: true,
      width: 240,
      card: 'title',
      cardText: (m) => `${m.material}: ${m.make}`,
      render: (_, m) => m.material,
    },
    {
      key: 'make',
      title: 'Make',
      width: 200,
      card: 'meta',
      cardText: (m) => `${m.projectCode} · ${APPROVED_MAKE_SOURCE_LABELS[m.source]}`,
      render: (_, m) => (
        <div translate="no">
          <Typography.Text strong>{m.make}</Typography.Text>
          {m.model ? sub(m.model) : null}
        </div>
      ),
    },
    { key: 'project', title: 'Project', width: 130, card: false, render: (_, m) => <span translate="no">{m.projectCode}</span> },
    {
      key: 'source',
      title: 'From',
      width: 200,
      card: 'status',
      render: (_, m) =>
        m.approvalId ? (
          <div>
            <AppTag tone="success">{APPROVED_MAKE_SOURCE_LABELS[m.source]}</AppTag>
            {sub(
              <RecordLink href={`/material-approvals/${m.approvalId}`} onOpen={() => open(m.approvalId!)}>
                <span translate="no">{m.marNo}</span>
              </RecordLink>,
            )}
          </div>
        ) : (
          <AppTag>{APPROVED_MAKE_SOURCE_LABELS[m.source]}</AppTag>
        ),
    },
    { key: 'note', title: 'Note', width: 280, card: false, render: (_, m) => m.note ?? '' },
    ...(canManage
      ? [
          {
            key: 'remove',
            title: 'Remove',
            width: 90,
            align: 'right' as const,
            card: false as const,
            render: (_: unknown, m: ApprovedMakeDto) =>
              m.source === 'CONTRACT' ? (
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Remove ${m.make} for ${m.material}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    askDelete({
                      what: `${m.make} for ${m.material}`,
                      description: 'Order lines for this material are no longer checked against it.',
                      onConfirm: () => act.mutateAsync({ method: 'delete', path: `/material-approvals/makes/${m.id}` }),
                    });
                  }}
                />
              ) : null,
          },
        ]
      : []),
  ];
  const requestChoice = useColumnChoice('material-approvals', requestColumns);
  const makeChoice = useColumnChoice('approved-makes', makeColumns);

  const newButton = canRaise ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
      Request material approval
    </Button>
  ) : null;
  const addMakeButton = canManage ? (
    <Button icon={<PlusOutlined />} onClick={() => setAddingMake(true)}>
      Add make from the contract
    </Button>
  ) : null;
  const stat = (title: string, value: React.ReactNode, note?: React.ReactNode, tone?: 'danger') => (
    <Col xs={12} lg={6}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={0} formatter={() => value} styles={{ content: { fontSize: token.fontSizeHeading4, color: tone === 'danger' ? token.colorErrorText : undefined } }} />
        {note ? <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{note}</div> : null}
      </Card>
    </Col>
  );
  const s = requests.data?.summary;
  const filtered = !!page.params.q || (view === 'requests' && (status !== 'open' || kind !== 'all'));
  const makeCount = makes.data?.length ?? 0;

  return (
    <div className="page-container">
      <PageHeader title="Material approvals" subtitle="Makes and samples sent to the client or consultant for approval, and the makes each project may buy." extra={newButton} />
      {q.error && <QueryError error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading ? <PageSkeleton header={false} shape="list" /> : null}
      {view === 'requests' && s ? (
        <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
          {stat('With the reviewer', s.underReview, s.overdue ? `${s.overdue} past the reply date` : 'None past its reply date', s.overdue ? 'danger' : undefined)}
          {stat('Returned to us', s.withUs, 'To revise and resubmit, or rejected')}
          {stat('Approved this month', s.approvedThisMonth, 'Including approved as noted')}
          {stat('Days to a decision', s.avgDaysToDecide ?? NO_VALUE, 'Average over the last 90 days')}
        </Row>
      ) : null}
      <Card size="small">
        <AppTabs
          activeKey={view}
          onChange={(k) => {
            page.setFilter('status', undefined);
            page.setFilter('kind', undefined);
            page.setFilter('view', k === 'makes' ? 'makes' : undefined);
          }}
          items={[
            { key: 'requests', label: 'Requests' },
            { key: 'makes', label: 'Approved makes' },
          ]}
        />
        <ListToolbar
          projectId={projectId}
          onProject={() => undefined}
          hideProject
          search={page.search}
          onSearch={page.setSearch}
          searchPlaceholder={view === 'makes' ? 'Search material or make' : 'Search request, material or make'}
          searchLabel={view === 'makes' ? 'Search approved makes' : 'Search requests'}
        >
          {view === 'requests' ? (
            <>
              <Select aria-label="Requests to show" style={{ width: 190 }} value={status} onChange={(v) => page.setFilter('status', v === 'open' ? undefined : v)} options={STATUS} />
              <Select aria-label="Makes or samples" style={{ width: 170 }} value={kind} onChange={(v) => page.setFilter('kind', v === 'all' ? undefined : v)} options={KINDS} />
            </>
          ) : (
            addMakeButton
          )}
        </ListToolbar>
        {view === 'requests' ? (
          <DataTable<MaterialApprovalDto>
            columns={requestColumns}
            visible={requestChoice.visible}
            onChooseColumns={requestChoice.setChosen}
            chosenIsDefault={requestChoice.isDefault}
            rows={requests.data?.items ?? []}
            loading={requests.isLoading || requests.isFetching}
            table={{ pagination: false }}
            onOpen={open}
            empty={{ filtered, clear: () => page.clear(['q', 'status', 'kind']) }}
            failed={!!requests.error}
            scrollX={1130}
            emptyText={<EmptyArt art="entries" title={page.params.q ? 'No request matches the search' : status === 'open' ? 'No request open' : 'No request here'} />}
            emptyAction={newButton}
          />
        ) : (
          <>
            {makeCount ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                A purchase order line for one of these materials is flagged when it names another make, or none.
              </Typography.Paragraph>
            ) : null}
            <DataTable<ApprovedMakeDto>
              columns={makeColumns}
              visible={makeChoice.visible}
              onChooseColumns={makeChoice.setChosen}
              chosenIsDefault={makeChoice.isDefault}
              rows={makes.data ?? []}
              loading={makes.isLoading || makes.isFetching}
              table={{ pagination: false }}
              empty={{ filtered, clear: () => page.clear(['q']) }}
              failed={!!makes.error}
              scrollX={1140}
              emptyText={<EmptyArt art="entries" title={page.params.q ? 'No make matches the search' : 'No approved make listed yet'} />}
              emptyAction={addMakeButton}
            />
          </>
        )}
      </Card>
      <MaterialApprovalForm open={adding} onClose={() => setAdding(false)} onSaved={open} />
      <ApprovedMakeForm open={addingMake} onClose={() => setAddingMake(false)} />
      {deleteDialog}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MaterialApprovalsPage />
    </Suspense>
  );
}
