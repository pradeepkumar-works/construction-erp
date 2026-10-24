'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Alert, Button, Card, Col, Descriptions, Dropdown, Flex, Row, Space, Statistic, Typography, theme } from 'antd';
import type { MenuProps } from 'antd';
import { CheckCircleOutlined, DeleteOutlined, EditOutlined, MoreOutlined, RedoOutlined, SendOutlined, StopOutlined } from '@/components/common/icons';
import { MATERIAL_APPROVAL_KIND_LABELS, revisionLabel, type MaterialApprovalDetailDto } from '@erp/shared';
import { useMaterialApproval, useMaterialApprovalAction } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { MaterialApprovalForm, MaterialApprovalStatusTag, OutcomeTag, ReviewDialog, SubmitDialog, WithdrawDialog } from '@/components/material-approvals/MaterialApprovalForms';
import { CommentsCard } from '@/components/comments/CommentsSection';

/**
 * One material approval request (v6 item 113): what is asked for, each revision sent to the reviewer with the outcome
 * and comments that came back, and the files. From here it is submitted, its outcome recorded, resubmitted or withdrawn.
 */
export default function MaterialApprovalPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useMaterialApproval(params?.id);
  if (isLoading)
    return (
      <div className="page-container">
        <PageSkeleton shape="record" />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-container">
        <QueryError error={error ?? new Error('Request not found')} onRetry={() => refetch()} />
      </div>
    );
  return <ApprovalView a={data} />;
}

type Dialog = 'edit' | 'submit' | 'review' | 'withdraw' | null;

