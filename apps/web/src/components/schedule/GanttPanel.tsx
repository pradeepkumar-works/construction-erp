'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Checkbox, Dropdown, Form, Input, Modal, Segmented, Space, Statistic, Table } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import { CheckOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FlagOutlined, LockOutlined, PlusOutlined, UploadOutlined } from '@/components/common/icons';
import type { GanttActivityDto, MilestoneDto, MilestoneState, ScheduleFileFormat } from '@erp/shared';
import { MILESTONE_STATE_LABELS, SCHEDULE_FILE_FORMAT_LABELS, SCHEDULE_FILE_FORMATS, canEditProjects, canFreezeBaseline } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useGantt, useScheduleAction } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { themeColor, themeFontSize } from '@/lib/theme';
import { GanttChart, GanttLegend, type GanttScale } from './GanttChart';
import { MilestoneFormModal } from './MilestoneFormModal';
import { ImportScheduleModal, LinksDrawer, exportSchedule } from './ScheduleLinks';
import { AskButton } from '@/components/ai/AskButton';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

const MILESTONE_COLORS: Record<MilestoneState, string> = { UPCOMING: 'blue', DUE_SOON: 'orange', MISSED: 'red', ACHIEVED: 'green', ACHIEVED_LATE: 'gold' };
const big = { content: { fontSize: themeFontSize('fontSizeXL') } };

const moved = (days: number | null) =>
  days === null ? <span className="text-muted">-</span> : days === 0 ? <span className="text-muted">none</span> : <span className={days > 0 ? 'text-danger' : undefined}>{days > 0 ? `${days} days later` : `${-days} days earlier`}</span>;

/**
 * Schedule tab of a project (v4 item 43): the Gantt of milestones and activities against the frozen baseline, the
 * milestone list, and freezing the baseline. Links between activities give the critical path and float (v6 item 114):
 * an activity's row opens its links, activities planned before their links allow can be moved in one go, and the plan
 * goes out to and comes in from MS Project and Primavera.
 */
