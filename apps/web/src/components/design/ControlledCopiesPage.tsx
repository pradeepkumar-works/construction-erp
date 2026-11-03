'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Flex, Select, Typography } from 'antd';
import { tk } from '@/ds';
import { canManageDocuments, copyLabel, figure, type ControlledCopyDto, type CopyState } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useControlledCopies } from '@/lib/queries';
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
import { CopyStateTag, IssueCopiesDialog, ReissueDialog, TakeBackDialog } from './ControlledCopies';

const KEYS = ['state'] as const;
const SORT_FIELDS = ['issuedOn'] as const;
type SortField = (typeof SORT_FIELDS)[number];
type StateFilter = CopyState | 'LATE';
const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: 'TO_RECALL', label: 'Superseded, to withdraw' },
  { value: 'LATE', label: 'Out more than a week' },
  { value: 'IN_FORCE', label: 'In force' },
  { value: 'CLOSED', label: 'Withdrawn' },
];

/**
 * Controlled copies: every numbered print of a drawing in someone's hands on site, the superseded ones
 * first, to be taken back; and copies issued from here or from the document.
 */
export function ControlledCopiesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const documentId = params.get('documentId') ?? undefined;
  const may = !!user && canManageDocuments(user.roleKey);
  const [issuing, setIssuing] = useState(false);
  const [takeBack, setTakeBack] = useState<ControlledCopyDto | null>(null);
  const [reissue, setReissue] = useState<ControlledCopyDto | null>(null);
  useNewIntent('controlled-copy', may, () => setIssuing(true));
  const open = (c: ControlledCopyDto) => router.push(`/documents?id=${c.documentId}`);
  const sub = (text: React.ReactNode) => (
    <Typography.Text type="secondary" style={{ display: 'block', fontSize: tk.type.caption.fontSize }}>
      {text}
    </Typography.Text>
  );
  const frame = useListFrame<SortField, ControlledCopyDto>({
    list: 'controlled-copies',
    url: false,
    keys: KEYS,
    sortBy: 'issuedOn',
    sortOrder: 'desc',
    sortFields: SORT_FIELDS,
    initialProject: params.get('projectId') ?? undefined,
    initialFilters: params.get('state') ? { state: params.get('state')! } : undefined,
    chipLabels: { state: (v) => STATE_FILTERS.find((s) => s.value === v)?.label ?? v },
    columns: (): ListColumn<ControlledCopyDto>[] => [
      {
        key: 'drawing',
        title: 'Drawing',
        locked: true,
        width: 250,
        card: 'title',
        cardText: (r) => `${r.docNo} ${r.revision} · ${copyLabel(r.copyNo)} ${r.holder}`,
        render: (_, r) => (
          <div>
            <RecordLink href={`/documents?id=${r.documentId}`} onOpen={() => open(r)} strong>
              <span translate="no">{`${r.docNo} ${r.revision}`}</span>
            </RecordLink>
            {sub(r.title)}
          </div>
        ),
      },
      {
        key: 'holder',
        title: 'Copy and holder',
        width: 220,
        card: false,
        render: (_, r) => (
          <div translate="no">
            {`${copyLabel(r.copyNo)} ${r.holder}`}
            {r.transmittalNo ? sub(`On ${r.transmittalNo}`) : null}
          </div>
        ),
      },
      {
        key: 'state',
        title: 'Status',
        width: 180,
        card: 'status',
        render: (_, r) => (
          <div>
            <CopyStateTag copy={r} />
            {r.state === 'TO_RECALL' && r.currentRevision ? sub(`${r.currentRevision} since ${formatDate(r.supersededOn!)}`) : null}
            {r.state === 'CLOSED' && r.disposedOn ? sub(formatDate(r.disposedOn)) : null}
          </div>
        ),
      },
      { key: 'project', title: 'Project', width: 150, ellipsis: true, card: 'meta', cardText: (r) => r.projectName, render: (_, r) => <span translate="no">{r.projectName}</span> },
      {
        key: 'issuedOn',
        title: 'Issued',
        width: 130,
        card: 'date',
        cardText: (r) => formatDate(r.issuedOn),
        render: (_, r) => (
          <div translate="no">
            {formatDate(r.issuedOn)}
            {sub(`by ${r.issuedByName}`)}
          </div>
        ),
      },
      ...(may
        ? [
            {
              key: 'act',
              title: <span className="visually-hidden">Actions</span>,
              width: 120,
              card: false as const,
              render: (_: unknown, r: ControlledCopyDto) =>
                r.state === 'TO_RECALL' ? (
                  <Flex vertical gap={4} align="start">
                    <Button size="small" onClick={(e) => {
                      e.stopPropagation();
                      setTakeBack(r);
                    }}>
                      Withdraw copy
                    </Button>
                    <Button size="small" type="link" style={{ paddingInline: 0 }} onClick={(e) => {
                      e.stopPropagation();
                      setReissue(r);
                    }}>
                      {`Issue ${r.currentRevision}`}
                    </Button>
                  </Flex>
                ) : r.state === 'IN_FORCE' ? (
                  <Button size="small" type="text" onClick={(e) => {
                      e.stopPropagation();
                      setTakeBack(r);
                    }}>
                    Withdraw copy
                  </Button>
                ) : null,
            } satisfies ListColumn<ControlledCopyDto>,
          ]
        : []),
    ],
  });
  const { page } = frame;
  const state = page.filters.state as StateFilter | undefined;
  const { data, isLoading, isFetching, error, refetch } = useControlledCopies({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, projectId: frame.projectId, documentId, state });
  const newButton = may ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIssuing(true)}>
      Issue copies
    </Button>
  ) : null;
  const c = data?.counts;
  const figures = c && [
    figure('copiesToRecall', c.toRecall, { versus: { part: figure('recallsLate', c.recallsLate) } }),
    figure('copiesInForce', c.inForce),
    figure('copyHolders', c.holders),
  ];
  const docNo = documentId ? data?.items[0]?.docNo : undefined;

  return (
    <div className="page-container">
      <PageHeader
        title="Controlled copies"
        subtitle={docNo ? `Every copy of ${docNo} issued, in force and withdrawn.` : 'Numbered prints on site, and the superseded ones to withdraw.'}
        crumbs={documentId ? [{ title: 'Controlled copies', href: '/controlled-copies' }, { title: docNo ?? 'Drawing' }] : undefined}
        extra={newButton}
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {figures && !documentId && (
        <div style={{ marginBottom: tk.space[4] }}>
          <Figures label="Copy figures" figures={figures} scope={{ projectId: frame.projectId }} />
        </div>
      )}
      <Card size="small">
        <ListToolbar
          filters={frame.filterState}
          projectId={frame.projectFilter}
          onProject={frame.setProjectFilter}
          search={page.search}
          onSearch={page.setSearch}
          searchPlaceholder="Search drawing or holder"
          searchLabel="Search controlled copies"
        >
          <Select<StateFilter> allowClear placeholder={documentId ? 'Every copy' : 'Out on site'} aria-label="Status" value={state} onChange={(v) => page.setFilter('state', v)} style={{ width: 210 }} options={STATE_FILTERS} />
        </ListToolbar>
        <DataTable<ControlledCopyDto>
          columns={frame.columns}
          visible={frame.choice.visible}
          onChooseColumns={frame.choice.setChosen}
          chosenIsDefault={frame.choice.isDefault}
          rows={data?.items ?? []}
          loading={isLoading || isFetching}
          table={page.tableProps<ControlledCopyDto>(data?.total)}
          onOpen={(id) => {
            const r = data?.items.find((x) => x.id === id);
            if (r) open(r);
          }}
          chips={frame.chips}
          empty={frame.empty}
          failed={!!error}
          emptyText={<EmptyArt art="entries" title={state || page.params.q ? 'No copy matches these filters' : 'No controlled copy out'} />}
          emptyAction={newButton}
        />
      </Card>
      <IssueCopiesDialog open={issuing} onClose={() => setIssuing(false)} projectId={frame.projectId} />
      <TakeBackDialog copy={takeBack} open={!!takeBack} onClose={() => setTakeBack(null)} />
      <ReissueDialog copy={reissue} open={!!reissue} onClose={() => setReissue(null)} />
    </div>
  );
}
