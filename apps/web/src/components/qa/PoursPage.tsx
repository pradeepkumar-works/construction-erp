'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Checkbox, Descriptions, Drawer, Empty, Flex, Form, Input, Select, Skeleton, Table, Typography, theme } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  POUR_FLAG_LABELS,
  POUR_SORT_FIELDS,
  POUR_SOURCE_LABELS,
  POUR_STATUSES,
  POUR_STATUS_LABELS,
  canRecordPour,
  canRecordTest,
  gradeFck,
  type CubeAcceptanceDto,
  type PourDto,
  type PourSortField,
  type PourStatus,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useCubeAcceptance, usePour, usePours } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { useUrlTab } from '@/lib/url-state';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { AppTabs } from '@/components/common/AppTabs';
import { AppTag } from '@/components/common/AppTag';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { PlusOutlined } from '@/components/common/icons';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { FormShell } from '@/components/form/FormShell';
import { TestFormModal, type TestPrefill } from '@/components/quality/TestFormModal';
import { TestResultTag } from '@/components/quality/qualityUi';
import { PourFormModal, PouredModal } from './PourForms';

const TABS = ['pours', 'cubes'] as const;
type Tab = (typeof TABS)[number];
const KEYS = ['status', 'flagged'] as const;

const statusTone = (s: PourStatus) => (s === 'POURED' ? 'success' : s === 'CANCELLED' ? 'neutral' : 'info');

export function PourStatusTag({ status }: { status: PourStatus }) {
  return (
    <AppTag tone={statusTone(status)} dot>
      {POUR_STATUS_LABELS[status]}
    </AppTag>
  );
}

function Flags({ pour }: { pour: PourDto }) {
  return (
    <>
      {pour.flags.map((f) => (
        <AppTag key={f} tone="danger">
          {POUR_FLAG_LABELS[f]}
        </AppTag>
      ))}
    </>
  );
}

