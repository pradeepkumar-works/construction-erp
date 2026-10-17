'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Checkbox, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { TransmittalDto, TransmittalSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, TRANSMITTAL_PURPOSE_LABELS, canManageDocuments } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useTransmittals } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';

const KEYS = ['unacknowledged'] as const;

/** Transmittals sent, with whether the receiver has signed for them. */
export function TransmittalList({ projectId: fixedProject, onOpen, onNew }: { projectId?: string; onOpen: (id: string) => void; onNew: () => void }) {
  const { user } = useAuth();
  const frame = useListFrame<TransmittalSortField, TransmittalDto>({
    list: 'transmittals',
    url: false,
    keys: KEYS,
    sortBy: 'sentOn',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.transmittals,
    fixedProject,
    chipLabels: { unacknowledged: () => 'Not acknowledged' },
    columns: (sortOrderFor): ListColumn<TransmittalDto>[] => {
      const sort = (key: TransmittalSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Sent', dataIndex: 'sentOn', width: 110, render: (v) => formatDate(v), ...sort('sentOn') },
        {
          title: 'No.',
          dataIndex: 'transmittalNo',
          locked: true,
          width: 150,
          ...sort('transmittalNo'),
          render: (v: string, r) => (
            <RecordLink onOpen={() => onOpen(r.id)} className="mono">
              {v}
            </RecordLink>
          ),
        },
        ...(fixedProject
          ? []
          : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: TransmittalDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> } satisfies ListColumn<TransmittalDto>]),
        { title: 'To', dataIndex: 'toParty', width: 240, ellipsis: true, ...sort('toParty') },
        { key: 'purpose', title: 'Purpose', dataIndex: 'purpose', width: 160, render: (v: TransmittalDto['purpose']) => TRANSMITTAL_PURPOSE_LABELS[v] },
        {
          title: 'Documents',
          key: 'items',
          width: 260,
          render: (_, r) => (
            <Typography.Text>
              {r.items
                .slice(0, 3)
                .map((i) => `${i.docNo} Rev ${i.revision}`)
                .join(', ')}
              {r.items.length > 3 ? ` +${r.items.length - 3}` : ''}
            </Typography.Text>
          ),
          total: (rows) => `${rows.reduce((n, r) => n + r.items.length, 0)} documents`,
        },
        { key: 'acknowledgedOn', title: 'Acknowledged', dataIndex: 'acknowledgedOn', width: 130, render: (v: string | null) => (v ? formatDate(v) : <Typography.Text type="danger">Not yet</Typography.Text>) },
      ];
    },
  });
  const { page } = frame;
  const unacknowledged = page.filters.unacknowledged === '1';
  const { data, isLoading, isFetching, error, refetch } = useTransmittals({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, unacknowledged: unacknowledged || undefined });

  const newButton = user && canManageDocuments(user.roleKey) ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
      New transmittal
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search no., to, document"
        searchLabel="Search transmittals"
        extra={newButton}
      >
        <Checkbox checked={unacknowledged} onChange={(e) => page.setFilter('unacknowledged', e.target.checked ? '1' : undefined)}>
          Not acknowledged
        </Checkbox>
      </ListToolbar>
      <DataTable<TransmittalDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<TransmittalDto>(data?.total)}
        onOpen={onOpen}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1000 : 1200}
        emptyText={<EmptyArt art="entries" title={unacknowledged || page.params.q ? 'No transmittal matches these filters' : 'No transmittals yet'} />}
        emptyAction={newButton}
      />
    </>
  );
}
