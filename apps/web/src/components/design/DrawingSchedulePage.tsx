'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';
import { App, Button, Card, Checkbox, Descriptions, Drawer, Flex, Form, Input, Select, Space, Table, Typography, theme } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_DISCIPLINES,
  DOCUMENT_DISCIPLINE_LABELS,
  DRAWING_NEED_STATE_LABELS,
  DRAWING_SOURCES,
  DRAWING_SOURCE_LABELS,
  REVISION_STATUS_LABELS,
  canManageDocuments,
  canRaiseRisk,
  drawingNeedProblem,
  isClientSide,
  remindsByLetter,
  type AsBuiltDueDto,
  type DocumentDiscipline,
  type DrawingNeedDto,
  type DrawingNeedState,
  type DrawingSource,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useActivities, useAsBuiltDue, useDrawingNeed, useDrawingSchedule } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { useUrlParam, useUrlTab } from '@/lib/url-state';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { AppTabs } from '@/components/common/AppTabs';
import { AppTag } from '@/components/common/AppTag';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DatePicker } from '@/components/common/DatePicker';
import { PlusOutlined } from '@/components/common/icons';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { NextDrawingNo } from './NextDrawingNo';

const TABS = ['schedule', 'as-built'] as const;
type Tab = (typeof TABS)[number];
const KEYS = ['state', 'discipline', 'source'] as const;
const SORT_FIELDS = ['neededBy'] as const;
type SortField = (typeof SORT_FIELDS)[number];
type StateFilter = DrawingNeedState | 'LATE' | 'SOON';
const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: 'LATE', label: 'Late' },
  { value: 'SOON', label: 'Due within a week' },
  { value: 'AWAITED', label: 'Awaited' },
  { value: 'RECEIVED', label: 'Received, not for construction' },
  { value: 'GFC', label: 'Good for construction' },
  { value: 'DROPPED', label: 'Not needed' },
];

const STATE_TONE: Record<DrawingNeedState, 'pending' | 'info' | 'success' | 'neutral'> = { AWAITED: 'pending', RECEIVED: 'info', GFC: 'success', DROPPED: 'neutral' };

/** How late it is, or that it is due within a week; nothing otherwise. */
function LateTag({ n }: { n: DrawingNeedDto }) {
  if (n.overdue && n.daysLate) return <AppTag tone="danger">{`${n.daysLate} day${n.daysLate === 1 ? '' : 's'} late`}</AppTag>;
  return n.dueSoon ? <AppTag tone="pending">Due soon</AppTag> : null;
}

function NeedStateTag({ n }: { n: DrawingNeedDto }) {
  return (
    <Flex gap={4} wrap>
      <AppTag tone={n.overdue ? 'danger' : STATE_TONE[n.state]} dot>
        {DRAWING_NEED_STATE_LABELS[n.state]}
      </AppTag>
      <LateTag n={n} />
    </Flex>
  );
}

const from = (n: Pick<DrawingNeedDto, 'source' | 'fromParty'>) => n.fromParty ?? DRAWING_SOURCE_LABELS[n.source];

interface NeedForm {
  projectId: string;
  docNo?: string;
  title: string;
  discipline: DocumentDiscipline;
  source: DrawingSource;
  fromParty?: string;
  neededBy: dayjs.Dayjs;
  activityId?: string | null;
  remarks?: string;
  dropped?: boolean;
}