/** Cancel a planned pour, with the reason. */
function CancelModal({ pour, onClose }: { pour: PourDto | null; onClose: () => void }) {
  const [form] = Form.useForm<{ reason: string }>();
  const qc = useQueryClient();
  const notify = useNotify();
  const save = useMutation({
    mutationFn: async (v: { reason: string }) => (await api.post<PourDto>(`/qa/pours/${pour!.id}/cancel`, { reason: v.reason.trim() })).data,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['quality'] });
      notify.saved(`${p.pourNo} cancelled`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!pour} onClose={onClose} form={form} layout="modal" width={480} projectDefault={false} title={pour ? `Cancel ${pour.pourNo}` : 'Cancel pour'} okText="Cancel pour" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="reason" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why, such as rain or the RMC did not come' }]}>
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** A pour: its facts, the card, the cube sets IS 456 asks for against those taken, and what can be done next. */
export function PourDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: pour, isLoading, error, refetch } = usePour(id);
  const [editing, setEditing] = useState(false);
  const [pouring, setPouring] = useState<PourDto | null>(null);
  const [cancelling, setCancelling] = useState<PourDto | null>(null);
  const [cubes, setCubes] = useState<(TestPrefill & { projectId: string }) | null>(null);
  const [confirmDelete, deleteDialog] = useConfirmDelete();
  const mayPour = !!user && canRecordPour(user.roleKey);
  const mayTest = !!user && canRecordTest(user.roleKey);
  const card = useMutation({
    mutationFn: async () => (await api.post<PourDto>(`/qa/pours/${id}/card`)).data,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['quality'] });
      notify.saved(`Pour card ${p.card?.inspectionNo} sent to QA/QC`, p.card ? `/inspections?tab=inspections&id=${p.card.id}` : null);
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({ mutationFn: async () => (await api.delete(`/qa/pours/${id}`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['quality'] }) });

  const cardBad = pour?.card && pour.card.status === 'REJECTED';
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={720}
      title={
        pour ? (
          <Flex gap={token.marginXS} align="center" wrap>
            <span translate="no">{pour.pourNo}</span>
            <PourStatusTag status={pour.status} />
          </Flex>
        ) : (
          'Pour'
        )
      }
      extra={
        pour && mayPour && pour.status === 'PLANNED' ? (
          <Flex gap={token.marginXS} wrap>
            {!pour.card || cardBad ? (
              <Button loading={card.isPending} onClick={() => card.mutate()}>
                Request pour card
              </Button>
            ) : null}
            <Button type="primary" onClick={() => setPouring(pour)}>
              Record pour
            </Button>
          </Flex>
        ) : null
      }
    >
      {isLoading ? (
        <Skeleton active />
      ) : error || !pour ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Flex vertical gap={token.marginLG}>
          {pour.flags.length ? (
            <Flex gap={token.marginXS} wrap>
              <Flags pour={pour} />
            </Flex>
          ) : null}
          <Descriptions
            column={{ xs: 1, sm: 2 }}
            size="small"
            items={[
              { key: 'project', label: 'Project', children: <Link href={`/projects/${pour.projectId}`}>{pour.projectName}</Link> },
              { key: 'activity', label: 'Activity', children: pour.activityName },
              { key: 'location', label: 'Location', children: pour.location },
              { key: 'date', label: pour.status === 'POURED' ? 'Poured on' : 'Pour on', children: formatDate(pour.date) },
              { key: 'grade', label: 'Grade', children: <span translate="no">{pour.grade}</span> },
              {
                key: 'volume',
                label: 'Volume',
                children: <span translate="no">{pour.volume ? `${Number(pour.volume)} m³ poured (planned ${Number(pour.plannedVolume)})` : `${Number(pour.plannedVolume)} m³ planned`}</span>,
              },
              { key: 'source', label: 'Concrete', children: [POUR_SOURCE_LABELS[pour.source], pour.supplier].filter(Boolean).join(', ') },
              {
                key: 'card',
                label: 'Pour card',
                children: pour.card ? (
                  <Link href={`/inspections?tab=inspections&id=${pour.card.id}`}>
                    {pour.card.inspectionNo} {pour.cardPassed ? '(passed)' : pour.card.status === 'REJECTED' ? '(failed)' : '(waiting for QA/QC)'}
                  </Link>
                ) : (
                  'Not asked for'
                ),
              },
              ...(pour.remarks ? [{ key: 'remarks', label: 'Remarks', span: 2, children: <span style={{ whiteSpace: 'pre-line' }}>{pour.remarks}</span> }] : []),
            ]}
          />
          <div>
            <Flex justify="space-between" align="center" wrap gap={token.marginXS} style={{ marginBottom: token.marginXS }}>
              <Typography.Title level={3} style={{ margin: 0, fontSize: token.fontSizeLG }}>
                Cube sets: {pour.tests.length} of {pour.cubeSetsDue}
              </Typography.Title>
              {mayTest && pour.status !== 'CANCELLED' ? (
                <Button
                  icon={<PlusOutlined />}
                  onClick={() =>
                    setCubes({
                      projectId: pour.projectId,
                      testTypeCode: 'CUBE',
                      pourId: pour.id,
                      activityId: pour.activityId,
                      title: `${pour.grade} cubes, ${pour.location}`,
                      location: pour.location,
                      specMin: String(gradeFck(pour.grade) ?? ''),
                      note: `Cube set ${pour.tests.length + 1} of ${pour.cubeSetsDue} from ${pour.pourNo}.`,
                    })
                  }
                >
                  Record cube set
                </Button>
              ) : null}
            </Flex>
            <Typography.Paragraph type="secondary">IS 456 asks for one sample to 5 m³, then 2, 3 and 4 to 50 m³, and one more for each 50 m³ of a grade poured in a day.</Typography.Paragraph>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={pour.tests}
              locale={{ emptyText: 'No cube set taken yet' }}
              columns={[
                { title: 'Test', dataIndex: 'testNo', render: (v: string, t) => <Link href={`/inspections?tab=tests&id=${t.id}`}>{v}</Link> },
                { title: 'Sampled', dataIndex: 'sampledOn', render: (v: string) => formatDate(v) },
                { title: 'Result', dataIndex: 'value', align: 'right', render: (v: string | null) => (v ? <span translate="no">{`${Number(v)} N/mm²`}</span> : '-') },
                { title: 'Status', dataIndex: 'result', render: (v) => <TestResultTag result={v} /> },
              ]}
            />
          </div>
          {mayPour && pour.status === 'PLANNED' ? (
            <Flex gap={token.marginXS} wrap>
              <Button onClick={() => setEditing(true)}>Edit</Button>
              <Button onClick={() => setCancelling(pour)}>Cancel pour</Button>
              {!pour.tests.length ? (
                <Button danger onClick={() => confirmDelete({ what: pour.pourNo, onConfirm: () => remove.mutateAsync(), onDone: onClose })}>
                  Delete
                </Button>
              ) : null}
            </Flex>
          ) : null}
        </Flex>
      )}
      {deleteDialog}
      <PourFormModal open={editing} onClose={() => setEditing(false)} pour={pour} />
      <PouredModal pour={pouring} onClose={() => setPouring(null)} />
      <CancelModal pour={cancelling} onClose={() => setCancelling(null)} />
      <TestFormModal open={!!cubes} onClose={() => setCubes(null)} projectId={cubes?.projectId} prefill={cubes} />
    </Drawer>
  );
}

