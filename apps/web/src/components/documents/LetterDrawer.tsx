'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Descriptions, Divider, Drawer, Skeleton, Space, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, RollbackOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LetterRefDto } from '@erp/shared';
import { LETTER_DIRECTION_LABELS, canApprove } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useLetter } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { LetterFormModal, type LetterPrefill } from './LetterFormModal';
import { RecordLink } from '@/components/record/RecordLink';
import { themeFontSize } from '@/lib/theme';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

export const DirectionTag = ({ direction }: { direction: LetterRefDto['direction'] }) => (
  <Tag color={direction === 'IN' ? 'blue' : 'purple'} style={{ margin: 0 }}>
    {LETTER_DIRECTION_LABELS[direction]}
  </Tag>
);

/** A letter with what it answers and its replies; "Reply" records the answer linked to it (and to the same delay). */
export function LetterDrawer({ id, open, onClose, onOpen }: { id: string | null; open: boolean; onClose: () => void; onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useLetter(id ?? undefined);
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState<LetterPrefill | null>(null);
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/letters/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });
  const ref = (l: LetterRefDto) => (
    <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <DirectionTag direction={l.direction} />
      <span style={{ whiteSpace: 'nowrap' }}>
        <RecordLink onOpen={() => onOpen(l.id)}>{l.letterNo}</RecordLink>
      </span>
      <span className="text-muted" style={{ whiteSpace: 'nowrap' }}>
        {formatDate(l.letterDate)}
      </span>
      <span>{l.subject}</span>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={680}
      title={
        data ? (
          <span>
            {data.letterNo} <DirectionTag direction={data.direction} />
          </span>
        ) : (
          'Letter'
        )
      }
      extra={
        data ? (
          <Space>
            {data.direction === 'IN' ? (
              <Button
                size="small"
                type={data.awaitingReply ? 'primary' : 'default'}
                icon={<RollbackOutlined />}
                onClick={() => setReply({ projectId: data.projectId, direction: 'OUT', party: data.party, subject: `Re: ${data.subject}`, inReplyToId: data.id, riskId: data.riskId })}
              >
                Reply
              </Button>
            ) : null}
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} aria-label="Edit letter" />
            {user && (data.createdById === user.id || canApprove(user.roleKey)) ? (
              <ConfirmDelete what={`letter ${data.letterNo}`} onConfirm={() => remove.mutateAsync()}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete letter" />
              </ConfirmDelete>
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
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'subject', label: 'Subject', children: data.subject, span: 2 },
              { key: 'party', label: data.direction === 'IN' ? 'From' : 'To', children: data.party, span: 2 },
              { key: 'date', label: 'Dated', children: formatDate(data.letterDate) },
              { key: 'ref', label: data.direction === 'IN' ? 'Their reference' : 'Our reference', children: data.theirRef ?? '-' },
              { key: 'project', label: 'Project', children: data.projectName, span: 2 },
              ...(data.direction === 'IN'
                ? [
                    {
                      key: 'reply',
                      label: 'Reply needed by',
                      span: 2,
                      children: data.replyBy ? (
                        <span className={data.overdue ? 'text-danger' : undefined}>
                          {formatDate(data.replyBy)}
                          {data.awaitingReply ? (data.overdue ? ' (overdue)' : ' (not replied)') : ' (replied)'}
                        </span>
                      ) : (
                        'No reply needed'
                      ),
                    },
                  ]
                : []),
              ...(data.riskNo ? [{ key: 'risk', label: 'Delay / risk', span: 2, children: <Link href={`/risks?id=${data.riskId}`}>{`${data.riskNo} ${data.riskTitle}`}</Link> }] : []),
              ...(data.summary ? [{ key: 'summary', label: 'Gist', span: 2, children: <span style={{ whiteSpace: 'pre-wrap' }}>{data.summary}</span> }] : []),
              { key: 'by', label: 'Recorded by', children: data.createdByName, span: 2 },
            ]}
          />
          {data.inReplyTo || data.replies.length ? (
            <>
              <Divider titlePlacement="start" plain>
                Thread
              </Divider>
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                {data.inReplyTo ? (
                  <div>
                    <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                      In reply to
                    </div>
                    {ref(data.inReplyTo)}
                  </div>
                ) : null}
                {data.replies.length ? (
                  <div>
                    <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                      Replies
                    </div>
                    {data.replies.map(ref)}
                  </div>
                ) : null}
              </Space>
            </>
          ) : null}
          <Divider titlePlacement="start" plain>
            Scanned letter ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
        </>
      )}
      <LetterFormModal open={editing} onClose={() => setEditing(false)} letter={data} />
      <LetterFormModal open={!!reply} onClose={() => setReply(null)} prefill={reply} onSaved={(l) => onOpen(l.id)} />
    </Drawer>
  );
}
