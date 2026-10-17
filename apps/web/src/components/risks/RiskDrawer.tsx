'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Descriptions, Divider, Drawer, Input, Modal, Popconfirm, Skeleton, Space, Timeline, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RiskDto } from '@erp/shared';
import { DELAY_PARTY_LABELS, RISK_CATEGORY_LABELS, RISK_RATING_LABELS, canApprove, canEditRisk, canViewLetters, LETTER_DIRECTION_LABELS } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLetters, useRisk, useRiskHistory } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { KindTag, RiskStatusTag, ScoreTag } from './riskUi';
import { themeColor, themeFontSize } from '@/lib/theme';

const HISTORY_COLORS: Record<string, string> = { CREATED: 'gray', UPDATED: 'blue', CLOSED: 'green', REOPENED: 'orange', DELETED: 'red' };

export function RiskDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit: (r: RiskDto) => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useRisk(id ?? undefined);
  const { data: history } = useRiskHistory(id ?? undefined);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState('');
  const mayEdit = !!user && !!data && canEditRisk(user, data);
  const seesLetters = !!user && canViewLetters(user.roleKey);
  const { data: letters } = useLetters({ riskId: id ?? undefined, pageSize: 50, sortBy: 'letterDate', sortOrder: 'asc' }, open && !!id && seesLetters);

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.patch<RiskDto>(`/risks/${id}`, body)).data,
    onSuccess: (r) => {
      message.success(r.status === 'CLOSED' ? `${r.riskNo} closed` : `${r.riskNo} reopened`);
      qc.invalidateQueries({ queryKey: ['risks'] });
      setClosing(false);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/risks/${id}`)).data,
    onSuccess: () => {
      message.success('Entry deleted');
      qc.invalidateQueries({ queryKey: ['risks'] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={660}
      title={
        data ? (
          <Space>
            {data.riskNo} <KindTag kind={data.kind} /> <RiskStatusTag status={data.status} />
          </Space>
        ) : (
          'Register entry'
        )
      }
      extra={
        data && mayEdit ? (
          <Space wrap>
            <Button size="small" onClick={() => onEdit(data)}>
              Update
            </Button>
            {data.status === 'CLOSED' ? (
              <Button size="small" loading={patch.isPending} onClick={() => patch.mutate({ status: 'OPEN' })}>
                Reopen
              </Button>
            ) : (
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  setNote('');
                  setClosing(true);
                }}
              >
                Close
              </Button>
            )}
            {user && canApprove(user.roleKey) ? (
              <Popconfirm title="Delete this entry?" description="Only for an entry raised by mistake. A resolved one should be closed." onConfirm={() => remove.mutate()}>
                <Button size="small" danger loading={remove.isPending}>
                  Delete
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : null
      }
      destroyOnHidden
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {data.title}
          </Typography.Title>
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'project', label: 'Project', children: data.projectName, span: 2 },
              { key: 'cat', label: 'Category', children: RISK_CATEGORY_LABELS[data.category] },
              { key: 'activity', label: 'Activity', children: data.activityName ?? '-' },
              ...(data.description ? [{ key: 'desc', label: 'Details', children: data.description, span: 2 }] : []),
              {
                key: 'score',
                label: 'Score',
                span: 2,
                children: (
                  <Space>
                    <ScoreTag r={data} />
                    <span className="text-muted">
                      probability {data.probability} ({RISK_RATING_LABELS[data.probability]}) × impact {data.impact} ({RISK_RATING_LABELS[data.impact]})
                    </span>
                  </Space>
                ),
              },
              ...(data.kind === 'DELAY'
                ? [
                    { key: 'from', label: 'Held up since', children: formatDate(data.delayStart) },
                    { key: 'to', label: 'Resumed on', children: data.delayEnd ? formatDate(data.delayEnd) : <Typography.Text type="danger">still held up</Typography.Text> },
                    { key: 'days', label: 'Days lost', children: <strong>{data.daysLost ?? 0}</strong> },
                    { key: 'party', label: 'Caused by', children: data.responsibleParty ? DELAY_PARTY_LABELS[data.responsibleParty] : '-' },
                    { key: 'eot', label: 'Extension of time', children: data.eotGrantedDays !== null ? `${data.eotGrantedDays} days granted` : data.eotClaimed ? 'Claimed' : 'Not claimed', span: 2 },
                  ]
                : []),
              { key: 'mit', label: data.kind === 'DELAY' ? 'Action' : 'Mitigation', children: data.mitigation ?? '-', span: 2 },
              { key: 'owner', label: 'Owner', children: data.ownerName ?? '-' },
              {
                key: 'due',
                label: 'Due',
                children: data.dueDate ? <span style={data.overdue ? { color: themeColor('colorErrorText'), fontWeight: 600 } : undefined}>{formatDate(data.dueDate)}{data.overdue ? ' (overdue)' : ''}</span> : '-',
              },
              { key: 'raised', label: 'Raised by', children: `${data.raisedByName}, ${formatDateTime(data.createdAt)}`, span: 2 },
              ...(data.status === 'CLOSED' ? [{ key: 'closed', label: 'Closed', children: `${formatDateTime(data.closedAt)}${data.closureNote ? `: ${data.closureNote}` : ''}`, span: 2 }] : []),
            ]}
          />
          <Divider titlePlacement="start" plain>
            Photos / letters ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
          {seesLetters ? (
            <>
              <Divider titlePlacement="start" plain>
                Correspondence ({letters?.total ?? 0})
              </Divider>
              {letters?.items.length ? (
                letters.items.map((l) => (
                  <div key={l.id} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
                    <span className="text-muted" style={{ width: 90, flex: 'none' }}>
                      {formatDate(l.letterDate)}
                    </span>
                    <Link href={`/documents?tab=letters&letter=${l.id}`} className="text-link" style={{ flex: 'none' }}>
                      {l.letterNo}
                    </Link>
                    <span>
                      {LETTER_DIRECTION_LABELS[l.direction]}: {l.subject}
                    </span>
                  </div>
                ))
              ) : (
                <Typography.Text type="secondary">No letters linked. Link hindrance notices and extension claims from Documents → Letters.</Typography.Text>
              )}
            </>
          ) : null}
          <Divider titlePlacement="start" plain>
            History
          </Divider>
          <Timeline
            items={(history ?? []).map((h) => ({
              key: h.id,
              color: HISTORY_COLORS[h.action] ?? 'blue',
              content: (
                <div>
                  <Typography.Text strong>{h.action.charAt(0) + h.action.slice(1).toLowerCase()}</Typography.Text> <Typography.Text type="secondary">by {h.actorName}</Typography.Text>
                  <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    {formatDateTime(h.createdAt)}
                  </div>
                  {h.note && <div style={{ marginTop: 2 }}>&ldquo;{h.note}&rdquo;</div>}
                </div>
              ),
            }))}
          />
        </>
      )}
      <Modal
        open={closing}
        title={data ? `Close ${data.riskNo}` : 'Close'}
        okText="Close entry"
        onCancel={() => setClosing(false)}
        okButtonProps={{ disabled: !note.trim() }}
        confirmLoading={patch.isPending}
        onOk={() => patch.mutate({ status: 'CLOSED', closureNote: note.trim() })}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          {data?.kind === 'DELAY' && !data.delayEnd ? 'The delay will be recorded as ending today. Use Update to give another date. ' : ''}How was it resolved?
        </Typography.Paragraph>
        <Input.TextArea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </Modal>
    </Drawer>
  );
}
