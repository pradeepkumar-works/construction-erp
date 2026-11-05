'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Select, Typography } from 'antd';
import { tk } from '@/ds';
import { DESIGN_COMMENT_STATE_LABELS, designRevisionLabel, figure, type DesignCommentRowDto, type DesignCommentState } from '@erp/shared';
import { useDesignComments, useMasterList } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { AppTag } from '@/components/common/AppTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { Figures } from '@/components/figures';

type StateFilter = DesignCommentState | 'NOT_CLOSED';
const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: 'NOT_CLOSED', label: 'Not closed' },
  { value: 'OPEN', label: DESIGN_COMMENT_STATE_LABELS.OPEN },
  { value: 'ANSWERED', label: 'Answered, to close' },
  { value: 'CLOSED', label: DESIGN_COMMENT_STATE_LABELS.CLOSED },
];
const KEYS = ['state', 'stage'] as const;
const SORT_FIELDS = ['madeOn'] as const;

const sub = (text: React.ReactNode) => (
  <Typography.Text type="secondary" style={{ display: 'block', fontSize: tk.type.caption.fontSize }}>
    {text}
  </Typography.Text>
);

/**
 * Review comments: every reviewer's comment on the submittals, from the proof checker to head office, with our reply.
 * The ones to answer come first, the oldest at the top; a row opens its submittal, where the reply is written.
 */
export function DesignCommentsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const stageList = useMasterList('review-stage');
  const stageNames = new Map((stageList.data?.entries ?? []).map((e) => [e.code, e.name]));
  const rowsById = React.useRef(new Map<string, DesignCommentRowDto>());
  const open = (id: string) => {
    const c = rowsById.current.get(id);
    if (c) router.push(`/design-submissions/${c.submissionId}`);
  };
  const frame = useListFrame<(typeof SORT_FIELDS)[number], DesignCommentRowDto>({
    list: 'design-comments',
    url: false,
    keys: KEYS,
    sortBy: 'madeOn',
    sortOrder: 'asc',
    sortFields: SORT_FIELDS,
    initialProject: params.get('projectId') ?? undefined,
    initialFilters: { state: params.get('state') ?? 'NOT_CLOSED', ...(params.get('stage') ? { stage: params.get('stage')! } : {}) },
    chipLabels: {
      state: (v) => STATE_FILTERS.find((s) => s.value === v)?.label ?? v,
      stage: (v) => `By ${stageNames.get(v) ?? v}`,
    },
    columns: (): ListColumn<DesignCommentRowDto>[] => [
      {
        key: 'text',
        title: 'Comment',
        locked: true,
        width: 380,
        card: 'title',
        cardText: (c) => c.text,
        render: (_, c) => (
          <div>
            <RecordLink href={`/design-submissions/${c.submissionId}`} onOpen={() => open(c.id)}>
              <span style={{ whiteSpace: 'pre-wrap' }}>{c.text}</span>
            </RecordLink>
            {sub(<span translate="no">{[`No. ${c.commentNo} on ${c.submissionNo} ${designRevisionLabel(c.round)}`, c.docNo].filter(Boolean).join(' · ')}</span>)}
          </div>
        ),
      },
      {
        key: 'state',
        title: 'Status',
        width: 150,
        card: 'status',
        render: (_, c) => (
          <div>
            <AppTag kind="designComment" status={c.state}>
              {DESIGN_COMMENT_STATE_LABELS[c.state]}
            </AppTag>
            {c.daysOpen !== null ? sub(`${c.daysOpen} day${c.daysOpen === 1 ? '' : 's'} open`) : null}
          </div>
        ),
      },
      { key: 'stage', title: 'Reviewer', width: 150, card: 'meta', cardText: (c) => c.stage ?? '', render: (_, c) => (c.stage ? <span translate="no">{c.stage}</span> : <Typography.Text type="secondary">The reviewer</Typography.Text>) },
      {
        key: 'project',
        title: 'Project',
        width: 200,
        ellipsis: true,
        card: 'meta',
        cardText: (c) => c.projectName,
        render: (_, c) => (
          <div>
            <span translate="no">{c.projectName}</span>
            {c.component ? sub(<span translate="no">{c.component}</span>) : null}
          </div>
        ),
      },
      { key: 'madeOn', title: 'Made on', width: 120, card: 'date', cardText: (c) => (c.madeOn ? formatDate(c.madeOn) : ''), render: (_, c) => (c.madeOn ? <span translate="no">{formatDate(c.madeOn)}</span> : null) },
      {
        key: 'reply',
        title: 'Our reply',
        width: 300,
        defaultFrom: 1500,
        card: false,
        render: (_, c) =>
          c.reply ? (
            <div>
              <span style={{ whiteSpace: 'pre-wrap' }}>{c.reply}</span>
              {sub([c.repliedByName, c.repliedOn ? formatDate(c.repliedOn) : null].filter(Boolean).join(', '))}
            </div>
          ) : (
            <Typography.Text type="secondary">Not answered yet</Typography.Text>
          ),
      },
    ],
  });
  const { page } = frame;
  const state = page.filters.state as StateFilter | undefined;
  const stage = page.filters.stage;
  const { data, isLoading, isFetching, error, refetch } = useDesignComments({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, projectId: frame.projectId, state, stage });
  React.useEffect(() => {
    rowsById.current = new Map((data?.items ?? []).map((c) => [c.id, c]));
  }, [data]);
  const s = data?.summary;

  return (
    <div className="page-container">
      <PageHeader title="Review comments" subtitle="Reviewers’ comments on every submittal, with our replies. The ones to answer come first." />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {s && (
        <div style={{ marginBottom: tk.space[4] }}>
          <Figures label="Review comment figures" figures={[figure('commentsToAnswer', s.OPEN), figure('commentsAnswered', s.ANSWERED)]} scope={{ projectId: frame.projectId }} />
        </div>
      )}
      <Card size="small">
        <ListToolbar
          filters={frame.filterState}
          projectId={frame.projectFilter}
          onProject={frame.setProjectFilter}
          search={page.search}
          onSearch={page.setSearch}
          searchPlaceholder="Search comment, reply, submittal or drawing"
          searchLabel="Search review comments"
        >
          <Select<StateFilter> allowClear placeholder="Any status" aria-label="Status" value={state} onChange={(v) => page.setFilter('state', v)} style={{ width: 180 }} options={STATE_FILTERS} />
          <Select<string>
            allowClear
            placeholder="Any reviewer"
            aria-label="Reviewer"
            value={stage}
            onChange={(v) => page.setFilter('stage', v)}
            style={{ width: 180 }}
            options={(stageList.data?.entries ?? []).map((e) => ({ value: e.code, label: e.name }))}
          />
        </ListToolbar>
        <DataTable<DesignCommentRowDto>
          columns={frame.columns}
          visible={frame.choice.visible}
          onChooseColumns={frame.choice.setChosen}
          chosenIsDefault={frame.choice.isDefault}
          rows={data?.items ?? []}
          loading={isLoading || isFetching}
          table={page.tableProps<DesignCommentRowDto>(data?.total)}
          onOpen={open}
          chips={frame.chips}
          empty={frame.empty}
          failed={!!error}
          emptyText={<EmptyArt art="entries" title={state || stage || page.params.q ? 'No review comment matches these filters' : 'No review comment yet'} />}
        />
      </Card>
    </div>
  );
}
