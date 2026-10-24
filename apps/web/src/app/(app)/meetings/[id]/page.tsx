'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { App, Button, Card, Col, Descriptions, Dropdown, Flex, Row, Space, Statistic, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { MenuProps } from 'antd';
import { DeleteOutlined, EditOutlined, MoreOutlined, PrinterOutlined, RollbackOutlined, SendOutlined, WhatsAppOutlined } from '@/components/common/icons';
import { MEETING_KIND_LABELS, type MeetingActionDto, type MeetingDetailDto, type MeetingIssueResultDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useNotify } from '@/lib/notify';
import { useMeeting, useMeetingAction } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { ActionControls, ActionStatusTag, MeetingForm, MeetingStatusTag, actionWhen } from '@/components/meetings/MeetingForms';
import { minutesText, openMinutesPrint } from '@/components/meetings/meetingPrint';
import { CommentsCard } from '@/components/comments/CommentsSection';

/**
 * One meeting (v6 item 112): its minutes (who came, what was noted and decided), the actions it gave out with who does
 * each by when, and what earlier meetings of the project left open. A draft is issued from here, which emails the
 * minutes and tells our action owners; issued minutes print or go to WhatsApp.
 */
export default function MeetingPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useMeeting(params?.id);
  if (isLoading)
    return (
      <div className="page-container">
        <PageSkeleton shape="record" />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-container">
        <QueryError error={error ?? new Error('Meeting not found')} onRetry={() => refetch()} />
      </div>
    );
  return <MeetingView m={data} />;
}