function ApprovalView({ a }: { a: MaterialApprovalDetailDto }) {
  const { token } = theme.useToken();
  const router = useRouter();
  const act = useMaterialApprovalAction<{ ok: boolean }>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const current = a.revisions[0];
  const decided = a.revisions.filter((r) => r.outcome);

  const more: MenuProps['items'] = [
    ...(a.canWithdraw ? [{ key: 'withdraw', icon: <StopOutlined />, label: 'Withdraw', danger: true, onClick: () => setDialog('withdraw') }] : []),
    ...(a.canEdit
      ? [
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            danger: true,
            label: 'Delete draft',
            onClick: () =>
              askDelete({
                what: `request ${a.marNo}`,
                onConfirm: () => act.mutateAsync({ method: 'delete', path: `/material-approvals/${a.id}` }),
                onDone: () => router.push('/material-approvals'),
              }),
          },
        ]
      : []),
  ];
  const actions = (
    <Space wrap>
      {a.canRecord ? (
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setDialog('review')}>
          Record outcome
        </Button>
      ) : null}
      {a.canEdit ? (
        <Button type="primary" icon={<SendOutlined />} onClick={() => setDialog('submit')}>
          Submit
        </Button>
      ) : null}
      {a.canResubmit ? (
        <Button type="primary" icon={<RedoOutlined />} onClick={() => setDialog('submit')}>
          {`Resubmit as ${revisionLabel(a.revision + 1)}`}
        </Button>
      ) : null}
      {a.canEdit ? (
        <Button icon={<EditOutlined />} onClick={() => setDialog('edit')}>
          Edit
        </Button>
      ) : null}
      {more.length ? (
        <Dropdown menu={{ items: more }} trigger={['click']}>
          <Button icon={<MoreOutlined />} aria-label="More actions" />
        </Dropdown>
      ) : null}
    </Space>
  );

  const stat = (title: string, value: React.ReactNode, note?: React.ReactNode, tone?: 'danger') => (
    <Col xs={12} lg={6}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={0} formatter={() => value} styles={{ content: { fontSize: token.fontSizeHeading4, color: tone === 'danger' ? token.colorErrorText : undefined } }} />
        {note ? <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{note}</div> : null}
      </Card>
    </Col>
  );
  const notice =
    a.status === 'APPROVED' || a.status === 'APPROVED_AS_NOTED' ? (
      <Alert
        type="success"
        showIcon
        title={`${a.make} is an approved make for ${a.material} on ${a.projectCode}.`}
        description={a.status === 'APPROVED_AS_NOTED' && current?.comments ? `As noted: ${current.comments}` : 'Purchase orders for it are no longer flagged.'}
        style={{ marginBottom: token.marginMD }}
      />
    ) : a.status === 'REVISE_RESUBMIT' || a.status === 'REJECTED' ? (
      <Alert
        type={a.status === 'REJECTED' ? 'error' : 'warning'}
        showIcon
        title={a.status === 'REJECTED' ? 'Rejected. Resubmit with another make, or withdraw the request.' : 'Back with us to revise and resubmit.'}
        description={current?.comments ?? undefined}
        style={{ marginBottom: token.marginMD }}
      />
    ) : a.status === 'WITHDRAWN' ? (
      <Alert type="info" showIcon title="Withdrawn" description={a.withdrawnNote ?? undefined} style={{ marginBottom: token.marginMD }} />
    ) : null;

  return (
    <div className="page-container">
      <PageHeader
        title={a.material}
        docTitle={`Material approval ${a.marNo}`}
        crumbs={[{ title: 'Material approvals', href: '/material-approvals' }, { title: a.marNo }]}
        subtitle={
          <span>
            <MaterialApprovalStatusTag status={a.status} overdue={a.overdue} />
            <span translate="no">{`${a.marNo}${a.status === 'DRAFT' ? '' : ` ${revisionLabel(a.revision)}`} · ${MATERIAL_APPROVAL_KIND_LABELS[a.kind]} · ${a.projectCode} ${a.projectName}`}</span>
          </span>
        }
        extra={actions}
      />
      {notice}
      <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
        {stat('Make', <span translate="no">{a.make}</span>, a.model)}
        {stat('Submitted', a.submittedOn ? <span translate="no">{formatDate(a.submittedOn)}</span> : 'Not yet', a.revisions.length ? `${a.revisions.length} submission${a.revisions.length === 1 ? '' : 's'}` : 'A draft')}
        {a.status === 'UNDER_REVIEW'
          ? stat('Waiting', `${a.daysOutstanding ?? 0} day${a.daysOutstanding === 1 ? '' : 's'}`, a.replyBy ? `Reply asked by ${formatDate(a.replyBy)}` : 'No reply date asked', a.overdue ? 'danger' : undefined)
          : stat('Decisions', decided.length, decided.length ? `Last on ${formatDate(decided[0].reviewedOn!)}` : 'None yet')}
        {stat('With', <span translate="no" style={{ fontSize: token.fontSize }}>{a.toParty}</span>)}
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Flex vertical gap={16}>
            <Card size="small" title={<CardTitle>{`Submissions (${a.revisions.length})`}</CardTitle>}>
              {a.revisions.length ? (
                <Flex vertical>
                  {a.revisions.map((r, i) => (
                    <div key={r.id} style={{ padding: `${token.paddingSM}px 0`, borderTop: i ? `1px solid ${token.colorSplit}` : undefined }}>
                      <Flex gap={8} align="center" wrap justify="space-between">
                        <Typography.Text strong translate="no">{`${revisionLabel(r.revision)}, submitted ${formatDate(r.submittedOn)} by ${r.submittedByName}`}</Typography.Text>
                        {r.outcome ? <OutcomeTag outcome={r.outcome} /> : <MaterialApprovalStatusTag status="UNDER_REVIEW" overdue={a.overdue} />}
                      </Flex>
                      {r.submitNote ? <Typography.Paragraph style={{ margin: `${token.marginXXS}px 0 0` }}>{r.submitNote}</Typography.Paragraph> : null}
                      {r.outcome ? (
                        <div style={{ marginTop: token.marginXS, paddingLeft: token.paddingSM, borderLeft: `3px solid ${token.colorBorderSecondary}` }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }} translate="no">
                            {[`Reviewed ${formatDate(r.reviewedOn!)}`, r.reviewerName, r.reviewRef, `${r.days} day${r.days === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                          </Typography.Text>
                          {r.comments ? <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.comments}</Typography.Paragraph> : null}
                        </div>
                      ) : (
                        <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
                          {`With the reviewer for ${r.days} day${r.days === 1 ? '' : 's'}`}
                        </Typography.Text>
                      )}
                    </div>
                  ))}
                </Flex>
              ) : (
                <Typography.Text type="secondary">Not submitted yet. Submit it when the catalogue, certificates or sample are ready.</Typography.Text>
              )}
            </Card>
            <Card size="small" title={<CardTitle>{`Files (${a.attachments.length})`}</CardTitle>}>
              {a.attachments.length ? <AttachmentGallery attachments={a.attachments} /> : <Typography.Text type="secondary">No file attached.</Typography.Text>}
            </Card>
            <CommentsCard kind="MATERIAL_APPROVAL" entityId={a.id} heading={(t) => <CardTitle>{t}</CardTitle>} />
          </Flex>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title={<CardTitle>Details</CardTitle>}>
            <Descriptions
              size="small"
              column={1}
              items={[
                { key: 'project', label: 'Project', children: <span translate="no">{`${a.projectCode} ${a.projectName}`}</span> },
                ...(a.boqItemNo ? [{ key: 'boq', label: 'BOQ item', children: <span translate="no">{a.boqItemNo}</span> }] : []),
                ...(a.usedFor ? [{ key: 'used', label: 'Used for', children: a.usedFor }] : []),
                ...(a.vendorName ? [{ key: 'vendor', label: 'Supplier', children: <span translate="no">{a.vendorName}</span> }] : []),
                ...(a.note ? [{ key: 'note', label: 'Why this make', children: <span style={{ whiteSpace: 'pre-wrap' }}>{a.note}</span> }] : []),
                { key: 'to', label: 'To', children: <span translate="no">{a.toParty}</span> },
                ...(a.replyBy ? [{ key: 'reply', label: 'Reply asked by', children: <span translate="no">{formatDate(a.replyBy)}</span> }] : []),
                { key: 'by', label: 'Raised by', children: <span translate="no">{`${a.createdByName}, ${formatDate(a.createdAt.slice(0, 10))}`}</span> },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <MaterialApprovalForm open={dialog === 'edit'} approval={a} onClose={() => setDialog(null)} />
      {a.canSubmit ? <SubmitDialog approval={a} open={dialog === 'submit'} onClose={() => setDialog(null)} /> : null}
      {a.canRecord ? <ReviewDialog approval={a} open={dialog === 'review'} onClose={() => setDialog(null)} /> : null}
      {a.canWithdraw ? <WithdrawDialog approval={a} open={dialog === 'withdraw'} onClose={() => setDialog(null)} /> : null}
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
