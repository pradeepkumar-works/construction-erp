'use client';

import React, { useState } from 'react';
import { Button, Checkbox, Descriptions, Drawer, Empty, Flex, Input, Progress, Segmented, Select, Space, Statistic, Table, Tag, Typography, theme } from 'antd';
import type { TableProps } from 'antd';
import { CheckCircleOutlined, DeleteOutlined, PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CloseoutCategory, CloseoutItemDto, DefectDto, DefectPhase, DefectPriority, DefectStatus, HandoverSummaryDto, ProjectMemberDto } from '@erp/shared';
import {
  CLOSEOUT_CATEGORIES,
  CLOSEOUT_CATEGORY_LABELS,
  DEFECT_PHASE_LABELS,
  DEFECT_PRIORITY_LABELS,
  DEFECT_STATUS_LABELS,
  DLP_ALERT_DAYS,
  canCloseDefect,
  canManageHandover,
  canReportDefect,
} from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useDefect, useDefects, useHandover } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { SearchBox } from '@/components/common/SearchBox';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { DefectFormModal, HandoverFormModal, type DefectAction } from './HandoverForms';
import { Section } from '@/components/common/Section';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

const STATUS_COLORS: Record<DefectStatus, string> = { OPEN: 'orange', FIXED: 'blue', CLOSED: 'green' };
const PRIORITY_COLORS: Record<DefectPriority, string> = { LOW: 'default', MEDIUM: 'gold', HIGH: 'red' };
type StatusFilter = 'PENDING' | 'OPEN' | 'FIXED' | 'CLOSED' | 'ALL';

export function DefectStatusTag({ d }: { d: Pick<DefectDto, 'status' | 'overdue'> }) {
  return (
    <Space size={4}>
      <Tag color={STATUS_COLORS[d.status]} style={{ margin: 0 }}>
        {DEFECT_STATUS_LABELS[d.status]}
      </Tag>
      {d.overdue ? (
        <Tag color="red" style={{ margin: 0 }}>
          Overdue
        </Tag>
      ) : null}
    </Space>
  );
}

/** Where the defect liability period stands. */
function DlpTag({ daysLeft }: { daysLeft: number }) {
  if (daysLeft <= 0) return <Tag color="green">DLP over</Tag>;
  return <Tag color={daysLeft <= DLP_ALERT_DAYS ? 'gold' : 'blue'}>{daysLeft} days of DLP left</Tag>;
}

/**
 * A project's handover (v4 item 47): the completion certificate and the defect liability period, snags before handover
 * and defects after, money the client still holds, and the close-out checklist.
 */
