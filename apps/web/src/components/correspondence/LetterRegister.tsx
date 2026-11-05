'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Select, Typography } from 'antd';
import { tk } from '@/ds';
import { PlusOutlined } from '@/components/common/icons';
import type { AiDraftDto, LetterDirection, LetterDto, LetterSortField, LetterStatus, SignOffStep } from '@erp/shared';
import { LETTER_ACTION_LABELS, LETTER_MODE_LABELS, LIST_SORT_FIELDS, LETTER_STATUS_LABELS, canViewLetters, letterSignOff, letterStatusLabel } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useLetters, useMasterList } from '@/lib/queries';
import { useNewIntent } from '@/lib/new-intent';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { downloadXlsx, exportFileName, fetchAllPages, type ExportColumn } from '@/lib/exportExcel';
import { EmptyArt } from '@/components/common/EmptyArt';
import { AppTag } from '@/components/common/AppTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { DueCell } from '@/components/list/DueCell';
import { RecordLink } from '@/components/record/RecordLink';
import { fileUrl } from '@/lib/api';
import { PaperClipOutlined } from '@/components/common/icons';
import { LetterDrawer } from './LetterRecord';
import { LetterForm, HEAD_OFFICE } from './LetterForm';
import { LetterStatusTag, letterHref } from './letterUi';

const KEYS = ['status', 'category', 'partyKind', 'mine', 'toSign', 'awaiting', 'overdue', 'proof', 'unmarked', 'ho'] as const;
const FLAG_LABELS = { mine: 'Marked to me', toSign: 'To sign', awaiting: 'Reply due', overdue: 'Overdue', proof: 'No proof of delivery', unmarked: 'Not marked', ho: 'Head office' };

function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: tk.type.caption.fontSize, color: tk.color.text.muted }}>{children}</div>;
}

const STATUSES: Record<LetterDirection, LetterStatus[]> = { IN: ['OPEN', 'CLOSED'], OUT: ['DRAFT', 'AWAITING_APPROVAL', 'ISSUED'] };

const STEP_WORDS: Record<SignOffStep, string> = { DONE: 'Done', WAITING: 'Waiting', LATER: 'Not yet', NOT_NEEDED: 'Not needed' };

/** One line of the sign-off: the step, who it is with or who did it, and whether it waits. */
function SignOffLine({ label, step, who }: { label: string; step: SignOffStep; who?: string | null }) {
  const words = step === 'WAITING' && who ? `With ${who}` : step === 'DONE' && who ? who : STEP_WORDS[step];
  return (
    <div style={{ fontSize: tk.type.caption.fontSize, color: step === 'WAITING' ? tk.color.tone.pending.fg : step === 'DONE' ? tk.color.text.base : tk.color.text.muted }}>
      <span style={{ color: tk.color.text.muted }}>{label}: </span>
      {words}
    </div>
  );
}