function PourList() {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const frame = useListFrame<PourSortField, PourDto>({
    list: 'pours',
    url: false,
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: POUR_SORT_FIELDS,
    chipLabels: { status: (v) => `Status: ${POUR_STATUS_LABELS[v as PourStatus] ?? v}`, flagged: () => 'Flagged' },
    columns: (sortOrderFor): ListColumn<PourDto>[] => {
      const sort = (key: PourSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Day', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
        { title: 'No.', dataIndex: 'pourNo', width: 140, className: 'mono', ...sort('pourNo') },
        { key: 'project', title: 'Project', dataIndex: 'projectName', width: 180, ellipsis: true, render: (v: string, r: PourDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> },
        {
          key: 'pour',
          title: 'Pour',
          locked: true,
          width: 280,
          render: (_, r) => (
            <div>
              <RecordLink onOpen={() => setOpenId(r.id)}>{r.location}</RecordLink>
              <Typography.Text type="secondary" style={{ display: 'block' }}>
                {r.activityName}
              </Typography.Text>
            </div>
          ),
        },
        { title: 'Grade', dataIndex: 'grade', width: 80, ...sort('grade'), render: (v: string) => <span translate="no">{v}</span> },
        { key: 'volume', title: 'm³', width: 90, align: 'right', render: (_, r) => <span translate="no">{Number(r.volume ?? r.plannedVolume)}</span> },
        { title: 'Card', key: 'card', width: 110, render: (_, r) => (r.cardPassed ? <AppTag tone="success">Passed</AppTag> : r.card ? <AppTag tone="pending">Waiting</AppTag> : <Typography.Text type="secondary">-</Typography.Text>) },
        { title: 'Cube sets', key: 'cubes', width: 100, align: 'right', render: (_, r) => <span translate="no">{`${r.tests.length} of ${r.cubeSetsDue}`}</span> },
        { key: 'flags', title: 'Flags', width: 220, render: (_, r) => (r.flags.length ? <Flags pour={r} /> : <Typography.Text type="secondary">-</Typography.Text>) },
        { key: 'status', title: 'Status', dataIndex: 'status', fixed: 'right' as const, width: 110, render: (v: PourStatus) => <PourStatusTag status={v} /> },
      ];
    },
  });
  const { page } = frame;
  const status = page.filters.status as PourStatus | undefined;
  const flagged = page.filters.flagged === '1';
  const { data, isLoading, isFetching, error, refetch } = usePours({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, status, flagged: flagged || undefined });
  const newButton =
    user && canRecordPour(user.roleKey) ? (
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
        Plan pour
      </Button>
    ) : null;
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search no., location, grade"
        searchLabel="Search pours"
        extra={newButton}
      >
        <Select<PourStatus> allowClear placeholder="Any status" aria-label="Status" value={status} onChange={(v) => page.setFilter('status', v)} style={{ width: 140 }} options={POUR_STATUSES.map((s) => ({ value: s, label: POUR_STATUS_LABELS[s] }))} />
        <Checkbox checked={flagged} onChange={(e) => page.setFilter('flagged', e.target.checked ? '1' : undefined)}>
          Flagged
        </Checkbox>
      </ListToolbar>
      <DataTable<PourDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<PourDto>(data?.total)}
        onOpen={setOpenId}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={1400}
        emptyText={<EmptyArt art="entries" title={status || flagged || page.params.q ? 'No pour matches these filters' : 'No pour planned yet'} />}
        emptyAction={newButton}
      />
      <PourDrawer id={openId} onClose={() => setOpenId(null)} />
      <PourFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={frame.projectId} onSaved={(p) => setOpenId(p.id)} />
    </>
  );
}