export function HandoverPanel({ projectId, members, initialDefectId }: { projectId: string; members: ProjectMemberDto[]; initialDefectId?: string }) {
  const { user } = useAuth();
  const role = user?.roleKey;
  const manager = !!role && canManageHandover(role);
  const reporter = !!role && canReportDefect(role);
  const closer = !!role && canCloseDefect(role);
  const { token } = theme.useToken();
  const qc = useQueryClient();
  const summary = useHandover(projectId);
  const [phase, setPhase] = useState<DefectPhase | 'ALL'>('ALL');
  const [status, setStatus] = useState<StatusFilter>('PENDING');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(initialDefectId ?? null);
  const [action, setAction] = useState<DefectAction | null>(null);
  const [editHandover, setEditHandover] = useState(false);
  const list = useDefects({ projectId, phase: phase === 'ALL' ? undefined : phase, status: status === 'ALL' ? undefined : status, q: q || undefined, page, pageSize: 20 });
  const open = useDefect(openId);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['defects'] });
    qc.invalidateQueries({ queryKey: ['handover', projectId] });
  };
  const removeHandover = useMutation({
    mutationFn: async () => (await api.delete<HandoverSummaryDto>(`/projects/${projectId}/handover`)).data,
    onSuccess: (s) => {
      qc.setQueryData(['handover', projectId], s);
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', projectId] });
    },
    meta: FAIL_NOTICE,
  });
  const removeDefect = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/defects/${id}`)).data,
    onSuccess: () => {
      setOpenId(null);
      refresh();
    },
    meta: FAIL_NOTICE,
  });

  if (summary.isLoading) return <Loading />;
  if (summary.error || !summary.data) return <QueryError error={summary.error ?? new Error('Not found')} onRetry={summary.refetch} />;
  const s = summary.data;
  const h = s.handover;
  const big = { content: { fontSize: token.fontSizeXL } };

  const columns: TableProps<DefectDto>['columns'] = [
    {
      title: 'No.',
      key: 'no',
      width: 150,
      render: (_, d) => (
        <div>
          <b>{d.defectNo}</b>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {DEFECT_PHASE_LABELS[d.phase]}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: 'What and where',
      key: 'what',
      render: (_, d) => (
        <div>
          {d.title}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {[d.location, d.trade].filter(Boolean).join(' · ') || ' '}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      width: 100,
      render: (p: DefectPriority) => (
        <Tag color={PRIORITY_COLORS[p]} style={{ margin: 0 }}>
          {DEFECT_PRIORITY_LABELS[p]}
        </Tag>
      ),
    },
    { title: 'With', key: 'with', width: 180, render: (_, d) => d.contractor ?? d.assignedToName ?? <Typography.Text type="secondary">-</Typography.Text> },
    { title: 'Put right by', dataIndex: 'dueDate', width: 120, render: (v: string | null) => (v ? formatDate(v) : <Typography.Text type="secondary">-</Typography.Text>) },
    { title: '', key: 'status', width: 150, render: (_, d) => <DefectStatusTag d={d} /> },
  ];

  const d = open.data;
  const doneCount = s.checklist.filter((i) => i.doneOn).length;
  return (
    <Flex vertical gap={16} style={{ padding: `0 ${token.paddingSM}px ${token.paddingSM}px` }}>
      <Section
        className="handover-completion"
        title={
          <Space>
            <SafetyCertificateOutlined />
            Completion and defect liability
          </Space>
        }
        extra={
          manager ? (
            <Space>
              <Button size="small" type={h ? 'default' : 'primary'} onClick={() => setEditHandover(true)}>
                {h ? 'Edit' : 'Record completion'}
              </Button>
              {h ? (
                <ConfirmDelete verb="Remove" what="the completion" description="The project goes back to active." notice="Completion removed; the project is active again" onConfirm={() => removeHandover.mutateAsync()}>
                  <Button size="small" type="text" danger>
                    Remove
                  </Button>
                </ConfirmDelete>
              ) : null}
            </Space>
          ) : null
        }
      >
        {h ? (
          <Flex gap={24} wrap align="flex-start">
            <Descriptions size="small" column={{ xs: 1, md: 2 }} style={{ flex: '1 1 420px' }}>
              <Descriptions.Item label="Completed on">{formatDate(h.completedOn)}</Descriptions.Item>
              <Descriptions.Item label="Defect liability">
                <Space wrap size={4}>
                  {h.dlpMonths} months, to {formatDate(h.dlpEndsOn)}
                  <DlpTag daysLeft={h.dlpDaysLeft} />
                </Space>
              </Descriptions.Item>
              {h.certificateNo || h.certificateDate ? (
                <Descriptions.Item label="Certificate">
                  {[h.certificateNo, h.certificateDate ? `dated ${formatDate(h.certificateDate)}` : null].filter(Boolean).join(', ')}
                </Descriptions.Item>
              ) : null}
              {h.certifiedBy ? <Descriptions.Item label="Certified by">{h.certifiedBy}</Descriptions.Item> : null}
              {h.note ? <Descriptions.Item label="Note">{h.note}</Descriptions.Item> : null}
              <Descriptions.Item label="Recorded by">{h.recordedByName}</Descriptions.Item>
            </Descriptions>
            {h.attachments.length ? <AttachmentGallery attachments={h.attachments} size={64} /> : null}
          </Flex>
        ) : (
          <Typography.Text type="secondary">
            Not handed over yet. Log snags below as you walk the site; record the completion certificate when you have it, and the defect liability period
            {s.defectLiabilityMonths ? ` (${s.defectLiabilityMonths} months in the contract)` : ''} starts from its date.
          </Typography.Text>
        )}
      </Section>

      <Flex className="handover-summary" gap={32} wrap style={{ padding: `0 ${token.paddingXS}px` }}>
        <Statistic title="Snags open" value={s.snags.open} suffix={s.snags.fixed ? <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>+{s.snags.fixed} fixed</Typography.Text> : undefined} styles={big} />
        <Statistic
          title="Defects open"
          value={s.defects.open}
          suffix={s.defects.overdue ? <Typography.Text type="danger" style={{ fontSize: token.fontSizeSM }}>{s.defects.overdue} overdue</Typography.Text> : undefined}
          styles={big}
        />
        <Statistic title="Cost of defects" value={formatINR(s.defects.cost)} styles={big} />
        {s.retentionHeld !== null ? <Statistic title="Retention with the client" value={formatINR(s.retentionHeld)} styles={big} /> : null}
        {s.depositHeld !== null ? <Statistic title="Security deposit with the client" value={formatINR(s.depositHeld)} styles={big} /> : null}
      </Flex>

      <Section title="Snags and defects">
        <Flex gap={8} wrap align="center" style={{ paddingBottom: token.paddingSM }}>
          <Segmented<DefectPhase | 'ALL'>
            value={phase}
            onChange={(v) => {
              setPhase(v);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'SNAG', label: 'Snags' },
              { value: 'DEFECT', label: 'Defects (DLP)' },
            ]}
          />
          <Select<StatusFilter>
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            style={{ width: 170 }}
            aria-label="Status"
            options={[
              { value: 'PENDING', label: 'Open or fixed' },
              { value: 'OPEN', label: 'Open' },
              { value: 'FIXED', label: 'Fixed, to check' },
              { value: 'CLOSED', label: 'Closed' },
              { value: 'ALL', label: 'All' },
            ]}
          />
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Number, location, trade"
            width={220}
            aria-label="Search snags and defects"
          />
          <span style={{ flex: 1 }} />
          {reporter ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAction({ kind: 'new' })}>
              {h ? 'Report defect' : 'Report snag'}
            </Button>
          ) : null}
        </Flex>
        {list.error ? (
          <QueryError error={list.error} onRetry={list.refetch} />
        ) : (
          <Table<DefectDto>
            className="defect-table"
            rowKey="id"
            size="middle"
            loading={list.isLoading || list.isFetching}
            dataSource={list.data?.items ?? []}
            columns={columns}
            scroll={{ x: 860 }}
            pagination={{ current: page, pageSize: 20, total: list.data?.total ?? 0, onChange: setPage, hideOnSinglePage: true, showSizeChanger: false }}
            onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={status === 'PENDING' && !q ? 'Nothing open' : 'Nothing matches'} /> }}
          />
        )}
      </Section>

      <CloseoutChecklist projectId={projectId} items={s.checklist} editable={manager} doneCount={doneCount} />

      <Drawer
        open={!!openId}
        onClose={() => setOpenId(null)}
        size={560}
        className="defect-drawer"
        title={d ? `${d.defectNo} ${d.title}` : 'Snag or defect'}
        extra={
          d ? (
            <Space wrap>
              {d.status === 'OPEN' && reporter ? (
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => setAction({ kind: 'fix', defect: d })}>
                  Mark fixed
                </Button>
              ) : null}
              {d.status !== 'CLOSED' && closer ? (
                <Button size="small" type={d.status === 'FIXED' ? 'primary' : 'default'} onClick={() => setAction({ kind: 'close', defect: d })}>
                  {d.status === 'FIXED' ? 'Accept and close' : 'Close'}
                </Button>
              ) : null}
              {d.status !== 'OPEN' && closer ? (
                <Button size="small" onClick={() => setAction({ kind: 'reopen', defect: d })}>
                  Reopen
                </Button>
              ) : null}
              {(d.status === 'OPEN' && reporter) || closer ? (
                <Button size="small" onClick={() => setAction({ kind: 'edit', defect: d })}>
                  Edit
                </Button>
              ) : null}
              {closer ? (
                <ConfirmDelete what={`${d.defectNo} “${d.title}”`} onConfirm={() => removeDefect.mutateAsync(d.id)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Delete" />
                </ConfirmDelete>
              ) : null}
            </Space>
          ) : null
        }
      >
        {open.isLoading ? (
          <Loading />
        ) : open.error ? (
          <QueryError error={open.error} onRetry={open.refetch} />
        ) : d ? (
          <Flex vertical gap={16}>
            <Space wrap>
              <Tag style={{ margin: 0 }}>{DEFECT_PHASE_LABELS[d.phase]}</Tag>
              <Tag color={PRIORITY_COLORS[d.priority]} style={{ margin: 0 }}>
                {DEFECT_PRIORITY_LABELS[d.priority]} priority
              </Tag>
              <DefectStatusTag d={d} />
            </Space>
            <Descriptions column={1} size="small" bordered>
              {d.location ? <Descriptions.Item label="Where">{d.location}</Descriptions.Item> : null}
              {d.trade ? <Descriptions.Item label="Trade">{d.trade}</Descriptions.Item> : null}
              {d.description ? <Descriptions.Item label="Details">{d.description}</Descriptions.Item> : null}
              <Descriptions.Item label="Found">
                {formatDate(d.reportedOn)}
                {d.foundBy ? ` by ${d.foundBy}` : ''}, logged by {d.reportedByName}
              </Descriptions.Item>
              {d.assignedToName ? <Descriptions.Item label="Assigned to">{d.assignedToName}</Descriptions.Item> : null}
              {d.contractor ? <Descriptions.Item label="Subcontractor">{d.contractor}</Descriptions.Item> : null}
              {d.dueDate ? <Descriptions.Item label="Put right by">{formatDate(d.dueDate)}</Descriptions.Item> : null}
              {d.fixedOn ? (
                <Descriptions.Item label="Fixed">
                  {formatDate(d.fixedOn)}
                  {d.fixedByName ? ` by ${d.fixedByName}` : ''}
                  {d.fixNote ? `: ${d.fixNote}` : ''}
                </Descriptions.Item>
              ) : null}
              {d.cost ? <Descriptions.Item label="Cost">{formatINR(d.cost, true)}</Descriptions.Item> : null}
              {d.closedAt ? (
                <Descriptions.Item label="Closed">
                  {formatDate(d.closedAt.slice(0, 10))}
                  {d.closedByName ? ` by ${d.closedByName}` : ''}
                  {d.closeNote ? `: ${d.closeNote}` : ''}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
            <div>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                Photos
              </Typography.Title>
              <AttachmentGallery attachments={d.attachments} size={72} />
            </div>
          </Flex>
        ) : null}
      </Drawer>

      <HandoverFormModal open={editHandover} summary={s} onClose={() => setEditHandover(false)} />
      <DefectFormModal action={action} projectId={projectId} members={members} completed={!!h} onClose={() => setAction(null)} onDone={(id) => setOpenId(id)} />
    </Flex>
  );
}

/** The close-out checklist, by category: tick lines off, add or remove project-specific ones. */
function CloseoutChecklist({ projectId, items, editable, doneCount }: { projectId: string; items: CloseoutItemDto[]; editable: boolean; doneCount: number }) {
  const { token } = theme.useToken();
  const qc = useQueryClient();
  const [adding, setAdding] = useState<{ category: CloseoutCategory; title: string }>({ category: 'SITE', title: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['handover', projectId] });

  const start = useMutation({ mutationFn: async () => (await api.post(`/projects/${projectId}/closeout/defaults`)).data, onSuccess: refresh, meta: FAIL_NOTICE });
  const toggle = useMutation({ mutationFn: async (v: { id: string; done: boolean }) => (await api.patch(`/closeout/${v.id}`, { done: v.done })).data, onSuccess: refresh, meta: FAIL_NOTICE });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete(`/closeout/${id}`)).data, onSuccess: refresh, meta: FAIL_NOTICE });
  const add = useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/closeout`, { category: adding.category, title: adding.title.trim() })).data,
    onSuccess: () => {
      setAdding((a) => ({ ...a, title: '' }));
      refresh();
    },
    meta: FAIL_NOTICE,
  });

  return (
    <Section
      className="closeout-checklist"
      title="Close-out checklist"
      extra={items.length ? <Progress percent={Math.round((doneCount / items.length) * 100)} size="small" style={{ width: 160, margin: 0 }} format={() => `${doneCount}/${items.length}`} aria-label={`Close-out checklist: ${doneCount} of ${items.length} done`} /> : null}
    >
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No checklist yet. It starts with the standard close-out lines when completion is recorded.">
          {editable ? (
            <Button onClick={() => start.mutate()} loading={start.isPending}>
              Start the checklist now
            </Button>
          ) : null}
        </Empty>
      ) : (
        <Flex vertical gap={12}>
          {CLOSEOUT_CATEGORIES.filter((c) => items.some((i) => i.category === c)).map((c) => (
            <div key={c}>
              <Typography.Text strong>{CLOSEOUT_CATEGORY_LABELS[c]}</Typography.Text>
              <Flex vertical gap={4} style={{ marginTop: token.marginXXS }}>
                {items
                  .filter((i) => i.category === c)
                  .map((i) => (
                    <Flex key={i.id} align="center" gap={8} className="closeout-item">
                      <Checkbox checked={!!i.doneOn} disabled={!editable} onChange={(e) => toggle.mutate({ id: i.id, done: e.target.checked })}>
                        <Typography.Text delete={!!i.doneOn} type={i.doneOn ? 'secondary' : undefined}>
                          {i.title}
                        </Typography.Text>
                      </Checkbox>
                      {i.doneOn ? (
                        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                          {formatDate(i.doneOn)}
                          {i.doneByName ? `, ${i.doneByName}` : ''}
                        </Typography.Text>
                      ) : null}
                      <span style={{ flex: 1 }} />
                      {editable ? (
                        <ConfirmDelete verb="Remove" what={`“${i.title}” from the checklist`} notice={`“${i.title}” removed`} onConfirm={() => remove.mutateAsync(i.id)}>
                          <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={`Remove ${i.title}`} />
                        </ConfirmDelete>
                      ) : null}
                    </Flex>
                  ))}
              </Flex>
            </div>
          ))}
          {editable ? (
            <Space.Compact style={{ maxWidth: 560 }}>
              <Select<CloseoutCategory>
                value={adding.category}
                onChange={(category) => setAdding((a) => ({ ...a, category }))}
                style={{ width: 150 }}
                aria-label="Category"
                options={CLOSEOUT_CATEGORIES.map((c) => ({ value: c, label: CLOSEOUT_CATEGORY_LABELS[c] }))}
              />
              <Input
                value={adding.title}
                onChange={(e) => setAdding((a) => ({ ...a, title: e.target.value }))}
                onPressEnter={() => adding.title.trim() && add.mutate()}
                placeholder="Add a line, e.g. Borrow pits levelled"
                maxLength={200}
                aria-label="New checklist line"
              />
              <Button onClick={() => add.mutate()} disabled={!adding.title.trim()} loading={add.isPending}>
                Add
              </Button>
            </Space.Compact>
          ) : null}
        </Flex>
      )}
    </Section>
  );
}
