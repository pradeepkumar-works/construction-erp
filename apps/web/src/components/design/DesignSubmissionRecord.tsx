'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Col, Descriptions, Dropdown, Flex, Row, Space, Statistic, Table, Typography, theme } from 'antd';
import type { MenuProps } from 'antd';
import {
  DESIGN_COMMENT_STATE_LABELS,
  DESIGN_PURPOSE_LABELS,
  DESIGN_SUBMISSION_KIND_LABELS,
  DRAWING_SOURCE_LABELS,
  REVISION_STATUS_LABELS,
  designRevisionLabel,
  isClientSide,
  type DesignCommentDto,
  type DesignCommentState,
  type DesignSubmissionDetailDto,
} from '@erp/shared';
import { useDesignSubmission, useDesignSubmissionAction } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { useNotify } from '@/lib/notify';
import { DISPLAY_FONT } from '@/lib/theme';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AppTag } from '@/components/common/AppTag';
import { CheckCircleOutlined, DeleteOutlined, EditOutlined, MoreOutlined, PrinterOutlined, RedoOutlined, SendOutlined, StopOutlined, WarningOutlined } from '@/components/common/icons';
import { CodeTag, DesignStatusTag, DesignSubmissionForm, RecordCodeDialog, ReplyDialog, SubmitDesignDialog, WithdrawDesignDialog } from './DesignSubmissionForms';

type Dialog = 'edit' | 'submit' | 'code' | 'withdraw' | null;
const COMMENT_TONE: Record<DesignCommentState, 'pending' | 'info' | 'success'> = { OPEN: 'pending', ANSWERED: 'info', CLOSED: 'success' };

/** One design submission (item 138 part 2): what it sends, each round and its code, and the comment resolution sheet. */
export function DesignSubmissionRecord({ id }: { id: string }) {
  const { data, isLoading, error, refetch } = useDesignSubmission(id);
  if (isLoading)
    return (
      <div className="page-container">
        <PageSkeleton shape="record" />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-container">
        <QueryError error={error ?? new Error('Design submission not found')} onRetry={() => refetch()} />
      </div>
    );
  return <SubmissionView s={data} />;
}