/** IS 456 Table 11 for each project and grade: the means of four and each result against their figures. */
function CubeAcceptancePanel() {
  const { token } = theme.useToken();
  const [projectId, setProjectId] = useProjectScope();
  const { data, isLoading, error, refetch } = useCubeAcceptance(projectId);
  const verdictTag = (g: CubeAcceptanceDto) =>
    g.acceptance.verdict === 'PASS' ? <AppTag tone="success">Accepted</AppTag> : g.acceptance.verdict === 'FAIL' ? <AppTag tone="danger">Not accepted</AppTag> : <AppTag tone="pending">Waiting for four results</AppTag>;
  return (
    <Flex vertical gap={token.margin}>
      <Flex gap={token.marginSM} wrap align="center">
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} style={{ minWidth: 240, maxWidth: '100%' }} />
      </Flex>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        IS 456 clause 16.1 and Table 11: in date order, each four results that do not overlap must average fck + 0.825 × the standard deviation (to the nearest 0.5) or fck + 3 N/mm², whichever is more, and each result
        must reach fck − 3 N/mm². Until a grade has 30 results, the deviation is Table 8&apos;s.
      </Typography.Paragraph>
      {isLoading ? (
        <Skeleton active />
      ) : error || !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : !data.length ? (
        <Empty description="No 28-day cube results yet." />
      ) : (
        data.map((g) => (
          <Card key={`${g.projectId}:${g.grade}`} size="small" title={<span translate="no">{`${g.grade} · ${g.projectName}`}</span>} extra={verdictTag(g)}>
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2, md: 4 }}
              items={[
                { key: 'n', label: 'Results', children: <span translate="no">{g.results.length}</span> },
                { key: 'mean', label: 'Mean', children: <span translate="no">{g.acceptance.mean === null ? '-' : `${g.acceptance.mean} N/mm²`}</span> },
                { key: 'sd', label: 'Standard deviation', children: <span translate="no">{`${g.acceptance.sd} (${g.acceptance.sdEstablished ? 'its own' : 'Table 8'})`}</span> },
                { key: 'need', label: 'Mean of four needs', children: <span translate="no">{`${g.acceptance.meanNeeded} N/mm²; each ${g.acceptance.individualMin}`}</span> },
              ]}
            />
            <Table
              rowKey={(r) => r.ids.join(',')}
              size="small"
              pagination={false}
              dataSource={g.acceptance.groups}
              locale={{ emptyText: `${g.acceptance.pending} result${g.acceptance.pending === 1 ? '' : 's'} so far; four make a group` }}
              columns={[
                { title: 'Results', key: 'from', render: (_, x) => `${formatDate(x.from)} to ${formatDate(x.to)}` },
                { title: 'Mean of four', dataIndex: 'mean', align: 'right', render: (v: number) => <span translate="no">{v}</span> },
                { title: 'Needs', dataIndex: 'needed', align: 'right', render: (v: number) => <span translate="no">{v}</span> },
                { title: 'Check', dataIndex: 'ok', render: (ok: boolean) => (ok ? <AppTag tone="success">Meets</AppTag> : <AppTag tone="danger">Short</AppTag>) },
              ]}
            />
            {g.acceptance.lowIds.length ? (
              <Typography.Paragraph style={{ marginTop: token.marginSM, marginBottom: 0, color: token.colorErrorText }}>
                Below {g.acceptance.individualMin} N/mm²:{' '}
                {g.results
                  .filter((r) => g.acceptance.lowIds.includes(r.id))
                  .map((r) => `${r.testNo} (${r.value})`)
                  .join(', ')}
                . Raise an NCR from the test, and core or load test the member as IS 456 clause 17 asks.
              </Typography.Paragraph>
            ) : null}
          </Card>
        ))
      )}
    </Flex>
  );
}

/** The pour register (item 137): pours with their card and cube sets, and the cube acceptance of each grade. */
export function PoursPage() {
  const [tab, setTab] = useUrlTab<Tab>(TABS, 'pours', { param: 'tab' });
  return (
    <div className="page-container">
      <PageHeader title="Pour register" subtitle="Each pour cleared by its card, the cube sets IS 456 asks for its volume, and each grade's acceptance under Table 11." />
      <Card size="small">
        <AppTabs
          activeKey={tab}
          onChange={(k) => setTab(k as Tab)}
          variant="page"
          items={[
            { key: 'pours', label: 'Pours', children: <PourList /> },
            { key: 'cubes', label: 'Cube acceptance', children: <CubeAcceptancePanel /> },
          ]}
        />
      </Card>
    </div>
  );
}
