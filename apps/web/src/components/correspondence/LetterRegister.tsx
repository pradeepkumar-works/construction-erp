'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Select, Typography, theme } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { AiDraftDto, LetterDirection, LetterDto, LetterSortField, LetterStatus } from '@erp/shared';
import { LETTER_ACTION_LABELS, LIST_SORT_FIELDS, LETTER_STATUS_LABELS, canViewLetters } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useLetters, useMasterList } from '@/lib/queries';
import { useNewIntent } from '@/lib/new-intent';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { AppTag } from '@/components/common/AppTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { LetterDrawer } from './LetterRecord';
import { LetterForm, HEAD_OFFICE } from './LetterForm';
import { LetterStatusTag, letterHref, letterLabel } from './letterUi';

const KEYS = ['status', 'category', 'mine', 'toSign', 'awaiting', 'overdue', 'proof', 'unmarked', 'ho'] as const;
const FLAG_LABELS = { mine: 'Marked to me', toSign: 'To sign', awaiting: 'Reply due', overdue: 'Overdue', proof: 'No proof of delivery', unmarked: 'Not marked', ho: 'Head office' };

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

const STATUSES: Record<LetterDirection, LetterStatus[]> = { IN: ['OPEN', 'CLOSED'], OUT: ['DRAFT', 'AWAITING_APPROVAL', 'ISSUED'] };

/**
 * The inward or outward register: numbered from each project's series (P07/IN/26-27/015), with who has a
 * letter and by when, replies due, letters to sign and proof of delivery. On its own page with views in the URL, or in a
 * project's tab (`projectId`).
 */