/** Add one drawing to the schedule, or change one. */
function NeedFormModal({ open, onClose, need, projectId, onSaved }: { open: boolean; onClose: () => void; need?: DrawingNeedDto | null; projectId?: string; onSaved?: (n: DrawingNeedDto) => void }) {
  const [form] = Form.useForm<NeedForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const project = (Form.useWatch('projectId', form) as string | undefined) ?? need?.projectId ?? projectId;
  const source = Form.useWatch('source', form) as DrawingSource | undefined;
  const { data: activities } = useActivities(open ? project : undefined);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      need
        ? {
            projectId: need.projectId,
            docNo: need.docNo ?? '',
            title: need.title,
            discipline: need.discipline,
            source: need.source,
            fromParty: need.fromParty ?? '',
            neededBy: dayjs(need.neededBy),
            activityId: need.activityId,
            remarks: need.remarks ?? '',
            dropped: need.dropped,
          }
        : { projectId, discipline: 'STRUCTURAL', source: 'CLIENT' },
    );
  }, [open, need, projectId, form]);
  const save = useMutation({
    mutationFn: async (v: NeedForm) => {
      const body = {
        projectId: v.projectId,
        docNo: v.docNo?.trim() || null,
        title: v.title,
        discipline: v.discipline,
        source: v.source,
        fromParty: v.fromParty?.trim() || null,
        neededBy: v.neededBy.format('YYYY-MM-DD'),
        activityId: v.activityId ?? null,
        remarks: v.remarks?.trim() || null,
        dropped: !!v.dropped,
      };
      const problem = drawingNeedProblem(body);
      if (problem) throw new Error(problem);
      return (need ? await api.put<DrawingNeedDto>(`/design/schedule/${need.id}`, body) : await api.post<DrawingNeedDto>('/design/schedule', body)).data;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      notify.saved(`${n.docNo ?? n.title} ${need ? 'saved' : 'added to the schedule'}`);
      onSaved?.(n);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" width={680} draftKey={need ? undefined : 'drawing-need'} title={need ? `Edit ${need.docNo ?? need.title}` : 'Add drawing to the schedule'} okText={need ? 'Save' : 'Add drawing'} onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormSection title="Drawing">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!(need || projectId)}>
            <ProjectSelect allowClear={false} placeholder="Choose the project" />
          </Form.Item>
          <Form.Item name="title" label="Drawing" rules={[{ required: true, whitespace: true, message: 'Say which drawing it is' }]}>
            <Input maxLength={200} placeholder="Second floor slab reinforcement" />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="discipline" label="Discipline">
              <Select options={DOCUMENT_DISCIPLINES.map((d) => ({ value: d, label: DOCUMENT_DISCIPLINE_LABELS[d] }))} />
            </Form.Item>
            <Form.Item label="Number" extra="When known; the drawing is matched to the register by it">
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="docNo" noStyle>
                  <Input maxLength={80} placeholder="STR-GA-205" aria-label="Number" />
                </Form.Item>
                <NextDrawingNo form={form} projectId={projectId ?? need?.projectId} />
              </Space.Compact>
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Who issues it, and when site needs it">
          <FormGrid cols={2}>
            <Form.Item name="source" label="Issued by">
              <Select options={DRAWING_SOURCES.map((s) => ({ value: s, label: DRAWING_SOURCE_LABELS[s] }))} />
            </Form.Item>
            <Form.Item name="neededBy" label="Needed by" rules={[{ required: true, message: 'Pick the day site needs it good for construction' }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </FormGrid>
          <Form.Item
            name="fromParty"
            label="Addressed to"
            extra="As a reminder letter is addressed"
            rules={source && remindsByLetter(source) ? [{ required: true, whitespace: true, message: 'Say who issues it, such as the architect or the Executive Engineer' }] : []}
          >
            <Input maxLength={300} placeholder="The Executive Engineer, Building Division No. 1" />
          </Form.Item>
          <Form.Item name="activityId" label="Work it holds up">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!project} placeholder="An activity of the project" options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
          {need ? (
            <Form.Item name="dropped" valuePropName="checked">
              <Checkbox>No longer needed</Checkbox>
            </Form.Item>
          ) : null}
        </FormSection>
      </Form>
    </FormShell>
  );
}

interface ManyForm {
  projectId: string;
  source: DrawingSource;
  fromParty?: string;
  lines: { docNo?: string; title: string; discipline: DocumentDiscipline; neededBy?: dayjs.Dayjs | null }[];
}

/** Add a list of drawings at once, as the planning team lists them or a consultant's drawing list gives them. */
function ManyFormDrawer({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string }) {
  const [form] = Form.useForm<ManyForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const source = Form.useWatch('source', form) as DrawingSource | undefined;
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ projectId, source: 'CLIENT', lines: [{ title: '', discipline: 'STRUCTURAL', neededBy: null }] });
  }, [open, projectId, form]);
  const save = useMutation({
    mutationFn: async (v: ManyForm) =>
      (
        await api.post<{ added: number }>('/design/schedule/lines', {
          projectId: v.projectId,
          lines: v.lines.map((l) => ({ docNo: l.docNo?.trim() || null, title: l.title, discipline: l.discipline, source: v.source, fromParty: v.fromParty?.trim() || null, neededBy: l.neededBy!.format('YYYY-MM-DD') })),
        })
      ).data,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      notify.saved(`${r.added} drawing${r.added === 1 ? '' : 's'} added to the schedule`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" width={920} draftKey="drawing-needs" title="Add drawings to the schedule" okText="Add drawings" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormSection title="From">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!projectId}>
            <ProjectSelect allowClear={false} placeholder="Choose the project" />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="source" label="Issued by">
              <Select options={DRAWING_SOURCES.map((s) => ({ value: s, label: DRAWING_SOURCE_LABELS[s] }))} />
            </Form.Item>
            <Form.Item name="fromParty" label="Addressed to" rules={source && remindsByLetter(source) ? [{ required: true, whitespace: true, message: 'Say who issues them, such as the architect' }] : []}>
              <Input maxLength={300} placeholder="The architect" />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Drawings">
          <LineTable
            name="lines"
            label="Drawing"
            addText="Add drawing"
            min={1}
            newLine={() => ({ title: '', discipline: form.getFieldValue(['lines', 0, 'discipline']) ?? 'STRUCTURAL', neededBy: null })}
            columns={[
              {
                key: 'docNo',
                title: 'Number',
                width: 150,
                render: (f) => (
                  <Form.Item name={[f.name, 'docNo']} noStyle>
                    <Input aria-label="Number" maxLength={80} placeholder="When known" />
                  </Form.Item>
                ),
              },
              {
                key: 'title',
                title: 'Drawing',
                render: (f) => (
                  <Form.Item name={[f.name, 'title']} noStyle rules={[{ required: true, whitespace: true, message: 'Say which drawing it is, or remove the line' }]}>
                    <Input aria-label="Drawing" maxLength={200} />
                  </Form.Item>
                ),
              },
              {
                key: 'discipline',
                title: 'Discipline',
                width: 170,
                render: (f) => (
                  <Form.Item name={[f.name, 'discipline']} noStyle>
                    <Select aria-label="Discipline" style={{ width: '100%' }} options={DOCUMENT_DISCIPLINES.map((d) => ({ value: d, label: DOCUMENT_DISCIPLINE_LABELS[d] }))} />
                  </Form.Item>
                ),
              },
              {
                key: 'neededBy',
                title: 'Needed by',
                width: 160,
                render: (f) => (
                  <Form.Item name={[f.name, 'neededBy']} noStyle rules={[{ required: true, message: 'Pick the day site needs it' }]}>
                    <DatePicker aria-label="Needed by" format="DD MMM YYYY" style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>
      </Form>
    </FormShell>
  );
}

/** A scheduled drawing: where it stands, how it was chased, and the next step. */
function NeedDrawer({ need, onClose, onEdit }: { need: DrawingNeedDto | null; onClose: () => void; onEdit: (n: DrawingNeedDto) => void }) {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const { message } = App.useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmDelete, deleteDialog] = useConfirmDelete();
  const may = !!user && canManageDocuments(user.roleKey);
  const remind = useMutation({
    mutationFn: async () => (await api.post<{ letterId: string; drawings: number }>(`/design/schedule/${need!.id}/remind`)).data,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['letters'] });
      message.success(`Reminder drafted for ${r.drawings} drawing${r.drawings === 1 ? '' : 's'}; check it and send it for signature`);
      router.push(`/correspondence/${r.letterId}`);
    },
    meta: FAIL_NOTICE,
  });
  const delay = useMutation({
    mutationFn: async () => (await api.post<DrawingNeedDto>(`/design/schedule/${need!.id}/delay`)).data,
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['risks'] });
      message.success(`Recorded as delay ${n.riskNo}; the notice clock runs from it`);
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({ mutationFn: async () => (await api.delete(`/design/schedule/${need!.id}`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }) });
  const n = need;
  const awaited = !!n && (n.state === 'AWAITED' || n.state === 'RECEIVED');
  return (
    <Drawer
      open={!!n}
      onClose={onClose}
      size={640}
      title={
        n ? (
          <Flex gap={token.marginXS} align="center" wrap>
            <span translate="no">{n.docNo ?? n.title}</span>
            <NeedStateTag n={n} />
          </Flex>
        ) : (
          'Drawing'
        )
      }
      extra={may && n ? <Button onClick={() => onEdit(n)}>Edit</Button> : null}
    >
      {n ? (
        <Flex vertical gap={token.marginLG}>
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'title', label: 'Drawing', children: n.title },
              { key: 'project', label: 'Project', children: <Link href={`/projects/${n.projectId}`}>{n.projectName}</Link> },
              { key: 'discipline', label: 'Discipline', children: DOCUMENT_DISCIPLINE_LABELS[n.discipline] },
              { key: 'from', label: 'Issued by', children: `${DRAWING_SOURCE_LABELS[n.source]}${n.fromParty ? `: ${n.fromParty}` : ''}` },
              { key: 'needed', label: 'Needed by', children: formatDate(n.neededBy) },
              ...(n.activityName ? [{ key: 'activity', label: 'Holds up', children: n.activityName }] : []),
              {
                key: 'register',
                label: 'In the register',
                children: n.documentId ? (
                  <Link href={`/documents?id=${n.documentId}`}>{`Revision ${n.revision} ${n.revisionStatus ? `(${REVISION_STATUS_LABELS[n.revisionStatus]})` : ''}`}</Link>
                ) : (
                  'Not yet received'
                ),
              },
              ...(n.receivedOn ? [{ key: 'received', label: 'First received', children: formatDate(n.receivedOn) }] : []),
              ...(n.gfcOn ? [{ key: 'gfc', label: 'Good for construction', children: formatDate(n.gfcOn) }] : []),
              {
                key: 'chased',
                label: 'Chased',
                children: n.reminders ? (
                  <span>
                    {`${n.reminders} reminder${n.reminders === 1 ? '' : 's'}, last ${formatDate(n.lastReminderOn)}`}
                    {n.lastLetterId ? (
                      <>
                        {' · '}
                        <Link href={`/correspondence/${n.lastLetterId}`}>{n.lastLetterNo ?? 'Draft letter'}</Link>
                      </>
                    ) : null}
                  </span>
                ) : (
                  'Not yet'
                ),
              },
              ...(n.riskId ? [{ key: 'delay', label: 'Delay', children: <Link href={`/risks?id=${n.riskId}`}>{n.riskNo}</Link> }] : []),
              ...(n.remarks ? [{ key: 'remarks', label: 'Remarks', children: <span style={{ whiteSpace: 'pre-line' }}>{n.remarks}</span> }] : []),
            ]}
          />
          {may && awaited ? (
            <Flex gap={token.marginXS} wrap>
              {remindsByLetter(n.source) ? (
                <Button type="primary" loading={remind.isPending} onClick={() => remind.mutate()}>
                  Write reminder letter
                </Button>
              ) : null}
              {isClientSide(n.source) && n.overdue && !n.riskId && user && canRaiseRisk(user.roleKey) ? (
                <Button loading={delay.isPending} onClick={() => delay.mutate()}>
                  Record as delay
                </Button>
              ) : null}
            </Flex>
          ) : null}
          {may && awaited && remindsByLetter(n.source) ? (
            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
              The letter lists every drawing {from(n)} owes on this project that is late or due within a week. It opens as a draft, to be signed and numbered like any other letter.
            </Typography.Paragraph>
          ) : null}
          {may && !n.riskId && !n.lastLetterId ? (
            <Flex>
              <Button danger onClick={() => confirmDelete({ what: n.docNo ?? n.title, onConfirm: () => remove.mutateAsync(), onDone: onClose })}>
                Delete
              </Button>
            </Flex>
          ) : null}
        </Flex>
      ) : null}
      {deleteDialog}
    </Drawer>
  );
}

