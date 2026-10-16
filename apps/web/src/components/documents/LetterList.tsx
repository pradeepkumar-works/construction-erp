'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Checkbox, Select, Typography, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { LetterDirection, LetterDto, LetterSortField } from '@erp/shared';
import { LETTER_DIRECTIONS, LETTER_DIRECTION_LABELS, LIST_SORT_FIELDS } from '@erp/shared';
import { useLetters } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { DirectionTag } from './LetterDrawer';

const KEYS = ['direction', 'awaiting'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** Letters in and out, numbered IN- and OUT-, with replies due. */
export function LetterList({ projectId: fixedProject, onOpen, onNew }: { projectId?: string; onOpen: (id: string) => void; onNew: () => void }) {
  const frame = useListFrame<LetterSortField, LetterDto>({
    list: 'letters',
    url: false,
    keys: KEYS,
    sortBy: 'letterDate',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.letters,
    fixedProject,
    chipLabels: { direction: (v) => LETTER_DIRECTION_LABELS[v as LetterDirection] ?? v, awaiting: () => 'Reply due' },
    columns: (sortOrderFor): ListColumn<LetterDto>[] => {
      const sort = (key: LetterSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Dated', dataIndex: 'letterDate', width: 110, render: (v) => formatDate(v), ...sort('letterDate') },
        { title: 'No.', dataIndex: 'letterNo', width: 140, className: 'mono', ...sort('letterNo') },
        { key: 'direction', title: '', label: 'In or out', dataIndex: 'direction', width: 90, render: (v: LetterDirection) => <DirectionTag direction={v} /> },
        ...(fixedProject
          ? []
          : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: LetterDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> } satisfies ListColumn<LetterDto>]),
        {
          title: 'Subject',
          key: 'subject',
          locked: true,
          width: 320,
          render: (_, r) => (
            <div>
              <RecordLink onOpen={() => onOpen(r.id)}>{r.subject}</RecordLink>
              <Sub>{[r.direction === 'IN' ? `From ${r.party}` : `To ${r.party}`, r.theirRef, r.riskNo].filter(Boolean).join(' · ')}</Sub>
            </div>
          ),
        },
        {
          title: 'Reply by',
          dataIndex: 'replyBy',
          width: 150,
          ...sort('replyBy'),
          render: (v: string | null, r) =>
            v ? (
              <Typography.Text type={r.overdue ? 'danger' : r.awaitingReply ? undefined : 'secondary'}>
                {formatDate(v)}
                {r.awaitingReply ? '' : ' (replied)'}
              </Typography.Text>
            ) : (
              <Sub>-</Sub>
            ),
        },
      ];
    },
  });
  const { page } = frame;
  const direction = page.filters.direction as LetterDirection | undefined;
  const awaiting = page.filters.awaiting === '1';
  const { data, isLoading, isFetching, error, refetch } = useLetters({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, direction, awaitingReply: awaiting || undefined });

  const newButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
      Record letter
    </Button>
  );

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search no., reference, subject"
        extra={newButton}
      >
        <Select<LetterDirection> allowClear placeholder="In and out" aria-label="In or out" value={direction} onChange={(v) => page.setFilter('direction', v)} style={{ width: 130 }} options={LETTER_DIRECTIONS.map((d) => ({ value: d, label: LETTER_DIRECTION_LABELS[d] }))} />
        <Checkbox checked={awaiting} onChange={(e) => page.setFilter('awaiting', e.target.checked ? '1' : undefined)}>
          Reply due
        </Checkbox>
      </ListToolbar>
      <DataTable<LetterDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<LetterDto>(data?.total)}
        onOpen={onOpen}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 950 : 1150}
        emptyText={<EmptyArt art="entries" title={direction || awaiting || page.params.q ? 'No letter matches these filters' : 'No letters recorded'} />}
        emptyAction={newButton}
      />
    </>
  );
}