function SubmissionView({ s }: { s: DesignSubmissionDetailDto }) {
  const { token } = theme.useToken();
  const router = useRouter();
  const notify = useNotify();
  const act = useDesignSubmissionAction<DesignSubmissionDetailDto>();
  const remove = useDesignSubmissionAction<{ ok: boolean }>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [replying, setReplying] = useState<string | null>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const again = s.rounds.length > 0;
  const vetting = s.purpose === 'VETTING';
  const toAnswer = s.comments.filter((c) => c.state === 'OPEN').length;

  const run = async (path: string, done: string) => {
    try {
      await act.mutateAsync({ path });
      notify.saved(done);
    } catch {
      // the failure notice (FAIL_NOTICE on the mutation) says what went wrong and offers Retry
    }
  };

  const more: MenuProps['items'] = [
    { key: 'print', icon: <PrinterOutlined />, label: 'Print comment sheet', onClick: () => window.print() },
    ...(s.canRecordDelay ? [{ key: 'delay', icon: <WarningOutlined />, label: 'Record as delay', onClick: () => void run(`/design/submissions/${s.id}/delay`, 'Recorded as a delay in the risk register') }] : []),
    ...(s.canWithdraw ? [{ key: 'withdraw', icon: <StopOutlined />, label: 'Withdraw', danger: true, onClick: () => setDialog('withdraw') }] : []),
    ...(s.canEdit && !again
      ? [
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            danger: true,
            label: 'Delete draft',
            onClick: () =>
              askDelete({
                what: `submission ${s.submissionNo}`,
                onConfirm: () => remove.mutateAsync({ method: 'delete', path: `/design/submissions/${s.id}` }),
                onDone: () => router.push('/design-submissions'),
              }),
          },
        ]
      : []),
  ];
  const actions = (
    <Space wrap>
      {s.canRecord ? (
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setDialog('code')}>
          Record code
        </Button>
      ) : null}
      {s.canSubmit ? (
        <Button type="primary" icon={again ? <RedoOutlined /> : <SendOutlined />} onClick={() => setDialog('submit')} disabled={!s.docs.length}>
          {again ? `Resubmit as ${designRevisionLabel(s.revision + 1)}` : vetting ? 'Send for vetting' : 'Submit'}
        </Button>
      ) : null}
      {s.canEdit || s.canSubmit ? (
        <Button icon={<EditOutlined />} onClick={() => setDialog('edit')}>
          Edit
        </Button>
      ) : null}
      <Dropdown menu={{ items: more }} trigger={['click']}>
        <Button icon={<MoreOutlined />} aria-label="More actions" />
      </Dropdown>
    </Space>
  );

  const stat = (title: string, value: React.ReactNode, note?: React.ReactNode, tone?: 'danger') => (
    <Col xs={12} lg={6}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={0} formatter={() => value} styles={{ content: { fontFamily: DISPLAY_FONT, fontSize: token.fontSizeHeading4, color: tone === 'danger' ? token.colorErrorText : undefined } }} />
        {note ? <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{note}</div> : null}
      </Card>
    </Col>
  );
  const last = s.rounds[0];
  const notice =
    s.status === 'REVISE_RESUBMIT' || s.status === 'REJECTED' ? (
      <Alert
        type={s.status === 'REJECTED' ? 'error' : 'warning'}
        showIcon
        title={toAnswer ? `Back with us: answer the ${toAnswer === 1 ? 'comment' : `${toAnswer} comments`}, add the revised drawings to the register, then resubmit.` : 'Back with us: every comment is answered. Add the revised drawings to the register, then resubmit.'}
        style={{ marginBottom: token.marginMD }}
      />
    ) : s.daysLate ? (
      <Alert
        type="error"
        showIcon
        title={`The reply was asked by ${formatDate(s.replyBy!)}, ${s.daysLate} day${s.daysLate === 1 ? '' : 's'} ago.`}
        description={
          s.riskNo ? (
            <span>
              Recorded as delay <Link href={`/risks?id=${s.riskId}`}>{s.riskNo}</Link>.
            </span>
          ) : isClientSide(s.source) ? (
            'Write to the reviewer, and record the wait as a delay from the ⋯ menu so the extension of time runs from it.'
          ) : (
            'Call the reviewer and agree a date.'
          )
        }
        style={{ marginBottom: token.marginMD }}
      />
    ) : null;

  const commentColumns = [
    { title: 'No.', dataIndex: 'commentNo', width: 48, render: (v: number) => <span translate="no">{v}</span> },
    {
      title: 'Reviewer’s comment',
      key: 'text',
      render: (_: unknown, c: DesignCommentDto) => (
        <div>
          <span style={{ whiteSpace: 'pre-wrap' }}>{c.text}</span>
          <Typography.Text type="secondary" translate="no" style={{ display: 'block', fontSize: token.fontSizeSM }}>
            {[c.docNo, designRevisionLabel(c.round)].filter(Boolean).join(' · ')}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Our reply',
      key: 'reply',
      render: (_: unknown, c: DesignCommentDto) =>
        c.reply ? (
          <div>
            <span style={{ whiteSpace: 'pre-wrap' }}>{c.reply}</span>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
              {[c.repliedByName, c.repliedOn ? formatDate(c.repliedOn) : null].filter(Boolean).join(', ')}
            </Typography.Text>
          </div>
        ) : (
          <Typography.Text type="secondary">Not answered yet</Typography.Text>
        ),
    },
    {
      title: 'State',
      key: 'state',
      width: 120,
      render: (_: unknown, c: DesignCommentDto) => <AppTag tone={COMMENT_TONE[c.state]}>{DESIGN_COMMENT_STATE_LABELS[c.state]}</AppTag>,
    },
    ...(s.canReply
      ? [
          {
            title: 'Action',
            key: 'act',
            width: 120,
            className: 'no-print',
            render: (_: unknown, c: DesignCommentDto) =>
              c.state === 'CLOSED' ? (
                <Button size="small" onClick={() => void run(`/design/submissions/${s.id}/comments/${c.id}/reopen`, `Comment ${c.commentNo} opened again`)}>
                  Reopen
                </Button>
              ) : (
                <Flex vertical gap={4} align="start">
                  <Button size="small" type={c.state === 'OPEN' ? 'primary' : 'default'} onClick={() => setReplying(c.id)}>
                    {c.reply ? 'Edit reply' : 'Reply'}
                  </Button>
                  {c.state === 'ANSWERED' ? (
                    <Button size="small" onClick={() => void run(`/design/submissions/${s.id}/comments/${c.id}/close`, `Comment ${c.commentNo} closed`)}>
                      Close
                    </Button>
                  ) : null}
                </Flex>
              ),
          },
        ]
      : []),
  ];

  return (
    <div className="page-container">
      <PageHeader
        title={s.title}
        docTitle={`Design submission ${s.submissionNo}`}
        crumbs={[{ title: 'Design submissions', href: '/design-submissions' }, { title: s.submissionNo }]}
        subtitle={
          <Flex gap={token.marginXS} wrap align="center">
            <DesignStatusTag status={s.status} purpose={s.purpose} daysLate={s.daysLate} />
            <span translate="no">{`${s.submissionNo}${s.status === 'DRAFT' ? '' : ` ${designRevisionLabel(s.revision)}`} · ${DESIGN_SUBMISSION_KIND_LABELS[s.kind]} · ${DESIGN_PURPOSE_LABELS[s.purpose].toLowerCase()} · ${s.projectCode} ${s.projectName}`}</span>
          </Flex>
        }
        extra={actions}
      />
      {notice}
      <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
        {stat('Submitted', s.submittedOn ? <span translate="no">{formatDate(s.submittedOn)}</span> : 'Not yet', again ? `${s.rounds.length} round${s.rounds.length === 1 ? '' : 's'}` : 'A draft')}
        {s.status === 'UNDER_REVIEW'
          ? stat('With the reviewer', `${s.daysOutstanding ?? 0} day${s.daysOutstanding === 1 ? '' : 's'}`, s.replyBy ? `Reply asked by ${formatDate(s.replyBy)}` : undefined, s.daysLate ? 'danger' : undefined)
          : stat('Last code', last?.code ? `Code ${last.code}` : '-', last?.reviewedOn ? `On ${formatDate(last.reviewedOn)}, after ${last.days} day${last.days === 1 ? '' : 's'}` : 'None yet')}
        {stat('Comments to answer', toAnswer, `${s.comments.length} in all, ${s.comments.filter((c) => c.state === 'CLOSED').length} closed`, toAnswer && (s.status === 'REVISE_RESUBMIT' || s.status === 'REJECTED') ? 'danger' : undefined)}
        {vetting ? stat('Vetting', s.certificateNo ? <span translate="no">{s.certificateNo}</span> : 'No certificate yet', s.fee ? `Fee ${formatINR(s.fee)}` : undefined) : stat('Documents', s.docs.length, 'At their current revisions')}
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Flex vertical gap={16}>
            <Card size="small" title={<CardTitle>Comment resolution sheet</CardTitle>}>
              {s.comments.length ? (
                <Table<DesignCommentDto> rowKey="id" size="small" pagination={false} dataSource={s.comments} columns={commentColumns} scroll={{ x: 680 }} />
              ) : (
                <Typography.Text type="secondary">No comment from the reviewer yet.</Typography.Text>
              )}
            </Card>
            <Card size="small" title={<CardTitle>Rounds</CardTitle>}>
              {s.rounds.length ? (
                <Flex vertical>
                  {s.rounds.map((r, i) => (
                    <div key={r.id} style={{ padding: `${token.paddingSM}px 0`, borderTop: i ? `1px solid ${token.colorSplit}` : undefined }}>
                      <Flex gap={8} align="center" wrap justify="space-between">
                        <Typography.Text strong translate="no">{`${designRevisionLabel(r.revision)}, submitted ${formatDate(r.submittedOn)} by ${r.submittedByName}`}</Typography.Text>
                        {r.code ? <CodeTag code={r.code} purpose={s.purpose} /> : <DesignStatusTag status="UNDER_REVIEW" purpose={s.purpose} daysLate={i === 0 ? s.daysLate : null} />}
                      </Flex>
                      <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }} translate="no">
                        {`Sent ${r.sent.map((x) => `${x.docNo} ${x.revision}`).join(', ')}`}
                        {r.letterId ? (
                          <>
                            {' · '}
                            <Link href={`/correspondence/${r.letterId}`}>{r.letterNo ? `Letter ${r.letterNo}` : 'Covering letter (draft)'}</Link>
                          </>
                        ) : null}
                      </Typography.Text>
                      {r.submitNote ? <Typography.Paragraph style={{ margin: `${token.marginXXS}px 0 0` }}>{r.submitNote}</Typography.Paragraph> : null}
                      <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
                        {r.code ? [`Reviewed ${formatDate(r.reviewedOn!)}`, r.reviewerName, r.reviewRef, `${r.days} day${r.days === 1 ? '' : 's'}`].filter(Boolean).join(' · ') : `With the reviewer for ${r.days} day${r.days === 1 ? '' : 's'}`}
                      </Typography.Text>
                    </div>
                  ))}
                </Flex>
              ) : (
                <Typography.Text type="secondary">Not submitted yet. Add the drawings, then submit.</Typography.Text>
              )}
            </Card>
            <Card size="small" title={<CardTitle>{`Files (${s.attachments.length})`}</CardTitle>}>
              {s.attachments.length ? <AttachmentGallery attachments={s.attachments} /> : <Typography.Text type="secondary">No file attached.</Typography.Text>}
            </Card>
          </Flex>
        </Col>
        <Col xs={24} lg={8}>
          <Flex vertical gap={16}>
            <Card size="small" title={<CardTitle>Drawings and documents</CardTitle>}>
              {s.docs.length ? (
                <Flex vertical gap={token.marginXS}>
                  {s.docs.map((d) => (
                    <div key={d.documentId}>
                      <Link href={`/documents?id=${d.documentId}`} className="text-link" translate="no">{`${d.docNo} ${d.title}`}</Link>
                      <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }} translate="no">
                        {d.revision ? `${d.revision}, ${REVISION_STATUS_LABELS[d.revisionStatus!].toLowerCase()}` : 'No revision in the register yet'}
                      </Typography.Text>
                    </div>
                  ))}
                </Flex>
              ) : (
                <Typography.Text type="secondary">None chosen yet.</Typography.Text>
              )}
            </Card>
            <Card size="small" title={<CardTitle>Details</CardTitle>}>
              <Descriptions
                size="small"
                column={1}
                items={[
                  { key: 'to', label: 'To', children: <span translate="no">{s.toParty}</span> },
                  ...(vetting ? [] : [{ key: 'side', label: 'Reviewer’s side', children: DRAWING_SOURCE_LABELS[s.source] }]),
                  ...(s.replyBy ? [{ key: 'reply', label: 'Reply asked by', children: <span translate="no">{formatDate(s.replyBy)}</span> }] : []),
                  ...(s.riskNo ? [{ key: 'delay', label: 'Delay', children: <Link href={`/risks?id=${s.riskId}`}>{s.riskNo}</Link> }] : []),
                  ...(s.note ? [{ key: 'note', label: 'Note', children: <span style={{ whiteSpace: 'pre-wrap' }}>{s.note}</span> }] : []),
                  { key: 'by', label: 'Raised by', children: <span translate="no">{`${s.createdByName}, ${formatDate(s.createdAt.slice(0, 10))}`}</span> },
                ]}
              />
            </Card>
          </Flex>
        </Col>
      </Row>
      <DesignSubmissionForm open={dialog === 'edit'} submission={s} onClose={() => setDialog(null)} />
      {s.canSubmit ? <SubmitDesignDialog submission={s} open={dialog === 'submit'} onClose={() => setDialog(null)} /> : null}
      {s.canRecord ? <RecordCodeDialog submission={s} open={dialog === 'code'} onClose={() => setDialog(null)} /> : null}
      {s.canWithdraw ? <WithdrawDesignDialog submission={s} open={dialog === 'withdraw'} onClose={() => setDialog(null)} /> : null}
      <ReplyDialog submission={s} commentId={replying} onClose={() => setReplying(null)} />
      {deleteDialog}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Typography.Title level={2} style={{ fontSize: token.fontSize, margin: 0 }}>
      {children}
    </Typography.Title>
  );
}
