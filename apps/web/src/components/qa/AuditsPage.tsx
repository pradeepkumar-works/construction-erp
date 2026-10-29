'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';
import { Button, Card, Checkbox, Descriptions, Drawer, Flex, Form, Input, InputNumber, Select, Table, Typography, theme } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FINDING_CLOSE_DAYS,
  FINDING_STATE_LABELS,
  NCR_SEVERITIES,
  NCR_SEVERITY_LABELS,
  QA_AUDIT_KINDS,
  QA_AUDIT_KIND_LABELS,
  auditProblem,
  canRaiseNcr,
  isExternalAudit,
  type AttachmentDto,
  type FindingState,
  type NcrSeverity,
  type QaAuditDto,
  type QaAuditFindingDto,
  type QaAuditKind,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useProject, useQaAudit, useQaAudits } from '@/lib/queries';
import { useUrlParam } from '@/lib/url-state';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { AppTag } from '@/components/common/AppTag';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DatePicker } from '@/components/common/DatePicker';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { PlusOutlined } from '@/components/common/icons';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { useMasterOptions } from '@/components/quality/NcrFormModal';

const SR_ONLY: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };
const KEYS = ['kind', 'open'] as const;
const SORT_FIELDS = ['date'] as const;
type SortField = (typeof SORT_FIELDS)[number];

const STATE_TONE: Record<FindingState, 'pending' | 'info' | 'success'> = { OPEN: 'pending', NCR: 'info', CLOSED: 'success' };
const SEVERITY_TONE: Record<NcrSeverity, 'neutral' | 'pending' | 'danger'> = { MINOR: 'neutral', MAJOR: 'pending', CRITICAL: 'danger' };

function FindingStateTag({ f }: { f: QaAuditFindingDto }) {
  return (
    <>
      <AppTag tone={STATE_TONE[f.state]} dot>
        {FINDING_STATE_LABELS[f.state]}
      </AppTag>
      {f.overdueDays ? <AppTag tone="danger">{`${f.overdueDays} day${f.overdueDays === 1 ? '' : 's'} late`}</AppTag> : null}
    </>
  );
}

/** The findings of an audit by where they stand, in a few words: "2 of 5 open". */
function OpenTag({ audit }: { audit: QaAuditDto }) {
  if (!audit.findings.length) return <Typography.Text type="secondary">No findings</Typography.Text>;
  if (!audit.open) return <AppTag tone="success">All closed</AppTag>;
  const late = audit.findings.some((f) => f.overdueDays);
  return <AppTag tone={late ? 'danger' : 'pending'}>{`${audit.open} of ${audit.findings.length} open`}</AppTag>;
}

interface AuditForm {
  projectId: string;
  kind: QaAuditKind;
  date: dayjs.Dayjs;
  visitor?: string;
  score?: number | null;
  summary?: string;
  findings: { id?: string; text: string; severity: NcrSeverity; dueOn?: dayjs.Dayjs | null }[];
  photos?: AttachmentDto[];
}

