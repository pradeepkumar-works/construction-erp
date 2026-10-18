'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Checkbox, Form, Input, Modal, Popconfirm, Segmented, Space, Statistic, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined, FlagOutlined, LockOutlined, PlusOutlined } from '@ant-design/icons';
import type { MilestoneDto, MilestoneState } from '@erp/shared';
import { MILESTONE_STATE_LABELS, canEditProjects, canFreezeBaseline } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGantt } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { themeColor, themeFontSize } from '@/lib/theme';
import { GanttChart, GanttLegend, type GanttScale } from './GanttChart';
import { MilestoneFormModal } from './MilestoneFormModal';
import { AskButton } from '@/components/ai/AskButton';

const MILESTONE_COLORS: Record<MilestoneState, string> = { UPCOMING: 'blue', DUE_SOON: 'orange', MISSED: 'red', ACHIEVED: 'green', ACHIEVED_LATE: 'gold' };
const big = { content: { fontSize: themeFontSize('fontSizeXL') } };

const moved = (days: number | null) =>
  days === null ? <span className="text-muted">-</span> : days === 0 ? <span className="text-muted">none</span> : <span className={days > 0 ? 'text-danger' : undefined}>{days > 0 ? `${days} days later` : `${-days} days earlier`}</span>;

/**
 * Schedule tab of a project (v4 item 43): the Gantt of milestones and activities against the frozen baseline, the
 * milestone list, and freezing the baseline. Dependencies and the critical path come later.
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
    onError: (err) => message.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/projects/${projectId}/milestones/${id}`),
    onSuccess: () => {
      message.success('Milestone deleted');
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  const s = data.summary;

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
    { title: 'State', dataIndex: 'state', width: 120, render: (v: MilestoneState) => <Tag color={MILESTONE_COLORS[v]}>{MILESTONE_STATE_LABELS[v]}</Tag> },
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
                <Popconfirm title="Delete this milestone?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(r.id)}>
                  <Button size="small" type="text" danger aria-label="Delete" icon={<DeleteOutlined />} />
                </Popconfirm>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <Space wrap>
          <Segmented<GanttScale> value={scale} onChange={setScale} options={[{ value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }]} />
          {data.baselineAt ? (
            <Checkbox checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)}>
              Show baseline
            </Checkbox>
          ) : null}
        </Space>
        {editor ? (
          <Button icon={<PlusOutlined />} onClick={() => setForm({ milestone: null })}>
            New milestone
          </Button>
        ) : null}
      </div>
      <GanttChart data={data} scale={scale} showBaseline={showBaseline && !!data.baselineAt} onMilestone={editor ? (m) => setForm({ milestone: m }) : undefined} />
      <GanttLegend showBaseline={showBaseline && !!data.baselineAt} />

      <h4 style={{ margin: '20px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <FlagOutlined /> Milestones
      </h4>
      <Table<MilestoneDto> className="milestone-table" rowKey="id" size="small" pagination={false} columns={columns} dataSource={data.milestones} scroll={{ x: 800 }} locale={{ emptyText: 'No milestones yet' }} />

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
