'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Checkbox, Select, Typography } from 'antd';
import { tk } from '@/ds';
import {
  DESIGN_PURPOSE_LABELS,
  DESIGN_PURPOSES,
  DESIGN_SUBMISSION_KIND_LABELS,
  DESIGN_SUBMISSION_KINDS,
  DESIGN_SUBMISSION_STATUS_LABELS,
  canManageDocuments,
  designRevisionLabel,
  figure,
  type DesignPurpose,
  type DesignSubmissionDto,
  type DesignSubmissionKind,
  type DesignSubmissionStatus,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useDesignSubmissions, useMasterList } from '@/lib/queries';
import { useNewIntent } from '@/lib/new-intent';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { PlusOutlined } from '@/components/common/icons';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { Figures } from '@/components/figures';
import { CodeTag, DesignStatusTag, DesignSubmissionForm } from './DesignSubmissionForms';

const KEYS = ['status', 'at', 'purpose', 'kind', 'toAnswer'] as const;
const SORT_FIELDS = ['submittedOn'] as const;
type SortField = (typeof SORT_FIELDS)[number];
type StatusFilter = DesignSubmissionStatus | 'LATE' | 'WITH_US';
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'LATE', label: 'Reply late' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'WITH_US', label: 'Back with us' },
  ...(['DRAFT', 'APPROVED', 'APPROVED_AS_NOTED', 'WITHDRAWN'] as const).map((s) => ({ value: s, label: DESIGN_SUBMISSION_STATUS_LABELS[s] })),
];

/**
 * Submittals (design submissions): drawings and designs sent for approval or vetting, the code each round came back
 * with, and the comments still to answer. Late reviews come first.
 */
