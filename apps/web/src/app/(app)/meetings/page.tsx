'use client';

import React, { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Row, Segmented, Select, Statistic, Tabs, Typography, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { MEETING_KIND_LABELS, canRecordMeetings, type MeetingActionDto, type MeetingDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMeetingActions, useMeetings } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
import { useNewIntent } from '@/lib/new-intent';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { RecordLink } from '@/components/record/RecordLink';
import { ActionControls, ActionStatusTag, MeetingForm, MeetingStatusTag, actionWhen } from '@/components/meetings/MeetingForms';

const KEYS = ['view', 'status', 'mine'] as const;
const MEETING_STATUS = [
  { value: 'all', label: 'All meetings' },
  { value: 'draft', label: 'Drafts' },
  { value: 'issued', label: 'Minutes issued' },
];
const ACTION_STATUS = [
  { value: 'open', label: 'Open actions' },
  { value: 'overdue', label: 'Late' },
  { value: 'done', label: 'Done or dropped' },
  { value: 'all', label: 'All actions' },
];

/**
 * Meetings (v6 item 112): the minutes of each project's meetings, newest first, and the register of the actions they
 * gave out, open ones by due date, so nothing agreed at a meeting is lost before the next one.
 */
function MeetingsPage() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const router = useRouter();
  const canRecord = !!user && canRecordMeetings(user.roleKey);
  const [adding, setAdding] = useState(false);
  useNewIntent('meeting', canRecord, () => setAdding(true));
  const [projectId] = useProjectScope();
  const page = useListPage<'heldOn'>({ keys: KEYS, sortBy: 'heldOn', sortOrder: 'desc', scope: projectId });
  const view = page.filters.view === 'actions' ? 'actions' : 'meetings';
  const mine = page.filters.mine === '1';
  const status = (page.filters.status as string | undefined) ?? (view === 'actions' ? 'open' : 'all');
  const meetings = useMeetings({ status, projectId, q: page.params.q }, view === 'meetings');
  const actions = useMeetingActions({ status, projectId, q: page.params.q, mine }, view === 'actions');
  const q = view === 'meetings' ? meetings : actions;
  const open = (id: string) => router.push(`/meetings/${id}`);
  const sub = (text: React.ReactNode) => (
    <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
      {text}
    </Typography.Text>
  );

  const meetingColumns: ListColumn<MeetingDto>[] = [
    {
      key: 'meeting',
      title: 'Meeting',
      locked: true,
      width: 280,
      card: 'title',
      cardText: (r) => r.title,
      render: (_, r) => (
        <div>
          <RecordLink href={`/meetings/${r.id}`} onOpen={() => open(r.id)} strong>
            {r.title}
          </RecordLink>
          {sub(<span translate="no">{`${r.meetingNo} · ${MEETING_KIND_LABELS[r.kind]}`}</span>)}
        </div>
      ),
    },
    {
      key: 'project',
      title: 'Project',
      width: 170,
      card: 'meta',
      cardText: (r) => `${r.meetingNo} · ${r.projectCode} ${r.projectName}`,
      render: (_, r) => (
        <div translate="no">
          {r.projectCode}
          {sub(r.projectName)}
        </div>
      ),
    },
    {
      key: 'heldOn',
      title: 'Held on',
      width: 130,
      card: 'date',
      cardText: (r) => formatDate(r.heldOn),
      render: (_, r) => (
        <div translate="no">
          {formatDate(r.heldOn)}
          {r.startTime || r.venue ? sub([r.startTime, r.venue].filter(Boolean).join(', ')) : null}
        </div>
      ),
    },
    { key: 'status', title: 'Status', width: 130, render: (_, r) => <MeetingStatusTag status={r.status} /> },
    { key: 'present', title: 'Present', width: 90, align: 'right', render: (_, r) => r.present },
    { key: 'decisions', title: 'Decisions', width: 100, align: 'right', render: (_, r) => r.decisionCount },
    {
      key: 'actions',
      title: 'Actions',
      width: 120,
      align: 'right',
      render: (_, r) => (r.actionCount ? <div>{`${r.openActionCount} of ${r.actionCount} open`}</div> : '-'),
    },
  ];
  const actionColumns: ListColumn<MeetingActionDto>[] = [
    {
      key: 'action',
      title: 'Action',
      locked: true,
      width: 330,
      card: 'title',
      cardText: (a) => a.text,
      render: (_, a) => (
        <div>
          {a.text}
          {a.link ? sub(<span translate="no">{a.link.label}</span>) : null}
          {sub(
            <RecordLink href={`/meetings/${a.meetingId}`} onOpen={() => open(a.meetingId)}>
              <span translate="no">{`${a.meetingNo}, ${formatDate(a.heldOn)}`}</span>
            </RecordLink>,
          )}
        </div>
      ),
    },
    { key: 'owner', title: 'Who', width: 150, card: 'meta', cardText: (a) => `${a.ownerName} · ${a.meetingNo}`, render: (_, a) => <span translate="no">{a.ownerName}</span> },
    {
      key: 'due',
      title: 'By',
      width: 140,
      card: 'status',
      render: (_, a) => (
        <div>
          <span translate="no">{actionWhen(a)}</span>
          <div>
            <ActionStatusTag a={a} />
          </div>
        </div>
      ),
    },
    {
      key: 'project',
      title: 'Project',
      width: 150,
      card: false,
      render: (_, a) => (
        <div translate="no">
          {a.projectCode}
          {sub(a.projectName)}
        </div>
      ),
    },
    { key: 'do', title: 'Update', width: 150, align: 'right', render: (_, a) => <ActionControls a={a} /> },
  ];
  const meetingChoice = useColumnChoice('meetings', meetingColumns);
  const actionChoice = useColumnChoice('meeting-actions', actionColumns);

  const newButton = canRecord ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
      Record meeting
    </Button>
  ) : null;
  const stat = (title: string, value: React.ReactNode, note?: React.ReactNode, tone?: 'danger') => (
    <Col xs={12} lg={6}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={0} formatter={() => value} styles={{ content: { fontSize: token.fontSizeHeading4, color: tone === 'danger' ? token.colorErrorText : undefined } }} />
        {note ? <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{note}</div> : null}
      </Card>
    </Col>
  );
  const ms = meetings.data?.summary;
  const as = actions.data?.summary;
  const filtered = !!page.params.q || (view === 'actions' ? status !== 'open' || mine : status !== 'all');

  return (
    <div className="page-container">
      <PageHeader title="Meetings" subtitle="The minutes of each project's meetings, and the actions they gave out until each is done." extra={newButton} />
      {q.error && <QueryError error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading ? <PageSkeleton header={false} shape="list" /> : null}
      {view === 'meetings' && ms ? (
        <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
          {stat('This month', ms.thisMonth, 'Meetings held since the 1st')}
          {stat('Drafts', ms.drafts, 'Minutes not issued yet')}
          {stat('Open actions', ms.openActions, 'From every meeting')}
          {stat('Late actions', ms.overdueActions, ms.overdueActions ? 'Past their date, still open' : 'None past its date', ms.overdueActions ? 'danger' : undefined)}
        </Row>
      ) : null}
      {view === 'actions' && as ? (
        <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
          {stat('Open', as.open, mine ? 'Yours, from every meeting' : 'From every meeting')}
          {stat('Late', as.overdue, as.overdue ? 'Past their date' : 'None past its date', as.overdue ? 'danger' : undefined)}
          {stat('Due this week', as.dueThisWeek, 'Today and the next 7 days')}
          {stat('Done this month', as.doneThisMonth, 'Since the 1st')}
        </Row>
      ) : null}
      <Card size="small">
        <Tabs
          activeKey={view}
          onChange={(k) => {
            page.setFilter('status', undefined);
            page.setFilter('view', k === 'actions' ? 'actions' : undefined);
          }}
          items={[
            { key: 'meetings', label: 'Meetings' },
            { key: 'actions', label: 'Actions' },
          ]}
        />
        <ListToolbar
          projectId={projectId}
          onProject={() => undefined}
          hideProject
          search={page.search}
          onSearch={page.setSearch}
          searchPlaceholder={view === 'actions' ? 'Search actions, owner or meeting' : 'Search meetings, minutes or actions'}
          searchLabel={view === 'actions' ? 'Search actions' : 'Search meetings'}
        >
          {view === 'actions' ? (
            <>
              <Select aria-label="Actions to show" style={{ width: 170 }} value={status} onChange={(v) => page.setFilter('status', v === 'open' ? undefined : v)} options={ACTION_STATUS} />
              <Segmented
                aria-label="Whose actions"
                value={mine ? 'mine' : 'all'}
                onChange={(v) => page.setFilter('mine', v === 'mine' ? '1' : undefined)}
                options={[
                  { value: 'all', label: 'Everyone' },
                  { value: 'mine', label: 'Mine' },
                ]}
              />
            </>
          ) : (
            <Select aria-label="Meetings to show" style={{ width: 170 }} value={status} onChange={(v) => page.setFilter('status', v === 'all' ? undefined : v)} options={MEETING_STATUS} />
          )}
        </ListToolbar>
        {view === 'meetings' ? (
          <DataTable<MeetingDto>
            columns={meetingColumns}
            visible={meetingChoice.visible}
            onChooseColumns={meetingChoice.setChosen}
            chosenIsDefault={meetingChoice.isDefault}
            rows={meetings.data?.items ?? []}
            loading={meetings.isLoading || meetings.isFetching}
            table={{ pagination: false }}
            onOpen={open}
            empty={{ filtered, clear: () => page.clear(['q', 'status', 'mine']) }}
            failed={!!meetings.error}
            scrollX={1020}
            emptyText={<EmptyArt art="entries" title={page.params.q ? 'No meeting matches the search' : 'No meeting recorded yet'} />}
            emptyAction={newButton}
          />
        ) : (
          <DataTable<MeetingActionDto>
            columns={actionColumns}
            visible={actionChoice.visible}
            onChooseColumns={actionChoice.setChosen}
            chosenIsDefault={actionChoice.isDefault}
            rows={actions.data?.items ?? []}
            loading={actions.isLoading || actions.isFetching}
            table={{ pagination: false }}
            onOpen={(id) => {
              const a = actions.data?.items.find((x) => x.id === id);
              if (a) open(a.meetingId);
            }}
            empty={{ filtered, clear: () => page.clear(['q', 'status', 'mine']) }}
            failed={!!actions.error}
            scrollX={940}
            emptyText={<EmptyArt art="entries" title={page.params.q ? 'No action matches the search' : status === 'open' ? (mine ? 'Nothing open for you' : 'No open action') : 'No action here'} />}
          />
        )}
      </Card>
      <MeetingForm open={adding} onClose={() => setAdding(false)} onSaved={open} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MeetingsPage />
    </Suspense>
  );
}