/** Record or change an audit or visit with its findings. */
function AuditFormDrawer({ open, onClose, audit, projectId, onSaved }: { open: boolean; onClose: () => void; audit?: QaAuditDto | null; projectId?: string; onSaved?: (a: QaAuditDto) => void }) {
  const [form] = Form.useForm<AuditForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const kind = Form.useWatch('kind', form);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      audit
        ? {
            projectId: audit.projectId,
            kind: audit.kind,
            date: dayjs(audit.date),
            visitor: audit.visitor ?? '',
            score: audit.score,
            summary: audit.summary ?? '',
            findings: audit.findings.map((f) => ({ id: f.id, text: f.text, severity: f.severity, dueOn: f.dueOn ? dayjs(f.dueOn) : null })),
            photos: audit.attachments,
          }
        : { projectId, kind: 'INTERNAL', date: dayjs(), findings: [{ text: '', severity: 'MINOR', dueOn: null }] },
    );
  }, [open, audit, projectId, form]);
  const save = useMutation({
    mutationFn: async (v: AuditForm) => {
      const body = {
        projectId: v.projectId,
        kind: v.kind,
        date: v.date.format('YYYY-MM-DD'),
        visitor: v.visitor || null,
        score: v.kind === 'INTERNAL' ? (v.score ?? null) : null,
        summary: v.summary || null,
        findings: (v.findings ?? []).map((f) => ({ id: f.id, text: f.text, severity: f.severity, dueOn: f.dueOn ? f.dueOn.format('YYYY-MM-DD') : null })),
        attachmentIds: (v.photos ?? []).map((a) => a.id),
      };
      const problem = auditProblem(body, dayjs().format('YYYY-MM-DD'));
      if (problem) throw new Error(problem);
      return (audit ? await api.put<QaAuditDto>(`/qa/audits/${audit.id}`, body) : await api.post<QaAuditDto>('/qa/audits', body)).data;
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['quality'] });
      notify.saved(`${a.auditNo} saved with ${a.findings.length} finding${a.findings.length === 1 ? '' : 's'}`);
      onSaved?.(a);
    },
    meta: FAIL_NOTICE,
  });
  const ncrLocked = (i: number) => !!audit?.findings.find((f) => f.id === form.getFieldValue(['findings', i, 'id']))?.ncrId;
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={880}
      draftKey={audit ? undefined : 'qa-audit'}
      title={audit ? `Edit ${audit.auditNo}` : 'Record audit or visit'}
      okText={audit ? 'Save audit' : 'Record audit'}
      onSubmit={(v) => save.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Visit">
          <FormGrid cols={3}>
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
              <ProjectSelect allowClear={false} placeholder="Choose the project" disabled={!!audit} />
            </Form.Item>
            <Form.Item name="kind" label="Kind" rules={[{ required: true, message: 'Choose who audited or visited' }]}>
              <Select options={QA_AUDIT_KINDS.map((k) => ({ value: k, label: QA_AUDIT_KIND_LABELS[k] }))} />
            </Form.Item>
            <Form.Item name="date" label="On" rules={[{ required: true, message: 'Pick the day of the visit' }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item
              name="visitor"
              label={kind === 'INTERNAL' ? 'Audited by' : 'Who visited'}
              rules={kind && isExternalAudit(kind) ? [{ required: true, whitespace: true, message: 'Say who visited, such as the client’s engineer' }] : []}
            >
              <Input maxLength={200} placeholder={kind === 'INTERNAL' ? 'Head office QA/QC' : 'EE (Quality Control), Works Department'} />
            </Form.Item>
            {kind === 'INTERNAL' ? (
              <Form.Item name="score" label="Score" extra="Out of 100, where the company scores its audits">
                <InputNumber min={0} max={100} precision={0} suffix="/ 100" style={{ width: '100%' }} />
              </Form.Item>
            ) : null}
          </FormGrid>
          <Form.Item name="summary" label="Summary">
            <Input.TextArea rows={2} maxLength={4000} placeholder="What was seen, and what was asked for" />
          </Form.Item>
        </FormSection>
        <FormSection title="Findings">
          <Typography.Paragraph type="secondary">
            Each observation on its own line. One left open past {FINDING_CLOSE_DAYS} days shows as late; a serious one becomes an NCR from the audit.
          </Typography.Paragraph>
          <LineTable
            name="findings"
            label="Finding"
            addText="Add finding"
            newLine={() => ({ text: '', severity: 'MINOR', dueOn: null })}
            columns={[
              {
                key: 'text',
                title: 'Finding',
                render: (f, i) => (
                  <Form.Item name={[f.name, 'text']} noStyle rules={[{ required: true, whitespace: true, message: 'Say what the finding is, or remove the line' }]}>
                    <Input.TextArea aria-label="Finding" autoSize={{ minRows: 1, maxRows: 4 }} maxLength={1000} disabled={ncrLocked(i)} placeholder="Cover blocks missing at the bottom of beam B12" />
                  </Form.Item>
                ),
              },
              {
                key: 'severity',
                title: 'Severity',
                width: 130,
                render: (f) => (
                  <Form.Item name={[f.name, 'severity']} noStyle>
                    <Select aria-label="Severity" options={NCR_SEVERITIES.map((s) => ({ value: s, label: NCR_SEVERITY_LABELS[s] }))} style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
              {
                key: 'dueOn',
                title: 'Put right by',
                width: 160,
                render: (f) => (
                  <Form.Item name={[f.name, 'dueOn']} noStyle>
                    <DatePicker aria-label="Put right by" format="DD MMM YYYY" style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>
        <FormSection title="Report">
          <Form.Item name="photos" label="Inspection report or photos">
            <PhotoUpload max={6} drawings />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}

/** Close a finding put right on site, with what was done. */
function CloseModal({ target, onClose }: { target: { audit: QaAuditDto; finding: QaAuditFindingDto } | null; onClose: () => void }) {
  const [form] = Form.useForm<{ note: string }>();
  const qc = useQueryClient();
  const notify = useNotify();
  useEffect(() => {
    if (target) form.resetFields();
  }, [target, form]);
  const save = useMutation({
    mutationFn: async (v: { note: string }) => (await api.post<QaAuditDto>(`/qa/audits/${target!.audit.id}/findings/${target!.finding.id}/close`, { note: v.note.trim() })).data,
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['quality'] });
      notify.saved(a.open ? `Finding closed; ${a.open} still open on ${a.auditNo}` : `All findings of ${a.auditNo} closed`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!target} onClose={onClose} form={form} layout="modal" width={520} projectDefault={false} title="Close finding" okText="Close finding" onSubmit={(v) => save.mutateAsync(v)}>
      <Typography.Paragraph type="secondary">{target?.finding.text}</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="note" label="What was done" rules={[{ required: true, whitespace: true, message: 'Say how it was put right' }]}>
          <Input.TextArea rows={3} maxLength={1000} placeholder="Cover blocks fixed and checked before the pour" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Raise an NCR from a finding: it takes the finding's words, severity and date; the client's when the visit was from outside. */
function NcrModal({ target, onClose }: { target: { audit: QaAuditDto; finding: QaAuditFindingDto } | null; onClose: () => void }) {
  const [form] = Form.useForm<{ actionById?: string; category?: string }>();
  const qc = useQueryClient();
  const notify = useNotify();
  const open = !!target;
  const { data: project } = useProject(open ? target.audit.projectId : undefined);
  const { options: categories } = useMasterOptions('ncr-category', null, open);
  const people = useMemo(
    () =>
      project
        ? [
            ...(project.projectManagerId ? [{ value: project.projectManagerId, label: `${project.projectManagerName} (Project Manager)` }] : []),
            ...project.members.filter((m) => m.userId !== project.projectManagerId).map((m) => ({ value: m.userId, label: `${m.fullName} (${m.roleName})` })),
          ]
        : [],
    [project],
  );
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  const save = useMutation({
    mutationFn: async (v: { actionById?: string; category?: string }) =>
      (await api.post<QaAuditDto>(`/qa/audits/${target!.audit.id}/findings/${target!.finding.id}/ncr`, { actionById: v.actionById ?? null, category: v.category ?? null })).data,
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['quality'] });
      const f = a.findings.find((x) => x.id === target?.finding.id);
      notify.saved(f?.ncrNo ? `${f.ncrNo} raised from ${a.auditNo}` : 'NCR raised', f?.ncrId ? `/inspections?tab=ncrs&id=${f.ncrId}` : null);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={520} projectDefault={false} title="Raise NCR" okText="Raise NCR" onSubmit={(v) => save.mutateAsync(v)}>
      <Typography.Paragraph type="secondary">
        {target?.finding.text}
        {target && isExternalAudit(target.audit.kind) ? ' The NCR is marked as raised by the client.' : ''}
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="actionById" label="To be rectified by">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={people} placeholder="Site engineer or contractor's in-charge" />
        </Form.Item>
        <Form.Item name="category" label="Category">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={categories} placeholder="Workmanship, material…" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** An audit or visit: its facts, findings with where each stands, and closing or raising an NCR from each. */
export function AuditDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: audit, isLoading, error, refetch } = useQaAudit(id);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState<{ audit: QaAuditDto; finding: QaAuditFindingDto } | null>(null);
  const [raising, setRaising] = useState<{ audit: QaAuditDto; finding: QaAuditFindingDto } | null>(null);
  const [confirmDelete, deleteDialog] = useConfirmDelete();
  const mayRecord = !!user && canRaiseNcr(user.roleKey);
  const reopen = useMutation({
    mutationFn: async (f: QaAuditFindingDto) => (await api.post<QaAuditDto>(`/qa/audits/${id}/findings/${f.id}/reopen`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quality'] });
      notify.saved('Finding opened again');
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({ mutationFn: async () => (await api.delete(`/qa/audits/${id}`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['quality'] }) });

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={840}
      title={
        audit ? (
          <Flex gap={token.marginXS} align="center" wrap>
            <span translate="no">{audit.auditNo}</span>
            <AppTag tone={isExternalAudit(audit.kind) ? 'violet' : 'neutral'}>{QA_AUDIT_KIND_LABELS[audit.kind]}</AppTag>
            <OpenTag audit={audit} />
          </Flex>
        ) : (
          'Audit'
        )
      }
      extra={mayRecord && audit ? <Button onClick={() => setEditing(true)}>Edit</Button> : null}
    >
      {isLoading ? (
        <PageSkeleton shape="record" header={false} />
      ) : error || !audit ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Flex vertical gap={token.marginLG}>
          <Descriptions
            column={{ xs: 1, sm: 2 }}
            size="small"
            items={[
              { key: 'project', label: 'Project', children: <Link href={`/projects/${audit.projectId}`}>{audit.projectName}</Link> },
              { key: 'date', label: 'On', children: formatDate(audit.date) },
              { key: 'visitor', label: audit.kind === 'INTERNAL' ? 'Audited by' : 'Who visited', children: audit.visitor ?? '-' },
              ...(audit.score !== null ? [{ key: 'score', label: 'Score', children: <span translate="no">{`${audit.score} / 100`}</span> }] : []),
              { key: 'by', label: 'Recorded by', children: audit.createdByName },
              ...(audit.summary ? [{ key: 'summary', label: 'Summary', span: 2, children: <span style={{ whiteSpace: 'pre-line' }}>{audit.summary}</span> }] : []),
            ]}
          />
          <div>
            <Typography.Title level={3} style={{ marginTop: 0, fontSize: token.fontSizeLG }}>
              Findings
            </Typography.Title>
            <Table<QaAuditFindingDto>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={audit.findings}
              scroll={{ x: 820 }}
              locale={{ emptyText: 'Nothing was found to put right' }}
              columns={[
                {
                  title: 'Finding',
                  key: 'text',
                  width: 300,
                  render: (_, f) => (
                    <div>
                      <span style={{ whiteSpace: 'pre-line' }}>{f.text}</span>
                      {f.closingNote ? (
                        <Typography.Text type="secondary" style={{ display: 'block' }}>
                          {`Closed ${formatDate(f.closedOn)}: ${f.closingNote}`}
                        </Typography.Text>
                      ) : null}
                      {f.ncrId ? (
                        <Link className="text-link" href={`/inspections?tab=ncrs&id=${f.ncrId}`} translate="no">
                          {f.ncrNo}
                        </Link>
                      ) : null}
                    </div>
                  ),
                },
                { title: 'Severity', dataIndex: 'severity', width: 100, render: (v: NcrSeverity) => <AppTag tone={SEVERITY_TONE[v]}>{NCR_SEVERITY_LABELS[v]}</AppTag> },
                { title: 'By', dataIndex: 'dueOn', width: 110, render: (v: string | null) => (v ? formatDate(v) : '-') },
                { title: 'Stands', key: 'state', width: 150, render: (_, f) => <FindingStateTag f={f} /> },
                ...(mayRecord
                  ? [
                      {
                        title: <span style={SR_ONLY}>Actions</span>,
                        key: 'act',
                        width: 200,
                        render: (_: unknown, f: QaAuditFindingDto) =>
                          f.state === 'OPEN' ? (
                            <Flex gap={token.marginXS} wrap>
                              <Button size="small" onClick={() => setClosing({ audit, finding: f })}>
                                Close
                              </Button>
                              <Button size="small" onClick={() => setRaising({ audit, finding: f })}>
                                Raise NCR
                              </Button>
                            </Flex>
                          ) : f.state === 'CLOSED' && !f.ncrId ? (
                            <Button size="small" loading={reopen.isPending && reopen.variables?.id === f.id} onClick={() => reopen.mutate(f)}>
                              Open again
                            </Button>
                          ) : null,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
          {audit.attachments.length ? (
            <div>
              <Typography.Title level={3} style={{ marginTop: 0, fontSize: token.fontSizeLG }}>
                Report and photos
              </Typography.Title>
              <AttachmentGallery attachments={audit.attachments} />
            </div>
          ) : null}
          {mayRecord && !audit.findings.some((f) => f.ncrId) ? (
            <Flex>
              <Button danger onClick={() => confirmDelete({ what: audit.auditNo, onConfirm: () => remove.mutateAsync(), onDone: onClose })}>
                Delete
              </Button>
            </Flex>
          ) : null}
        </Flex>
      )}
      {deleteDialog}
      <AuditFormDrawer open={editing} onClose={() => setEditing(false)} audit={audit} />
      <CloseModal target={closing} onClose={() => setClosing(null)} />
      <NcrModal target={raising} onClose={() => setRaising(null)} />
    </Drawer>
  );
}

/** Audits and visits (item 137 part 3): internal audits and visits from outside, each with findings followed until closed. */
export function AuditsPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const [openId, setOpenId] = useUrlParam('id');
  const [formOpen, setFormOpen] = useState(false);
  const frame = useListFrame<SortField, QaAuditDto>({
    list: 'qa-audits',
    url: false,
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: SORT_FIELDS,
    initialFilters: params.get('open') === '1' ? { open: '1' } : undefined,
    chipLabels: { kind: (v) => QA_AUDIT_KIND_LABELS[v as QaAuditKind] ?? v, open: () => 'Findings open' },
    columns: (sortOrderFor): ListColumn<QaAuditDto>[] => [
      { key: 'date', title: 'On', dataIndex: 'date', width: 110, render: (v) => formatDate(v), sorter: true, sortOrder: sortOrderFor('date'), sortDirections: ['descend', 'ascend'] },
      { key: 'auditNo', title: 'No.', dataIndex: 'auditNo', width: 140, className: 'mono' },
      { key: 'project', title: 'Project', dataIndex: 'projectName', width: 180, ellipsis: true },
      {
        key: 'visit',
        title: 'Audit or visit',
        locked: true,
        width: 300,
        render: (_, r) => (
          <div>
            <RecordLink onOpen={() => setOpenId(r.id)}>{QA_AUDIT_KIND_LABELS[r.kind]}</RecordLink>
            {r.visitor ? (
              <Typography.Text type="secondary" style={{ display: 'block' }}>
                {r.visitor}
              </Typography.Text>
            ) : null}
          </div>
        ),
      },
      { key: 'score', title: 'Score', dataIndex: 'score', width: 80, align: 'right', render: (v: number | null) => (v === null ? '-' : <span translate="no">{v}</span>) },
      { key: 'findings', title: 'Findings', width: 140, render: (_, r) => <OpenTag audit={r} /> },
      { key: 'late', title: 'Late', width: 90, align: 'right', render: (_, r) => <span translate="no">{r.findings.filter((f) => f.overdueDays).length || '-'}</span> },
    ],
  });
  const { page } = frame;
  const kind = page.filters.kind as QaAuditKind | undefined;
  const openOnly = page.filters.open === '1';
  const { data, isLoading, isFetching, error, refetch } = useQaAudits({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortOrder: page.params.sortOrder, projectId: frame.projectId, kind, open: openOnly || undefined });
  const newButton =
    user && canRaiseNcr(user.roleKey) ? (
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
        Record audit
      </Button>
    ) : null;
  return (
    <div className="page-container">
      <PageHeader title="Audits and visits" subtitle="Internal audits and visits by the client, its consultant, a third-party inspector or the department, each finding followed until it is put right." />
      <Card size="small">
        {error && <QueryError error={error} onRetry={() => refetch()} />}
        <ListToolbar
          filters={frame.filterState}
          projectId={frame.projectFilter}
          onProject={frame.setProjectFilter}
          search={page.search}
          onSearch={page.setSearch}
          searchPlaceholder="Search no., visitor, finding"
          searchLabel="Search audits"
          extra={newButton}
        >
          <Select<QaAuditKind> allowClear placeholder="Any kind" aria-label="Kind" value={kind} onChange={(v) => page.setFilter('kind', v)} style={{ width: 200 }} options={QA_AUDIT_KINDS.map((k) => ({ value: k, label: QA_AUDIT_KIND_LABELS[k] }))} />
          <Checkbox checked={openOnly} onChange={(e) => page.setFilter('open', e.target.checked ? '1' : undefined)}>
            Findings open
          </Checkbox>
        </ListToolbar>
        <DataTable<QaAuditDto>
          columns={frame.columns}
          visible={frame.choice.visible}
          onChooseColumns={frame.choice.setChosen}
          chosenIsDefault={frame.choice.isDefault}
          rows={data?.items ?? []}
          loading={isLoading || isFetching}
          table={page.tableProps<QaAuditDto>(data?.total)}
          onOpen={setOpenId}
          chips={frame.chips}
          empty={frame.empty}
          failed={!!error}
          scrollX={1040}
          emptyText={<EmptyArt art="entries" title={kind || openOnly || page.params.q ? 'No audit matches these filters' : 'No audit or visit recorded yet'} />}
          emptyAction={newButton}
        />
      </Card>
      <AuditDrawer id={openId ?? null} onClose={() => setOpenId(undefined)} />
      <AuditFormDrawer open={formOpen} onClose={() => setFormOpen(false)} projectId={frame.projectId} onSaved={(a) => setOpenId(a.id)} />
    </div>
  );
}