export function GanttPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useGantt(projectId);
  const [scale, setScale] = useState<GanttScale>('month');
  const [showBaseline, setShowBaseline] = useState(true);
  const [form, setForm] = useState<{ milestone: MilestoneDto | null; achieving?: boolean } | null>(null);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [note, setNote] = useState('');
  const [linksOf, setLinksOf] = useState<GanttActivityDto | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const notify = useNotify();
  const schedule = useScheduleAction<{ moved: { id: string; name: string; from: string; to: string }[] }>(projectId);
  const editor = !!user && canEditProjects(user.roleKey);
  const freezer = !!user && canFreezeBaseline(user.roleKey);

  const freeze = useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/baseline`, { note: note.trim() || null })).data,
    onSuccess: () => {
      message.success('Baseline frozen');
      setFreezeOpen(false);
      setNote('');
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/projects/${projectId}/milestones/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
    },
    meta: FAIL_NOTICE,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  const s = data.summary;
  const conflicts = data.activities.filter((a) => a.linkStartsOn);
  const download = (format: ScheduleFileFormat): Promise<unknown> => exportSchedule(projectId, format).catch((e) => notify.failed(e, () => download(format), 'The schedule could not be saved'));

  const columns: TableProps<MilestoneDto>['columns'] = [
    { title: 'Milestone', dataIndex: 'name', render: (v, r) => (
      <div>
        <b>{v}</b>
        {r.note ? <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{r.note}</div> : null}
      </div>
    ) },
    { title: 'Due on', dataIndex: 'dueDate', width: 120, render: (v) => formatDate(v) },
    ...(data.baselineAt ? [{ title: 'Baseline', dataIndex: 'baselineDate', width: 120, render: (v: string | null) => (v ? formatDate(v) : <span className="text-muted">not in baseline</span>) }, { title: 'Moved', dataIndex: 'slipDays', width: 130, render: (v: number | null) => moved(v) }] : []),
    { title: 'Achieved on', dataIndex: 'achievedOn', width: 120, render: (v) => (v ? formatDate(v) : <span className="text-muted">-</span>) },
    { title: 'State', dataIndex: 'state', width: 120, render: (v: MilestoneState) => <AppTag color={MILESTONE_COLORS[v]}>{MILESTONE_STATE_LABELS[v]}</AppTag> },
    ...(editor
      ? [
          {
            title: '',
            key: 'a',
            width: 170,
            render: (_: unknown, r: MilestoneDto) => (
              <Space size={4}>
                {!r.achievedOn ? (
                  <Button size="small" icon={<CheckOutlined />} onClick={() => setForm({ milestone: r, achieving: true })}>
                    Achieved
                  </Button>
                ) : null}
                <Button size="small" type="text" aria-label="Edit" icon={<EditOutlined />} onClick={() => setForm({ milestone: r })} />
                <ConfirmDelete what={`milestone “${r.name}”`} onConfirm={() => remove.mutateAsync(r.id)}>
                  <Button size="small" type="text" danger aria-label="Delete" icon={<DeleteOutlined />} />
                </ConfirmDelete>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="gantt-panel">
      <div className="schedule-summary" style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 12 }}>
        <Statistic title="Planned finish" value={formatDate(s.plannedFinish)} styles={big} />
        {data.baselineAt ? (
          <Statistic
            title="Against the baseline"
            value={s.finishSlipDays === null ? '-' : s.finishSlipDays === 0 ? 'On time' : s.finishSlipDays > 0 ? `${s.finishSlipDays} days late` : `${-s.finishSlipDays} days early`}
            styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: (s.finishSlipDays ?? 0) > 0 ? themeColor('colorErrorText') : undefined } }}
          />
        ) : null}
        <div>
          <Statistic title="Behind plan / past end" value={`${s.behind} / ${s.late}`} styles={big} />
          {s.behind + s.late > 0 ? <AskButton size="small" type="link" style={{ paddingInline: 0 }} label="Explain" aria-label="Explain why activities are behind" question="Why are activities behind plan on this project?" /> : null}
        </div>
        {data.baselineAt ? <Statistic title="Activities slipped" value={s.slipped} suffix={<span style={{ fontSize: themeFontSize('fontSizeSM') }}>of {s.scheduled}</span>} styles={big} /> : null}
        {s.links ? (
          <Statistic title="Critical activities" value={s.critical} suffix={<span style={{ fontSize: themeFontSize('fontSizeSM') }}>of {s.scheduled}, {s.links} links</span>} styles={big} />
        ) : null}
        <Statistic title="Milestones achieved" value={s.milestonesAchieved} suffix={<span style={{ fontSize: themeFontSize('fontSizeSM') }}>of {s.milestones}{s.milestonesMissed ? `, ${s.milestonesMissed} missed` : ''}</span>} styles={big} />
      </div>

      <Alert
        className="baseline-info"
        type={data.baselineAt ? 'info' : 'warning'}
        showIcon
        icon={<LockOutlined />}
        style={{ marginBottom: 12 }}
        title={
          data.baselineAt
            ? `Baseline frozen ${formatDateTime(data.baselineAt)}${data.baselineByName ? ` by ${data.baselineByName}` : ''}${data.baselineNote ? `: ${data.baselineNote}` : ''}`
            : 'No baseline yet. Freeze one once the programme is agreed, and every later change to the plan shows against it.'
        }
        description={data.baselineAt && s.notInBaseline ? `${s.notInBaseline} ${s.notInBaseline === 1 ? 'activity was' : 'activities were'} added after it and ${s.notInBaseline === 1 ? 'has' : 'have'} no baseline dates.` : undefined}
        action={
          freezer ? (
            <Button size="small" onClick={() => setFreezeOpen(true)}>
              {data.baselineAt ? 'Re-baseline' : 'Freeze baseline'}
            </Button>
          ) : undefined
        }
      />

      {s.linkConflicts ? (
        <Alert
          className="link-conflicts"
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title={`${s.linkConflicts} ${s.linkConflicts === 1 ? 'activity is' : 'activities are'} planned to start before ${s.linkConflicts === 1 ? 'its' : 'their'} links allow${s.networkFinish && s.plannedFinish && s.networkFinish > s.plannedFinish ? `: the links put the finish at ${formatDate(s.networkFinish)}, not ${formatDate(s.plannedFinish)}` : ''}.`}
          description={conflicts.slice(0, 3).map((a) => `${a.name} (from ${formatDate(a.linkStartsOn)})`).join(', ') + (conflicts.length > 3 ? ` and ${conflicts.length - 3} more` : '')}
          action={
            editor ? (
              <Button size="small" onClick={() => setMoveOpen(true)}>
                Move them
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <Space wrap>
          <Segmented<GanttScale> value={scale} onChange={setScale} options={[{ value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }]} />
          {data.baselineAt ? (
            <Checkbox checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)}>
              Show baseline
            </Checkbox>
          ) : null}
        </Space>
        <Space wrap>
          <Dropdown menu={{ items: SCHEDULE_FILE_FORMATS.map((f) => ({ key: f, label: SCHEDULE_FILE_FORMAT_LABELS[f] })), onClick: ({ key }) => void download(key as ScheduleFileFormat) }}>
            <Button icon={<DownloadOutlined />}>Export</Button>
          </Dropdown>
          {editor ? (
            <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
              Import
            </Button>
          ) : null}
          {editor ? (
            <Button icon={<PlusOutlined />} onClick={() => setForm({ milestone: null })}>
              New milestone
            </Button>
          ) : null}
        </Space>
      </div>
      <GanttChart data={data} scale={scale} showBaseline={showBaseline && !!data.baselineAt} onMilestone={editor ? (m) => setForm({ milestone: m }) : undefined} onActivity={setLinksOf} />
      <GanttLegend showBaseline={showBaseline && !!data.baselineAt} linked={s.links > 0} />

      <h4 style={{ margin: '20px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <FlagOutlined /> Milestones
      </h4>
      <Table<MilestoneDto> className="milestone-table" rowKey="id" size="small" pagination={false} columns={columns} dataSource={data.milestones} scroll={{ x: 800 }} locale={{ emptyText: 'No milestones yet' }} />

      <LinksDrawer projectId={projectId} data={data} activity={linksOf} editor={editor} onClose={() => setLinksOf(null)} />
      {editor && importOpen ? <ImportScheduleModal projectId={projectId} open onClose={() => setImportOpen(false)} /> : null}
      <Modal
        open={moveOpen}
        title="Move activities to the dates their links allow"
        okText={`Move ${conflicts.length} ${conflicts.length === 1 ? 'activity' : 'activities'}`}
        onCancel={() => setMoveOpen(false)}
        onOk={async () => {
          const r = await schedule.mutateAsync({ path: '/schedule/apply-links' }).catch((e) => {
            notify.failed(e);
            return null;
          });
          if (!r) return;
          setMoveOpen(false);
          notify.saved(`${r.moved.length} ${r.moved.length === 1 ? 'activity' : 'activities'} moved`);
        }}
        confirmLoading={schedule.isPending}
        destroyOnHidden
      >
        <p>Each keeps its length and starts on the first day its links allow. Activities already started stay where they are. The audit log keeps the old dates.</p>
        <Table<GanttActivityDto>
          size="small"
          rowKey="id"
          pagination={false}
          scroll={{ y: 260 }}
          dataSource={conflicts}
          columns={[
            { title: 'Activity', dataIndex: 'name' },
            { title: 'Planned start', dataIndex: 'plannedStart', width: 120, render: (v) => formatDate(v) },
            { title: 'Moves to', dataIndex: 'linkStartsOn', width: 120, render: (v) => formatDate(v) },
          ]}
        />
      </Modal>
      <MilestoneFormModal open={!!form} onClose={() => setForm(null)} projectId={projectId} milestone={form?.milestone} achieving={form?.achieving} />
      <Modal
        open={freezeOpen}
        title={data.baselineAt ? 'Replace the baseline' : 'Freeze the baseline'}
        okText={data.baselineAt ? 'Replace baseline' : 'Freeze baseline'}
        onCancel={() => setFreezeOpen(false)}
        onOk={() => freeze.mutate()}
        confirmLoading={freeze.isPending}
        destroyOnHidden
      >
        <p>
          Today&apos;s planned dates of every activity and the due date of every milestone become the baseline.
          {data.baselineAt ? ` The baseline frozen ${formatDate(data.baselineAt)} is replaced; the audit log keeps who changed it and when.` : ''}
        </p>
        <Form layout="vertical">
          <Form.Item label="Note" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Revised programme approved by the client" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