export function LetterRegister({ direction, projectId: fixedProject, initialFilters }: { direction: LetterDirection; projectId?: string; initialFilters?: Record<string, string> }) {
  const { user } = useAuth();
  const isIn = direction === 'IN';
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<AiDraftDto | null>(null);
  const keeper = !!user && canViewLetters(user.roleKey);
  useNewIntent(isIn ? 'letter-in' : 'letter', keeper, (d) => {
    setDraft(d ?? null);
    setFormOpen(true);
  });
  const { data: categories } = useMasterList('letter-category');
  const categoryName = (code: string) => categories?.entries.find((e) => e.code === code)?.name ?? code;

  const frame = useListFrame<LetterSortField, LetterDto>({
    ...(fixedProject ? { list: `letters-${direction.toLowerCase()}`, url: false as const } : { list: isIn ? ('inward-letters' as const) : ('outward-letters' as const) }),
    keys: KEYS,
    sortBy: 'letterDate',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.letters,
    fixedProject,
    initialFilters,
    statusLabels: LETTER_STATUS_LABELS,
    moreViews: isIn
      ? [
          { key: 'mine', label: 'Marked to me', filters: { mine: '1' } },
          { key: 'awaiting', label: 'Reply due', filters: { awaiting: '1' } },
          { key: 'unmarked', label: 'Not marked', filters: { unmarked: '1' } },
        ]
      : [
          { key: 'toSign', label: 'To sign', filters: { toSign: '1' } },
          { key: 'drafts', label: 'Drafts', filters: { status: 'DRAFT' } },
          { key: 'proof', label: 'No proof of delivery', filters: { proof: '1' } },
        ],
    chipLabels: {
      status: (v) => LETTER_STATUS_LABELS[v as LetterStatus] ?? v,
      category: (v) => `Category: ${categoryName(v)}`,
      ...Object.fromEntries(Object.entries(FLAG_LABELS).map(([k, label]) => [k, () => label])),
    },
    columns: (sortOrderFor): ListColumn<LetterDto>[] => {
      const sort = (key: LetterSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'No.', dataIndex: 'letterNo', width: 170, render: (_, r) => <span className="mono" translate="no">{letterLabel(r)}</span>, ...sort('letterNo') },
        { title: isIn ? 'Received' : 'Dated', dataIndex: isIn ? 'receivedOn' : 'letterDate', width: 110, render: (v: string | null, r) => formatDate(v ?? r.letterDate), ...sort('letterDate') },
        {
          title: 'Subject',
          key: 'subject',
          locked: true,
          width: 340,
          render: (_, r) => (
            <div>
              <RecordLink href={letterHref(r.id)} onOpen={() => setOpenId(r.id)}>
                {r.subject}
              </RecordLink>
              {r.priority === 'URGENT' ? (
                <AppTag tone="danger" style={{ marginInlineStart: 6 }}>
                  Urgent
                </AppTag>
              ) : null}
              <Sub>{[isIn ? `From ${r.party}` : `To ${r.party}`, r.theirRef, r.categoryName, r.riskNo].filter(Boolean).join(' · ')}</Sub>
            </div>
          ),
        },
        ...(fixedProject
          ? []
          : [
              {
                title: 'Project',
                dataIndex: 'projectName',
                ...sort('project'),
                width: 190,
                ellipsis: true,
                render: (v: string | null, r: LetterDto) => (r.projectId ? <Link href={`/projects/${r.projectId}`}>{v}</Link> : <Typography.Text type="secondary">Head office</Typography.Text>),
              } satisfies ListColumn<LetterDto>,
            ]),
        { key: 'status', title: 'Status', dataIndex: 'status', width: 150, render: (v: LetterStatus) => <LetterStatusTag status={v} /> },
        ...(isIn
          ? [
              {
                title: 'With',
                width: 200,
                ...sort('actionDue'),
                render: (_: unknown, r: LetterDto) =>
                  r.markedToName && r.status === 'OPEN' ? (
                    <div>
                      {r.markedToName}
                      <Sub>
                        <span className={r.actionOverdue ? 'text-danger' : undefined}>
                          {LETTER_ACTION_LABELS[r.action ?? 'REPLY']}
                          {r.actionDue ? ` by ${formatDate(r.actionDue)}` : ''}
                        </span>
                      </Sub>
                    </div>
                  ) : (
                    <Sub>{r.status === 'OPEN' ? 'Not marked' : '-'}</Sub>
                  ),
              } satisfies ListColumn<LetterDto>,
            ]
          : [
              {
                title: 'Sent',
                key: 'sent',
                width: 180,
                render: (_: unknown, r: LetterDto) =>
                  r.status === 'ISSUED' ? (
                    r.deliveredOn ? (
                      <Sub>Delivered {formatDate(r.deliveredOn)}</Sub>
                    ) : r.dispatchedOn ? (
                      <Sub>
                        <span className={r.proofMissing ? 'text-danger' : undefined}>Dispatched {formatDate(r.dispatchedOn)}{r.proofMissing ? ', no proof' : ''}</span>
                      </Sub>
                    ) : (
                      <Sub>
                        <span className={r.proofMissing ? 'text-danger' : undefined}>Not dispatched</span>
                      </Sub>
                    )
                  ) : r.status === 'AWAITING_APPROVAL' ? (
                    <Sub>With {r.signatoryName ?? 'the signatory'}</Sub>
                  ) : (
                    <Sub>-</Sub>
                  ),
              } satisfies ListColumn<LetterDto>,
            ]),
        {
          title: 'Reply by',
          dataIndex: 'replyBy',
          width: 140,
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
  const f = page.filters;
  const flag = (k: string) => f[k] === '1' || undefined;
  const status = (STATUSES[direction] as string[]).includes(f.status ?? '') ? (f.status as LetterStatus) : undefined;
  const { data, isLoading, isFetching, error, refetch } = useLetters({
    page: page.params.page,
    pageSize: page.params.pageSize,
    q: page.params.q,
    sortBy: page.params.sortBy,
    sortOrder: page.params.sortOrder,
    direction,
    projectId: f.ho === '1' ? HEAD_OFFICE : frame.projectId,
    status,
    category: f.category,
    mine: flag('mine'),
    toSign: flag('toSign'),
    awaitingReply: flag('awaiting'),
    overdue: flag('overdue'),
    proofMissing: flag('proof'),
    unmarked: flag('unmarked'),
  });
  const filtered = !!(status || f.category || KEYS.some((k) => k !== 'status' && k !== 'category' && f[k] === '1') || page.params.q);

  const newButton = keeper ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      {isIn ? 'Record inward letter' : 'New letter'}
    </Button>
  ) : null;

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search no., reference, party, subject"
        searchLabel={isIn ? 'Search inward letters' : 'Search outward letters'}
        extra={newButton}
      >
        <Select<LetterStatus> allowClear placeholder="Any status" aria-label="Status" value={status} onChange={(v) => page.setFilter('status', v)} style={{ width: 170 }} options={STATUSES[direction].map((s) => ({ value: s, label: LETTER_STATUS_LABELS[s] }))} />
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="Any category"
          aria-label="Category"
          value={f.category}
          onChange={(v) => page.setFilter('category', v)}
          style={{ width: 190 }}
          options={(categories?.entries ?? []).map((e) => ({ value: e.code, label: e.name }))}
        />
        {isIn ? (
          <Checkbox checked={f.awaiting === '1'} onChange={(e) => page.setFilter('awaiting', e.target.checked ? '1' : undefined)}>
            Reply due
          </Checkbox>
        ) : (
          <Checkbox checked={f.proof === '1'} onChange={(e) => page.setFilter('proof', e.target.checked ? '1' : undefined)}>
            No proof of delivery
          </Checkbox>
        )}
        <Checkbox checked={f.overdue === '1'} onChange={(e) => page.setFilter('overdue', e.target.checked ? '1' : undefined)}>
          Overdue
        </Checkbox>
        {!fixedProject ? (
          <Checkbox checked={f.ho === '1'} onChange={(e) => page.setFilter('ho', e.target.checked ? '1' : undefined)}>
            Head office
          </Checkbox>
        ) : null}
      </ListToolbar>
      <DataTable<LetterDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<LetterDto>(data?.total)}
        onOpen={setOpenId}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1100 : 1300}
        emptyText={<EmptyArt art="entries" title={filtered ? 'No letter matches these filters' : isIn ? 'No letters received yet' : 'No letters sent yet'} />}
        emptyAction={newButton}
      />
      <LetterDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} />
      <LetterForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setDraft(null);
        }}
        direction={direction}
        projectId={fixedProject}
        aiDraft={draft}
        onSaved={(l) => setOpenId(l.id)}
      />
    </>
  );
}