function ScheduleList() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const params = useSearchParams();
  const [openId, setOpenId] = useUrlParam('id');
  const [editing, setEditing] = useState<DrawingNeedDto | 'new' | null>(null);
  const [adding, setAdding] = useState(false);
  const frame = useListFrame<SortField, DrawingNeedDto>({
    list: 'drawing-schedule',
    url: false,
    keys: KEYS,
    sortBy: 'neededBy',
    sortOrder: 'asc',
    sortFields: SORT_FIELDS,
    initialProject: params.get('projectId') ?? undefined,
    initialFilters: params.get('state') ? { state: params.get('state')! } : undefined,
    chipLabels: {
      state: (v) => STATE_FILTERS.find((s) => s.value === v)?.label ?? v,
      discipline: (v) => DOCUMENT_DISCIPLINE_LABELS[v as DocumentDiscipline] ?? v,
      source: (v) => `From: ${DRAWING_SOURCE_LABELS[v as DrawingSource] ?? v}`,
    },
    columns: (): ListColumn<DrawingNeedDto>[] => [
      { key: 'neededBy', title: 'Needed by', dataIndex: 'neededBy', width: 116, card: 'date', render: (v) => formatDate(v) },
      { key: 'late', title: 'Late', width: 120, card: 'status', render: (_, r) => <LateTag n={r} /> },
      {
        key: 'drawing',
        title: 'Drawing',
        locked: true,
        width: 300,
        card: 'title',
        cardText: (r) => [r.docNo, r.title].filter(Boolean).join(' '),
        render: (_, r) => (
          <div>
            <RecordLink onOpen={() => setOpenId(r.id)}>{r.title}</RecordLink>
            <Typography.Text type="secondary" style={{ display: 'block' }} translate="no">
              {[r.docNo, DOCUMENT_DISCIPLINE_LABELS[r.discipline]].filter(Boolean).join(' · ')}
            </Typography.Text>
          </div>
        ),
      },
      { key: 'project', title: 'Project', dataIndex: 'projectName', width: 160, ellipsis: true, card: 'meta' },
      { key: 'from', title: 'Issued by', width: 180, ellipsis: true, render: (_, r) => from(r) },
      { key: 'holds', title: 'Holds up', width: 160, ellipsis: true, defaultFrom: 1600, render: (_, r) => r.activityName ?? <Typography.Text type="secondary">-</Typography.Text> },
      {
        key: 'stands',
        title: 'Stands',
        width: 220,
        card: 'meta',
        cardText: (r) => DRAWING_NEED_STATE_LABELS[r.state],
        render: (_, r) => (
          <AppTag tone={r.overdue ? 'danger' : STATE_TONE[r.state]} dot>
            {DRAWING_NEED_STATE_LABELS[r.state]}
          </AppTag>
        ),
      },
      {
        key: 'chased',
        title: 'Chased',
        width: 160,
        defaultFrom: 1600,
        render: (_, r) =>
          r.reminders || r.riskNo ? (
            <span translate="no">{[r.reminders ? `${r.reminders} letter${r.reminders === 1 ? '' : 's'}` : null, r.riskNo].filter(Boolean).join(' · ')}</span>
          ) : (
            <Typography.Text type="secondary">-</Typography.Text>
          ),
      },
    ],
  });
  const { page } = frame;
  const state = page.filters.state as StateFilter | undefined;
  const discipline = page.filters.discipline as DocumentDiscipline | undefined;
  const source = page.filters.source as DrawingSource | undefined;
  const { data, isLoading, isFetching, error, refetch } = useDrawingSchedule({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, projectId: frame.projectId, state, discipline, source });
  const may = !!user && canManageDocuments(user.roleKey);
  const { data: open } = useDrawingNeed(openId);
  const newButton = may ? (
    <Space.Compact>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
        Add drawing
      </Button>
      <Button onClick={() => setAdding(true)}>Add a list</Button>
    </Space.Compact>
  ) : null;
  const c = data?.counts;
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {c ? (
        <Flex gap={token.marginXS} wrap style={{ margin: `${token.marginSM}px 0` }}>
          <AppTag tone={c.overdue ? 'danger' : 'neutral'}>{`${c.overdue} late`}</AppTag>
          <AppTag tone={c.dueSoon ? 'pending' : 'neutral'}>{`${c.dueSoon} due within a week`}</AppTag>
          <AppTag tone="success">{`${c.gfc} of ${c.total} good for construction`}</AppTag>
        </Flex>
      ) : null}
      <ListToolbar
        filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search number, drawing, who issues it"
        searchLabel="Search the drawing schedule"
        extra={newButton}
      >
        <Select<StateFilter> allowClear placeholder="Any state" aria-label="State" value={state} onChange={(v) => page.setFilter('state', v)} style={{ width: 220 }} options={STATE_FILTERS} />
        <Select<DocumentDiscipline> allowClear placeholder="Any discipline" aria-label="Discipline" value={discipline} onChange={(v) => page.setFilter('discipline', v)} style={{ width: 180 }} options={DOCUMENT_DISCIPLINES.map((d) => ({ value: d, label: DOCUMENT_DISCIPLINE_LABELS[d] }))} />
        <Select<DrawingSource> allowClear placeholder="Issued by anyone" aria-label="Issued by" value={source} onChange={(v) => page.setFilter('source', v)} style={{ width: 200 }} options={DRAWING_SOURCES.map((s) => ({ value: s, label: DRAWING_SOURCE_LABELS[s] }))} />
      </ListToolbar>
      <DataTable<DrawingNeedDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<DrawingNeedDto>(data?.total)}
        onOpen={setOpenId}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={1380}
        emptyText={<EmptyArt art="entries" title={state || discipline || source || page.params.q ? 'No drawing matches these filters' : 'No drawing scheduled yet'} />}
        emptyAction={newButton}
      />
      <NeedDrawer need={openId ? (open ?? null) : null} onClose={() => setOpenId(undefined)} onEdit={(n) => setEditing(n)} />
      <NeedFormModal open={!!editing} onClose={() => setEditing(null)} need={editing === 'new' ? null : editing} projectId={frame.projectId} onSaved={(n) => setOpenId(n.id)} />
      <ManyFormDrawer open={adding} onClose={() => setAdding(false)} projectId={frame.projectId} />
    </>
  );
}

