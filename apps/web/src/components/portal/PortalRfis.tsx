'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Descriptions, Divider, Drawer, Input, Space, Table, Typography } from 'antd';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PortalRfiDto } from '@erp/shared';
import { isGuest } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAnswerRfiAsClient } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { RecordLink } from '@/components/record/RecordLink';
import { RfiStatusTag, UrgentTag, ageText } from '@/components/documents/rfiUi';

/** The contractor's RFIs on the project: the client's engineer or consultant reads the question and answers it here. */
export function PortalRfis({ rfis, openId, onOpen }: { rfis: UseQueryResult<PortalRfiDto[]>; openId: string | null; onOpen: (id: string | null) => void }) {
  const { data, isLoading, error, refetch } = rfis;
  const open = data?.find((x) => x.id === openId) ?? null;
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<PortalRfiDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        onRow={(r) => ({ onClick: () => onOpen(r.id), style: { cursor: 'pointer' } })}
        locale={{ emptyText: 'No RFIs raised on this project yet' }}
        scroll={{ x: 860 }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        columns={[
          { title: 'No.', dataIndex: 'rfiNo', width: 140, className: 'mono' },
          {
            title: 'Subject',
            dataIndex: 'subject',
            render: (v: string, r) => (
              <div>
                <Space size={6} wrap>
                  <RecordLink onOpen={() => onOpen(r.id)}>{v}</RecordLink>
                  <UrgentTag priority={r.priority} />
                </Space>
                {r.location ? (
                  <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    {r.location}
                  </div>
                ) : null}
              </div>
            ),
          },
          { title: 'Raised', dataIndex: 'raisedOn', width: 110, render: (v: string) => formatDate(v) },
          { title: 'Answer by', dataIndex: 'replyBy', width: 110, render: (v: string, r) => <Typography.Text type={r.age.overdue ? 'danger' : undefined}>{formatDate(v)}</Typography.Text> },
          { title: 'Status', dataIndex: 'status', width: 170, render: (s: PortalRfiDto['status'], r) => <RfiStatusTag status={s} age={r.age} /> },
        ]}
      />
      <PortalRfiDrawer data={open} onClose={() => onOpen(null)} />
    </>
  );
}

/** The answer box: kept per RFI (keyed by its id), so switching RFIs starts empty. */
function AnswerBox({ rfi }: { rfi: PortalRfiDto }) {
  const { message } = App.useApp();
  const answer = useAnswerRfiAsClient();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const save = async () => {
    if (!text.trim()) {
      setProblem('Write your answer first');
      return;
    }
    try {
      await answer.mutateAsync({ id: rfi.id, answer: text.trim() });
      message.success(`Your answer to ${rfi.rfiNo} was sent`);
    } catch (e) {
      setProblem(errorMessage(e));
    }
  };
  return (
    <>
      {problem ? <Alert type="error" showIcon role="alert" style={{ marginBottom: 8 }} title={problem} /> : null}
      <Input.TextArea aria-label="Your answer" rows={5} maxLength={4000} showCount value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer, as an instruction the contractor can act on" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28 }}>
        <Button type="primary" onClick={save} loading={answer.isPending}>
          Send answer
        </Button>
      </div>
    </>
  );
}

function PortalRfiDrawer({ data, onClose }: { data: PortalRfiDto | null; onClose: () => void }) {
  const { user } = useAuth();
  const mayAnswer = !!user && isGuest(user.roleKey) && data?.status === 'OPEN';

  return (
    <Drawer
      open={!!data}
      onClose={onClose}
      size={680}
      destroyOnHidden
      title={
        data ? (
          <Space size={8} wrap>
            <span translate="no">{data.rfiNo}</span>
            <RfiStatusTag status={data.status} age={data.age} />
            <UrgentTag priority={data.priority} />
          </Space>
        ) : (
          'RFI'
        )
      }
    >
      {data && (
        <>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {data.subject}
          </Typography.Title>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{data.question}</Typography.Paragraph>
          {data.proposal ? (
            <Typography.Paragraph>
              <Typography.Text type="secondary">Contractor&apos;s proposal: </Typography.Text>
              <span style={{ whiteSpace: 'pre-wrap' }}>{data.proposal}</span>
            </Typography.Paragraph>
          ) : null}
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'raised', label: 'Raised', children: `${formatDate(data.raisedOn)} by ${data.raisedByName}` },
              { key: 'due', label: 'Answer needed by', children: formatDate(data.replyBy) },
              ...(data.location ? [{ key: 'loc', label: 'Location', span: 2, children: data.location }] : []),
              ...(data.documentLabel ? [{ key: 'doc', label: 'Drawing', span: 2, children: data.documentLabel }] : []),
              ...(data.boqItemLabel ? [{ key: 'boq', label: 'BOQ item', span: 2, children: data.boqItemLabel }] : []),
            ]}
          />
          {data.attachments.length ? (
            <>
              <Divider titlePlacement="start" plain>
                Photos and drawings
              </Divider>
              <AttachmentGallery attachments={data.attachments} />
            </>
          ) : null}
          <Divider titlePlacement="start" plain>
            Answer
          </Divider>
          {data.answer ? (
            <>
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{data.answer}</Typography.Paragraph>
              <Typography.Paragraph type="secondary">
                {data.answeredByName}, {formatDate(data.answeredOn)} · {ageText(data.status, data.age)}
              </Typography.Paragraph>
            </>
          ) : mayAnswer ? (
            <AnswerBox key={data.id} rfi={data} />
          ) : (
            <Typography.Paragraph type="secondary">Not answered yet.</Typography.Paragraph>
          )}
        </>
      )}
    </Drawer>
  );
}