export function DesignSubmissionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const may = !!user && canManageDocuments(user.roleKey);
  const [adding, setAdding] = useState(false);
  useNewIntent('design-submission', may, () => setAdding(true));
  const open = (id: string) => router.push(`/design-submissions/${id}`);
  const stageList = useMasterList('review-stage');
  const stageNames = new Map((stageList.data?.entries ?? []).map((e) => [e.code, e.name]));
  const sub = (text: React.ReactNode) => (
    <Typography.Text type="secondary" style={{ display: 'block', fontSize: tk.type.caption.fontSize }}>
      {text}
    </Typography.Text>
  );
  const frame = useListFrame<SortField, DesignSubmissionDto>({
    list: 'design-submissions',
    url: false,
    keys: KEYS,
    sortBy: 'submittedOn',
    sortOrder: 'desc',
    sortFields: SORT_FIELDS,
    initialProject: params.get('projectId') ?? undefined,
    // The dashboard's links: a status, or only those with comments to answer.
    initialFilters: params.get('status') || params.get('at') || params.get('toAnswer') === 'true'
        ? { ...(params.get('status') ? { status: params.get('status')! } : {}), ...(params.get('at') ? { at: params.get('at')! } : {}), ...(params.get('toAnswer') === 'true' ? { toAnswer: 'true' } : {}) }
        : undefined,
    chipLabels: {
      status: (v) => STATUS_FILTERS.find((s) => s.value === v)?.label ?? v,
      purpose: (v) => DESIGN_PURPOSE_LABELS[v as DesignPurpose] ?? v,
      kind: (v) => DESIGN_SUBMISSION_KIND_LABELS[v as DesignSubmissionKind] ?? v,
      toAnswer: () => 'Comments to answer',
      at: (v) => `Waiting at ${stageNames.get(v) ?? v}`,
    },
    columns: (): ListColumn<DesignSubmissionDto>[] => [
      {
        key: 'title',
        title: 'Submittal',
        locked: true,
        width: 320,
        card: 'title',
        cardText: (r) => `${r.submissionNo} ${r.title}`,
        render: (_, r) => (
          <div>
            <RecordLink href={`/design-submissions/${r.id}`} onOpen={() => open(r.id)} strong>
              {r.title}
            </RecordLink>
            {sub(<span translate="no">{`${r.submissionNo}${r.status === 'DRAFT' ? '' : ` ${designRevisionLabel(r.revision)}`} · ${DESIGN_SUBMISSION_KIND_LABELS[r.kind]}${r.documents ? ` · ${r.documents} document${r.documents === 1 ? '' : 's'}` : ''}`}</span>)}
          </div>
        ),
      },
      {
        key: 'status',
        title: 'Status',
        width: 200,
        card: 'status',
        render: (_, r) => (
          <div>
            <DesignStatusTag status={r.status} purpose={r.purpose} daysLate={r.daysLate} />
            {r.openComments ? sub(`${r.openComments} comment${r.openComments === 1 ? '' : 's'} to answer`) : null}
          </div>
        ),
      },
      {
        key: 'waitingAt',
        title: 'Waiting at',
        width: 190,
        card: 'meta',
        cardText: (r) => (r.waitingAt ? `Waiting at ${r.waitingAt}` : ''),
        render: (_, r) =>
          r.waitingAt ? (
            <div>
              <span translate="no">{r.waitingAt}</span>
              {sub(`Stage ${r.stages.indexOf(r.waitingAt) + 1} of ${r.stages.length}`)}
            </div>
          ) : r.stages.length ? (
            <Typography.Text type="secondary">{r.stages.join(', ')}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">One reviewer</Typography.Text>
          ),
      },
      { key: 'project', title: 'Project', width: 170, ellipsis: true, card: 'meta', cardText: (r) => r.projectName, render: (_, r) => <span translate="no">{r.projectName}</span> },
      {
        key: 'to',
        title: 'With reviewer',
        width: 220,
        ellipsis: true,
        card: false,
        render: (_, r) => (
          <div>
            <span translate="no">{r.toParty}</span>
            {sub(DESIGN_PURPOSE_LABELS[r.purpose])}
          </div>
        ),
      },
      {
        key: 'submittedOn',
        title: 'Submitted',
        width: 150,
        card: 'date',
        cardText: (r) => (r.submittedOn ? formatDate(r.submittedOn) : 'Not yet'),
        render: (_, r) =>
          r.submittedOn ? (
            <div translate="no">
              {formatDate(r.submittedOn)}
              {r.daysOutstanding !== null ? sub(`${r.daysOutstanding} day${r.daysOutstanding === 1 ? '' : 's'} with the reviewer`) : null}
            </div>
          ) : (
            <Typography.Text type="secondary">Not yet</Typography.Text>
          ),
      },
      {
        key: 'code',
        title: 'Last code',
        width: 200,
        defaultFrom: 1600,
        card: false,
        render: (_, r) => (r.lastCode ? <CodeTag code={r.lastCode} purpose={r.purpose} /> : <Typography.Text type="secondary">-</Typography.Text>),
      },
    ],
  });
  const { page } = frame;
  const status = page.filters.status as StatusFilter | undefined;
  const purpose = page.filters.purpose as DesignPurpose | undefined;
  const kind = page.filters.kind as DesignSubmissionKind | undefined;
  const toAnswer = page.filters.toAnswer === 'true';
  const at = page.filters.at;
  const { data, isLoading, isFetching, error, refetch } = useDesignSubmissions({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, projectId: frame.projectId, status, purpose, kind, toAnswer: toAnswer || undefined, at });
  const newButton = may ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
      New submittal
    </Button>
  ) : null;
  const s = data?.summary;
  const figures = s && [
    figure('underReview', s.underReview, { versus: { part: figure('reviewsLate', s.late) } }),
    figure('submittalsBack', s.withUs),
    figure('commentsToAnswer', s.toAnswer),
    figure('daysToCode', s.avgDaysToCode ?? { none: 'No code in the last 90 days' }),
  ];

  return (
    <div className="page-container">
      <PageHeader title="Submittals" subtitle="Drawings and designs sent for approval or vetting, the codes they came back with and the comments answered." />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {figures && (
        <div style={{ marginBottom: tk.space[4] }}>
          <Figures label="Submittal figures" figures={figures} scope={{ projectId: frame.projectId }} />
        </div>
      )}
      <Card size="small">
        <ListToolbar
          filters={frame.filterState}
          projectId={frame.projectFilter}
          onProject={frame.setProjectFilter}
          search={page.search}
          onSearch={page.setSearch}
          searchPlaceholder="Search number, title, drawing or reviewer"
          searchLabel="Search submittals"
          extra={newButton}
        >
          <Select<StatusFilter> allowClear placeholder="Any status" aria-label="Status" value={status} onChange={(v) => page.setFilter('status', v)} style={{ width: 190 }} options={STATUS_FILTERS} />
          <Select<string>
            allowClear
            placeholder="Waiting at any stage"
            aria-label="Waiting at"
            value={at}
            onChange={(v) => page.setFilter('at', v)}
            style={{ width: 200 }}
            options={(stageList.data?.entries ?? []).filter((e) => e.isActive).map((e) => ({ value: e.code, label: e.name }))}
          />
          <Select<DesignPurpose> allowClear placeholder="Approval or vetting" aria-label="Sent for" value={purpose} onChange={(v) => page.setFilter('purpose', v)} style={{ width: 180 }} options={DESIGN_PURPOSES.map((p) => ({ value: p, label: DESIGN_PURPOSE_LABELS[p] }))} />
          <Select<DesignSubmissionKind> allowClear placeholder="Any kind" aria-label="Kind" value={kind} onChange={(v) => page.setFilter('kind', v)} style={{ width: 190 }} options={DESIGN_SUBMISSION_KINDS.map((k) => ({ value: k, label: DESIGN_SUBMISSION_KIND_LABELS[k] }))} />
          <Checkbox checked={toAnswer} onChange={(e) => page.setFilter('toAnswer', e.target.checked ? 'true' : undefined)}>
            Only with comments to answer
          </Checkbox>
        </ListToolbar>
        <DataTable<DesignSubmissionDto>
          columns={frame.columns}
          visible={frame.choice.visible}
          onChooseColumns={frame.choice.setChosen}
          chosenIsDefault={frame.choice.isDefault}
          rows={data?.items ?? []}
          loading={isLoading || isFetching}
          table={page.tableProps<DesignSubmissionDto>(data?.total)}
          onOpen={open}
          chips={frame.chips}
          empty={frame.empty}
          failed={!!error}
          emptyText={<EmptyArt art="entries" title={status || at || purpose || kind || toAnswer || page.params.q ? 'No submittal matches these filters' : 'No submittal yet'} />}
          emptyAction={newButton}
        />
      </Card>
      <DesignSubmissionForm open={adding} onClose={() => setAdding(false)} projectId={frame.projectId} onSaved={open} />
    </div>
  );
}