/** Drawings site builds from that have no as-built revision yet: what the handover still owes. */
function AsBuiltPanel() {
  const { token } = theme.useToken();
  const router = useRouter();
  const [projectId, setProjectId] = useProjectScope();
  const { data, isLoading, error, refetch } = useAsBuiltDue(projectId);
  return (
    <Flex vertical gap={token.margin} style={{ paddingTop: token.marginSM }}>
      <Flex gap={token.marginSM} wrap align="center">
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} aria-label="Project" style={{ minWidth: 240, maxWidth: '100%' }} />
      </Flex>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Each drawing site built from needs an as-built revision before handover. These are good for construction in the register and have none yet.
      </Typography.Paragraph>
      {isLoading ? (
        <PageSkeleton shape="list" header={false} />
      ) : error || !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<AsBuiltDueDto>
          rowKey="documentId"
          size="small"
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          dataSource={data}
          scroll={{ x: 900 }}
          rowClassName={() => 'row-click'}
          onRow={(d) => ({ onClick: (e) => !(e.target as HTMLElement).closest('a') && router.push(`/documents?id=${d.documentId}`) })}
          locale={{ emptyText: 'Every drawing built from has its as-built revision' }}
          columns={[
            {
              title: 'Drawing',
              key: 'drawing',
              render: (_, d) => (
                <div>
                  <Link href={`/documents?id=${d.documentId}`} translate="no">
                    {d.docNo}
                  </Link>
                  <Typography.Text type="secondary" style={{ display: 'block' }}>
                    {d.title}
                  </Typography.Text>
                </div>
              ),
            },
            { title: 'Project', dataIndex: 'projectName', width: 200, ellipsis: true },
            { title: 'Discipline', dataIndex: 'discipline', width: 150, render: (v: DocumentDiscipline) => DOCUMENT_DISCIPLINE_LABELS[v] },
            { title: 'Current', key: 'rev', width: 230, render: (_, d) => <span translate="no">{`${d.revision}, ${REVISION_STATUS_LABELS[d.status]}`}</span> },
            { title: 'Issued', dataIndex: 'issuedOn', width: 120, render: (v: string) => formatDate(v) },
          ]}
        />
      )}
    </Flex>
  );
}

/** The drawing schedule: the drawings each project needs and the as-built check. */
export function DrawingSchedulePage() {
  const [tab, setTab] = useUrlTab<Tab>(TABS, 'schedule', { param: 'tab' });
  return (
    <div className="page-container">
      <PageHeader title="Drawing schedule" subtitle="The drawings each project needs, from whom and by when. A late one is chased by letter and recorded as a delay, so the time lost counts toward an extension." />
      <Card size="small">
        <AppTabs
          activeKey={tab}
          onChange={(k) => setTab(k as Tab)}
          variant="page"
          items={[
            { key: 'schedule', label: 'Schedule', children: <ScheduleList /> },
            { key: 'as-built', label: 'As-built check', children: <AsBuiltPanel /> },
          ]}
        />
      </Card>
    </div>
  );
}