function MeetingView({ m }: { m: MeetingDetailDto }) {
  const { token } = theme.useToken();
  const { modal, message } = App.useApp();
  const { user } = useAuth();
  const router = useRouter();
  const notify = useNotify();
  const act = useMeetingAction<MeetingDetailDto | MeetingIssueResultDto>();
  const [editing, setEditing] = useState(false);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const draft = m.status === 'DRAFT';
  const open = m.actions.filter((a) => a.status === 'OPEN');
  const late = open.filter((a) => a.daysOverdue);
  const withEmail = m.attendees.filter((a) => a.email).length;

  const issue = () =>
    modal.confirm({
      title: `Issue the minutes of ${m.meetingNo}?`,
      content: (
        <p>
          {`They are fixed from now on${withEmail ? ` and emailed to ${withEmail === 1 ? 'the 1 attendee' : `the ${withEmail} attendees`} with an email` : ''}. Our staff with actions are told of theirs.`}
        </p>
      ),
      okText: 'Issue minutes',
      onOk: async () => {
        const r = (await act.mutateAsync({ path: `/meetings/${m.id}/issue` })) as MeetingIssueResultDto;
        notify.saved(`Minutes issued${r.emailed ? `, emailed to ${r.emailed}` : ''}${r.notified ? `, ${r.notified} told of their actions` : ''}`);
      },
    });
  const revise = () =>
    modal.confirm({
      title: `Take ${m.meetingNo} back to draft?`,
      content: 'The minutes can then be corrected and issued again. Actions stay as they are.',
      okText: 'Back to draft',
      onOk: async () => {
        await act.mutateAsync({ path: `/meetings/${m.id}/revise` });
        notify.saved(`${m.meetingNo} is a draft again`);
      },
    });
  const print = () => {
    if (!openMinutesPrint(m, user?.organizationName ?? '')) message.warning('Pop-up blocked. Allow pop-ups to print the minutes.');
  };
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(minutesText(m))}`, '_blank', 'noopener');

  const more: MenuProps['items'] = [
    { key: 'whatsapp', icon: <WhatsAppOutlined />, label: 'Share on WhatsApp', onClick: whatsapp },
    ...(m.canRevise ? [{ key: 'revise', icon: <RollbackOutlined />, label: 'Back to draft', onClick: revise }] : []),
    ...(m.canEdit
      ? [
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            danger: true,
            label: 'Delete meeting',
            onClick: () =>
              askDelete({
                what: `meeting ${m.meetingNo}`,
                description: m.actions.length ? `Its ${m.actions.length === 1 ? 'action goes' : `${m.actions.length} actions go`} with it.` : undefined,
                onConfirm: () => act.mutateAsync({ method: 'delete', path: `/meetings/${m.id}` }),
                onDone: () => router.push('/meetings'),
              }),
          },
        ]
      : []),
  ];
  const actions = (
    <Space wrap>
      {m.canEdit ? (
        <Button type="primary" icon={<SendOutlined />} onClick={issue}>
          Issue minutes
        </Button>
      ) : null}
      {m.canEdit ? (
        <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
          Edit
        </Button>
      ) : null}
      <Button icon={<PrinterOutlined />} onClick={print}>
        Print
      </Button>
      <Dropdown menu={{ items: more }} trigger={['click']}>
        <Button icon={<MoreOutlined />} aria-label="More actions" />
      </Dropdown>
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
  const decisions = m.points.filter((p) => p.kind === 'DECISION').length;

  return (
    <div className="page-container">
      <PageHeader
        title={<span translate="no">{m.title}</span>}
        docTitle={`Meeting ${m.meetingNo}`}
        crumbs={[{ title: 'Meetings', href: '/meetings' }, { title: m.meetingNo }]}
        subtitle={
          <span>
            <MeetingStatusTag status={m.status} />
            <span translate="no">{`${m.meetingNo} · ${MEETING_KIND_LABELS[m.kind]} · ${m.projectCode} ${m.projectName}`}</span>
          </span>
        }
        extra={actions}
      />
      <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
        {stat('Held on', <span translate="no">{formatDate(m.heldOn)}</span>, [m.startTime, m.venue].filter(Boolean).join(', ') || null)}
        {stat('Present', `${m.present} of ${m.attendees.length}`, m.attendees.length - m.present ? `${m.attendees.length - m.present} absent` : m.attendees.length ? 'Everyone listed' : 'Nobody listed yet')}
        {stat('Decisions', decisions, `${m.points.length - decisions} other point${m.points.length - decisions === 1 ? '' : 's'} noted`)}
        {stat(
          'Actions open',
          `${open.length} of ${m.actions.length}`,
          late.length ? `${late.length} late` : m.earlierActions.length ? `${m.earlierActions.length} more open from earlier meetings` : m.actions.length ? 'None late' : 'No action given out',
          late.length ? 'danger' : undefined,
        )}
      </Row>
      {draft && m.canEdit ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          A draft: only your team sees it until the minutes are issued. Issuing needs who was present, and an owner and a date for every action.
        </Typography.Paragraph>
      ) : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Flex vertical gap={16}>
            <Card size="small" title={<CardTitle>Minutes</CardTitle>}>
              {m.points.length ? (
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {m.points.map((p) => (
                    <li key={p.id} style={{ marginBottom: token.marginXS }}>
                      {p.kind === 'DECISION' ? <AppTag tone="info">Decided</AppTag> : null}
                      <span style={{ whiteSpace: 'pre-wrap' }}>{p.text}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Typography.Text type="secondary">Nothing noted yet.</Typography.Text>
              )}
            </Card>
            <ActionsCard title={`Actions (${m.actions.length})`} list={m.actions} empty="No action given out at this meeting." />
            {m.earlierActions.length ? (
              <ActionsCard title={`Open from earlier meetings (${m.earlierActions.length})`} list={m.earlierActions} from empty="" />
            ) : null}
            <CommentsCard kind="MEETING" entityId={m.id} heading={(t) => <CardTitle>{t}</CardTitle>} />
          </Flex>
        </Col>
        <Col xs={24} lg={8}>
          <Flex vertical gap={16}>
            <Card size="small" title={<CardTitle>{`Who came (${m.attendees.length})`}</CardTitle>}>
              {m.attendees.length ? (
                <Flex vertical>
                  {m.attendees.map((a, i) => (
                    <Flex key={a.id} gap={8} align="center" justify="space-between" style={{ minHeight: 44, borderTop: i ? `1px solid ${token.colorSplit}` : undefined }}>
                      <div style={{ minWidth: 0 }}>
                        <Typography.Text translate="no">{a.name}</Typography.Text>
                        <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }} translate="no">
                          {[a.organisation ?? 'Our staff', a.phone].filter(Boolean).join(' · ')}
                        </Typography.Text>
                      </div>
                      {a.present ? null : <AppTag>Absent</AppTag>}
                    </Flex>
                  ))}
                </Flex>
              ) : (
                <Typography.Text type="secondary">Nobody listed yet.</Typography.Text>
              )}
            </Card>
            <Card size="small" title={<CardTitle>Details</CardTitle>}>
              <Descriptions
                size="small"
                column={1}
                items={[
                  { key: 'project', label: 'Project', children: <span translate="no">{`${m.projectCode} ${m.projectName}`}</span> },
                  ...(m.chairedBy ? [{ key: 'chair', label: 'Chaired by', children: <span translate="no">{m.chairedBy}</span> }] : []),
                  ...(m.agenda ? [{ key: 'agenda', label: 'Agenda', children: <span style={{ whiteSpace: 'pre-wrap' }}>{m.agenda}</span> }] : []),
                  ...(m.nextOn ? [{ key: 'next', label: 'Next meeting', children: <span translate="no">{formatDate(m.nextOn)}</span> }] : []),
                  { key: 'by', label: 'Recorded by', children: <span translate="no">{m.createdByName}</span> },
                  ...(m.issuedAt ? [{ key: 'issued', label: 'Issued', children: <span translate="no">{`${m.issuedByName ?? ''}, ${formatDateTime(m.issuedAt)}`}</span> }] : []),
                ]}
              />
            </Card>
          </Flex>
        </Col>
      </Row>
      <MeetingForm open={editing} meeting={m} onClose={() => setEditing(false)} />
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

/** Actions with who does each by when, where each stands, and what the caller may do with it. */
function ActionsCard({ title, list, from, empty }: { title: string; list: MeetingActionDto[]; from?: boolean; empty: string }) {
  const { token } = theme.useToken();
  const router = useRouter();
  const small = { display: 'block', fontSize: token.fontSizeSM } as const;
  return (
    <Card size="small" title={<CardTitle>{title}</CardTitle>}>
      {list.length ? (
        <Flex vertical>
          {list.map((a, i) => (
            <Flex key={a.id} gap={12} align="center" justify="space-between" wrap style={{ minHeight: 44, padding: `${token.paddingXS}px 0`, borderTop: i ? `1px solid ${token.colorSplit}` : undefined }}>
              <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                <Typography.Text delete={a.status === 'DROPPED'}>{`${from ? '' : `${i + 1}. `}${a.text}`}</Typography.Text>
                <Typography.Text type="secondary" style={small} translate="no">
                  {[a.ownerName, actionWhen(a), a.link?.label].filter(Boolean).join(' · ')}
                </Typography.Text>
                {from ? (
                  <Typography.Link style={{ ...small, display: 'inline-flex', alignItems: 'center', minHeight: 24 }} href={`/meetings/${a.meetingId}`} onClick={(e) => (e.preventDefault(), router.push(`/meetings/${a.meetingId}`))}>
                    <span translate="no">{`${a.meetingNo}, ${formatDate(a.heldOn)}`}</span>
                  </Typography.Link>
                ) : null}
                {a.closeNote ? <Typography.Text style={small}>{a.closeNote}</Typography.Text> : null}
              </div>
              <Space size={8}>
                <ActionStatusTag a={a} />
                <ActionControls a={a} />
              </Space>
            </Flex>
          ))}
        </Flex>
      ) : (
        <Typography.Text type="secondary">{empty}</Typography.Text>
      )}
    </Card>
  );
}