/** The scanned letter (the first file kept with it), opened in a new tab from the register's row. */
function CopyLink({ letter }: { letter: LetterDto }) {
  const file = letter.attachments[0];
  return (
    <a href={fileUrl(file.url)} target="_blank" rel="noreferrer" aria-label={`Open the scanned copy of ${letter.letterNo ?? letter.subject}`} style={{ marginInlineStart: tk.space[2], whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
      <PaperClipOutlined /> Copy
    </a>
  );
}

/**
 * The inward or outward register: numbered from each project's series (P07/IN/26-27/015), with who has a
 * letter and by when, replies due, letters to sign and proof of delivery. On its own page with views in the URL, or in a
 * project's tab (`projectId`).
 */
/** The inward or outward register as it is kept on paper: number, dates, party, subject, and where the reply stands. */
const EXPORT: ExportColumn<LetterDto>[] = [
  { header: 'Number', value: (l) => l.letterNo ?? 'Draft', width: 24 },
  { header: 'Their reference', value: (l) => l.theirRef, width: 20 },
  { header: 'Letter date', value: (l) => l.letterDate, width: 12 },
  { header: 'Received on', value: (l) => l.receivedOn, width: 12 },
  { header: 'Project', value: (l) => l.projectName ?? 'Head office', width: 26 },
  { header: 'Party', value: (l) => l.party, width: 28 },
  { header: 'Subject', value: (l) => l.subject, width: 44 },
  { header: 'Category', value: (l) => l.categoryName, width: 18 },
  { header: 'Mode', value: (l) => (l.mode ? LETTER_MODE_LABELS[l.mode] : null), width: 12 },
  { header: 'Status', value: (l) => letterStatusLabel(l), width: 20 },
  { header: 'Drafted by', value: (l) => (l.direction === 'OUT' ? l.createdByName : null), width: 20 },
  { header: 'Signed by', value: (l) => (l.direction === 'OUT' ? (l.signedByName ?? (l.status === 'ISSUED' ? l.signatoryName : null)) : null), width: 20 },
  { header: 'Reply by', value: (l) => l.replyBy, width: 12 },
  { header: 'Awaiting reply', value: (l) => (l.awaitingReply ? (l.overdue ? 'Overdue' : 'Yes') : ''), width: 12 },
  { header: 'Marked to', value: (l) => l.markedToName, width: 20 },
  { header: 'Action', value: (l) => (l.action ? LETTER_ACTION_LABELS[l.action] : null), width: 16 },
  { header: 'Action due', value: (l) => l.actionDue, width: 12 },
];

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
  const { data: partyKinds } = useMasterList('letter-party');
  const partyKindName = (code: string) => partyKinds?.entries.find((e) => e.code === code)?.name ?? code;

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
          { key: 'approval', label: 'Signature and seal', filters: { status: 'AWAITING_APPROVAL' } },
          { key: 'drafts', label: 'Drafts', filters: { status: 'DRAFT' } },
          { key: 'proof', label: 'No proof of delivery', filters: { proof: '1' } },
        ],
    chipLabels: {
      status: (v) => LETTER_STATUS_LABELS[v as LetterStatus] ?? v,
      category: (v) => `Category: ${categoryName(v)}`,
      partyKind: (v) => `${isIn ? 'From' : 'To'}: ${partyKindName(v)}`,
      ...Object.fromEntries(Object.entries(FLAG_LABELS).map(([k, label]) => [k, () => label])),
    },
    columns: (sortOrderFor): ListColumn<LetterDto>[] => {
      const sort = (key: LetterSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'No.', dataIndex: 'letterNo', width: 150, render: (_, r) => (r.letterNo ? <span className="mono" translate="no">{r.letterNo}</span> : <Sub>Not numbered</Sub>), ...sort('letterNo') },
        { title: isIn ? 'Received' : 'Dated', dataIndex: isIn ? 'receivedOn' : 'letterDate', width: 110, render: (v: string | null, r) => formatDate(v ?? r.letterDate), ...sort('letterDate') },
        {
          title: 'Subject',
          key: 'subject',
          locked: true,
          width: isIn ? 340 : 310,
          render: (_, r) => (
            <div>
              <RecordLink href={letterHref(r.id)} onOpen={() => setOpenId(r.id)}>
                {r.subject}
              </RecordLink>
              {isIn && r.attachments.length ? <CopyLink letter={r} /> : null}
              {r.priority === 'URGENT' ? (
                <AppTag meaning="failed" style={{ marginInlineStart: tk.space[2] }}>
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
        { key: 'status', title: 'Status', dataIndex: 'status', width: isIn ? 120 : 160, render: (_: LetterStatus, r) => <LetterStatusTag letter={r} /> },
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
                title: 'Where it stands',
                key: 'stands',
                width: 200,
                render: (_: unknown, r: LetterDto) => {
                  const s = letterSignOff(r);
                  if (r.status !== 'ISSUED')
                    return (
                      <div>
                        <SignOffLine label="Signatory" step={s.sign} who={s.sign === 'DONE' ? (r.signedByName ?? r.signatoryName) : r.signatoryName} />
                        <SignOffLine label="Head office" step={s.seal} />
                      </div>
                    );
                  const signer = r.signedByName ?? r.signatoryName;
                  return (
                    <div>
                      <Sub>{signer ? `Signed by ${signer}${s.seal === 'DONE' ? ', sealed' : ''}` : 'Issued'}</Sub>
                      <Sub>
                        <span className={r.proofMissing ? 'text-danger' : undefined}>
                          {r.deliveredOn ? `Delivered ${formatDate(r.deliveredOn)}` : r.dispatchedOn ? `Dispatched ${formatDate(r.dispatchedOn)}${r.proofMissing ? ', no proof' : ''}` : 'Not dispatched'}
                        </span>
                      </Sub>
                    </div>
                  );
                },
              } satisfies ListColumn<LetterDto>,
              { key: 'draftedBy', title: 'Drafted by', dataIndex: 'createdByName', width: 150, defaultFrom: 1600 } satisfies ListColumn<LetterDto>,
            ]),
        {
          title: 'Reply by',
          dataIndex: 'replyBy',
          width: 140,
          ...(isIn ? {} : { defaultFrom: 1500 }),
          ...sort('replyBy'),
          render: (v: string | null, r) =>
            v && !r.awaitingReply ? <Typography.Text type="secondary">{`${formatDate(v)} (replied)`}</Typography.Text> : v ? <DueCell date={v} /> : <Sub>-</Sub>,
        },
      ];
    },
  });
  const { page } = frame;
  const f = page.filters;
  const flag = (k: string) => f[k] === '1' || undefined;
  const status = (STATUSES[direction] as string[]).includes(f.status ?? '') ? (f.status as LetterStatus) : undefined;
  const listFilters = {
    q: page.params.q,
    sortBy: page.params.sortBy,
    sortOrder: page.params.sortOrder,
    direction,
    projectId: f.ho === '1' ? HEAD_OFFICE : frame.projectId,
    status,
    category: f.category,
    partyKind: f.partyKind,
    mine: flag('mine'),
    toSign: flag('toSign'),
    awaitingReply: flag('awaiting'),
    overdue: flag('overdue'),
    proofMissing: flag('proof'),
    unmarked: flag('unmarked'),
  };
  const { data, isLoading, isFetching, error, refetch } = useLetters({ ...listFilters, page: page.params.page, pageSize: page.params.pageSize });
  const filtered = !!(status || f.category || f.partyKind || KEYS.some((k) => k !== 'status' && k !== 'category' && k !== 'partyKind' && f[k] === '1') || page.params.q);

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
        extra={
          <>
            <ExportButton
              onExport={async () => {
                const rows = await fetchAllPages<LetterDto>('/letters', listFilters);
                await downloadXlsx(exportFileName(`letters-${isIn ? 'inward' : 'outward'}`), isIn ? 'Inward letters' : 'Outward letters', EXPORT, rows);
                return rows.length;
              }}
            />
            {newButton}
          </>
        }
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
        <Select
          allowClear
          placeholder={isIn ? 'From any office' : 'To any office'}
          aria-label={isIn ? 'Kind of office it is from' : 'Kind of office it is to'}
          value={f.partyKind}
          onChange={(v) => page.setFilter('partyKind', v)}
          style={{ width: 200 }}
          options={(partyKinds?.entries ?? []).map((e) => ({ value: e.code, label: `${isIn ? 'From' : 'To'} ${e.name.toLowerCase()}` }))}
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
