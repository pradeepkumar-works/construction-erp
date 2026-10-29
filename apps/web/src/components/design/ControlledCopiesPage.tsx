'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Col, Flex, Row, Select, Statistic, Typography, theme } from 'antd';
import { canManageDocuments, copyLabel, type ControlledCopyDto, type CopyState } from '@erp/shared';
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
import { DISPLAY_FONT } from '@/lib/theme';
import { CopyStateTag, IssueCopiesDialog, ReissueDialog, TakeBackDialog } from './ControlledCopies';

const KEYS = ['state'] as const;
const SORT_FIELDS = ['issuedOn'] as const;
type SortField = (typeof SORT_FIELDS)[number];
type StateFilter = CopyState | 'LATE';
const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: 'TO_RECALL', label: 'Superseded, to recall' },
  { value: 'LATE', label: 'Out past a week' },
  { value: 'IN_FORCE', label: 'In force' },
  { value: 'CLOSED', label: 'Taken back' },
];

/**
 * Controlled copies (item 138 part 3): every numbered print of a drawing in someone's hands on site, the superseded ones
 * first, to be taken back; and copies issued from here or from the document.
 */
export function ControlledCopiesPage() {
  const { token } = theme.useToken();
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
    <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
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
        title: 'Stands',
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
              title: '',
              width: 120,
              card: false as const,
              render: (_: unknown, r: ControlledCopyDto) =>
                r.state === 'TO_RECALL' ? (
                  <Flex vertical gap={4} align="start">
                    <Button size="small" onClick={(e) => {
                      e.stopPropagation();
                      setTakeBack(r);
                    }}>
                      Take back
                    </Button>
                    <Button size="small" type="link" style={{ paddingInline: 0 }} onClick={(e) => {
                      e.stopPropagation();
                      setReissue(r);
                    }}>
                      {`Give ${r.currentRevision}`}
                    </Button>
                  </Flex>
                ) : r.state === 'IN_FORCE' ? (
                  <Button size="small" type="text" onClick={(e) => {
                      e.stopPropagation();
                      setTakeBack(r);
                    }}>
                    Take back
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
  const stat = (title: string, value: React.ReactNode, note: React.ReactNode, tone?: 'danger') => (
    <Col xs={12} lg={8}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={0} formatter={() => value} styles={{ content: { fontFamily: DISPLAY_FONT, fontSize: token.fontSizeHeading4, color: tone === 'danger' ? token.colorErrorText : undefined } }} />
        <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{note}</div>
      </Card>
    </Col>
  );
  const docNo = documentId ? data?.items[0]?.docNo : undefined;

  return (
    <div className="page-container">
      <PageHeader
        title="Controlled copies"
        subtitle={docNo ? `Every copy of ${docNo} issued, in force and taken back.` : 'Numbered prints of drawings on site, and the superseded ones to take back.'}
        crumbs={documentId ? [{ title: 'Controlled copies', href: '/controlled-copies' }, { title: docNo ?? 'Drawing' }] : undefined}
        extra={newButton}
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {c && !documentId ? (
        <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
          {stat('To recall', c.toRecall, c.recallsLate ? `${c.recallsLate} out longer than a week` : 'Superseded, still on site', c.recallsLate ? 'danger' : undefined)}
          {stat('In force', c.inForce, 'Copies of the current revision')}
          {stat('Holders', c.holders, 'Offices, gangs and people with a copy')}
        </Row>
      ) : null}
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
          <Select<StateFilter> allowClear placeholder={documentId ? 'Every copy' : 'Out on site'} aria-label="Stands" value={state} onChange={(v) => page.setFilter('state', v)} style={{ width: 210 }} options={STATE_FILTERS} />
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
          scrollX={1050}
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
