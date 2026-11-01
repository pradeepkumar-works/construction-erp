'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Descriptions, Divider, Drawer, Flex, Form, Input, InputNumber, Radio, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  EOT_BASES,
  EOT_BASIS_LABELS,
  EOT_DECISION_DAYS,
  EOT_STATE_COLORS,
  EOT_STATE_LABELS,
  PROGRAMME_STATUS_LABELS,
  PROGRAMME_UPDATE_DAYS,
  PROGRAMME_WATCH_COLORS,
  PROGRAMME_WATCH_LABELS,
  canApplyEot,
  canApprove,
  canKeepProgramme,
  isGuest,
  type EotApplicationDto,
  type EotBasis,
  type EotRegisterDto,
  type ProgrammeRegisterDto,
  type ProgrammeStatus,
  type ProgrammeSubmissionDto,
} from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  useApplyEot,
  useDecideEot,
  useDecideProgramme,
  useDeleteProgramme,
  useEotAction,
  useEotOptions,
  useForwardEot,
  useProgrammeInterval,
  useSubmitProgramme,
} from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { AppTag, toneOf } from '@/components/common/AppTag';
import { DatePicker } from '@/components/common/DatePicker';
import { QueryError } from '@/components/common/QueryState';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { Section, SectionStack } from '@/components/common/Section';
import { PlusOutlined } from '@/components/common/icons';
import { LocalDataTable } from '@/components/list/LocalDataTable';
import { type ListColumn } from '@/components/list/DataTable';
import { RecordLink } from '@/components/record/RecordLink';
import { FormGrid, FormShell } from '@/components/form/FormShell';

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const PROGRAMME_TONE: Record<ProgrammeStatus, string> = { SUBMITTED: 'blue', APPROVED: 'green', RETURNED: 'gold' };
const small = { fontSize: themeFontSize('fontSizeSM') };

const RevisionTag = ({ r }: { r: ProgrammeSubmissionDto }) => (
  <AppTag tone={toneOf(PROGRAMME_TONE[r.status])} dot>
    {r.inForce ? 'In force' : PROGRAMME_STATUS_LABELS[r.status]}
  </AppTag>
);
const EotTag = ({ a }: { a: EotApplicationDto }) => (
  <AppTag tone={toneOf(EOT_STATE_COLORS[a.state])} dot>
    {EOT_STATE_LABELS[a.state]}
  </AppTag>
);

/** "in 5 days", "today", "3 days overdue". */
function whenText(w: ProgrammeRegisterDto['watch']) {
  if (w.daysLate) return `${days(w.daysLate)} overdue`;
  if (w.daysLeft === 0) return 'due today';
  return `in ${days(w.daysLeft ?? 0)}`;
}

/**
 * Programme and EOT: the programme revisions as they went to the Engineer with their answers and the next one
 * due, and the extension of time applications with the revised completion. On the project's tab for staff (send a
 * revision, record an answer or a decision from its letter) and in the client portal (`portal`: approve or return a
 * revision, forward an application with a recommendation).
 */
export function ProgrammeAndEot({
  projectId,
  portal,
  programme,
  eot,
  loading,
  error,
  onRetry,
  openId,
  onOpen,
}: {
  projectId: string;
  portal: boolean;
  programme: ProgrammeRegisterDto | undefined;
  eot: EotRegisterDto | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** A revision's or an application's id */
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const { user } = useAuth();
  const staff = !!user && !isGuest(user.roleKey);
  const mayKeep = staff && !portal && canKeepProgramme(user!.roleKey);
  const mayApply = staff && !portal && canApplyEot(user!.roleKey);
  const [sending, setSending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [editingInterval, setEditingInterval] = useState(false);
  const revision = programme?.submissions.find((s) => s.id === openId) ?? null;
  const application = eot?.applications.find((a) => a.id === openId) ?? null;
  const waiting = programme?.submissions.find((s) => s.status === 'SUBMITTED') ?? null;
  const inForce = programme?.submissions.find((s) => s.inForce) ?? null;

  const revisionColumns: ListColumn<ProgrammeSubmissionDto>[] = [
    { key: 'rev', card: 'title', cardText: (r) => r.label, title: 'Revision', locked: true, width: 110, render: (_, r) => <RecordLink onOpen={() => onOpen(r.id)}>{r.label}</RecordLink> },
    { key: 'sent', card: 'date', cardText: (r) => formatDate(r.submittedOn), title: 'Sent', width: 120, render: (_, r) => formatDate(r.submittedOn) },
    {
      key: 'plan',
      card: 'meta',
      cardText: (r) => `${r.activityCount} activities, finishing ${formatDate(r.plannedFinish)}`,
      title: 'What it showed',
      render: (_, r) => (
        <span>
          <span translate="no">{r.activityCount}</span> activities, finishing {formatDate(r.plannedFinish)}
          {r.letterRef ? <div className="text-muted" style={small} translate="no">{r.letterRef}</div> : null}
        </span>
      ),
    },
    {
      key: 'answer',
      card: 'meta',
      cardText: (r) => (r.decidedOn ? `${r.decidedByName ?? 'The Engineer'}, ${formatDate(r.decidedOn)}` : 'Waiting'),
      title: 'Answer',
      width: 220,
      render: (_, r) => (r.decidedOn ? <span>{r.decidedByName}<div className="text-muted" style={small}>{formatDate(r.decidedOn)}</div></span> : <Typography.Text type="secondary">Waiting</Typography.Text>),
    },
    { key: 'state', card: 'status', cardText: (r) => (r.inForce ? 'In force' : PROGRAMME_STATUS_LABELS[r.status]), title: 'Status', width: 190, render: (_, r) => <RevisionTag r={r} /> },
  ];

  const eotColumns: ListColumn<EotApplicationDto>[] = [
    { key: 'no', card: 'title', cardText: (a) => a.label, title: 'Application', locked: true, width: 120, render: (_, a) => <RecordLink onOpen={() => onOpen(a.id)}>{a.label}</RecordLink> },
    { key: 'applied', card: 'date', cardText: (a) => formatDate(a.appliedOn), title: 'Applied', width: 120, render: (_, a) => formatDate(a.appliedOn) },
    {
      key: 'for',
      card: 'meta',
      cardText: (a) => forText(a),
      title: 'For',
      render: (_, a) => <span style={{ whiteSpace: 'normal' }}>{forText(a)}</span>,
    },
    { key: 'claimed', card: 'meta', cardText: (a) => `${days(a.daysClaimed)} claimed`, title: 'Claimed', align: 'right', width: 100, render: (_, a) => <span translate="no">{days(a.daysClaimed)}</span> },
    {
      key: 'due',
      title: 'Decision due',
      width: 130,
      render: (_, a) => (a.status === 'SENT' || a.status === 'FORWARDED' ? <Typography.Text type={a.state === 'OVERDUE' ? 'danger' : undefined}>{formatDate(a.decisionDue)}</Typography.Text> : '-'),
    },
    { key: 'granted', title: 'Granted', align: 'right', width: 100, render: (_, a) => (a.grantedDays === null ? '-' : <span translate="no">{days(a.grantedDays)}</span>) },
    { key: 'state', card: 'status', cardText: (a) => EOT_STATE_LABELS[a.state], title: 'Status', width: 190, render: (_, a) => <EotTag a={a} /> },
  ];

  return (
    <>
      {error ? <QueryError error={error} onRetry={onRetry} /> : null}
      <SectionStack>
        <Section
          title="Programme"
          loading={loading && !programme}
          extra={
            mayKeep ? (
              <Space wrap>
                <Button onClick={() => setEditingInterval(true)}>Update interval</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setSending(true)} disabled={!!waiting} title={waiting ? `${waiting.label} is still with the Engineer` : undefined}>
                  New revision
                </Button>
              </Space>
            ) : null
          }
        >
          {programme ? (
            <>
              <Flex gap={8} align="center" wrap style={{ marginBottom: 8 }}>
                <AppTag tone={toneOf(PROGRAMME_WATCH_COLORS[programme.watch.state])} dot>
                  {PROGRAMME_WATCH_LABELS[programme.watch.state]}
                </AppTag>
                <Typography.Text>
                  {programme.watch.nextDue
                    ? `${programme.watch.first ? 'The first programme' : 'The next update'} is due ${formatDate(programme.watch.nextDue)}, ${whenText(programme.watch)}.`
                    : programme.watch.first
                      ? 'No programme sent yet. The first is due 15 days from the agreement: set the agreement date on the contract to count them.'
                      : 'The works are complete: no more updates are due.'}
                </Typography.Text>
              </Flex>
              <p className="text-muted" style={{ marginTop: 0 }}>
                Updates every {days(programme.intervalDays)}
                {programme.intervalSet ? ' as the contract sets.' : ' (the standard; change it if the contract sets another).'}{' '}
                {inForce ? `${inForce.label}, approved ${formatDate(inForce.decidedOn)}, is the programme in force.` : 'No revision is approved yet.'}{' '}
                {waiting ? `${waiting.label} is with the Engineer since ${formatDate(waiting.submittedOn)}.` : ''}
              </p>
              {programme.obligation ? (
                <p className="text-muted" style={{ marginTop: 0 }}>
                  Contract obligation{programme.obligation.clause ? ` (${programme.obligation.clause})` : ''}: {programme.obligation.title.toLowerCase()}.{' '}
                  {programme.obligation.waived
                    ? 'The client waived it.'
                    : programme.metOn
                      ? `Met on ${formatDate(programme.metOn)}.`
                      : `Not met yet${programme.obligation.penaltyValue ? `: ${programme.obligation.penaltyValue}% of the contract value is held back on bills until a revision goes` : ''}.`}
                </p>
              ) : null}
              <LocalDataTable<ProgrammeSubmissionDto>
                list={portal ? 'portal-programme' : 'programme'}
                columns={revisionColumns}
                rows={programme.submissions}
                loading={loading}
                failed={!!error}
                onOpen={onOpen}
                scrollX={760}
                emptyText={portal ? 'The contractor has not sent a programme yet.' : 'No revision sent yet. Plan the activities, then send the programme to the Engineer as Rev 0.'}
              />
            </>
          ) : null}
        </Section>
        <Section
          title="Extensions of time"
          loading={loading && !eot}
          extra={
            mayApply ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setRequesting(true)}>
                Request an extension
              </Button>
            ) : null
          }
        >
          {eot ? (
            <>
              <p className="text-muted" style={{ marginTop: 0 }}>
                {eot.originalCompletion
                  ? `Completion ${formatDate(eot.originalCompletion)}${eot.granted ? `, ${formatDate(eot.revisedCompletion)} with the ${days(eot.granted)} granted` : ''}.`
                  : 'No completion date on the contract yet.'}{' '}
                {eot.pending ? `${days(eot.pending)} claimed and waiting for a decision.` : ''} The authority decides within {EOT_DECISION_DAYS} days of an application.
              </p>
              <LocalDataTable<EotApplicationDto>
                list={portal ? 'portal-eot' : 'eot'}
                columns={eotColumns}
                rows={eot.applications}
                loading={loading}
                failed={!!error}
                onOpen={onOpen}
                scrollX={900}
                emptyText={portal ? 'No extension of time applied for.' : 'No application yet. Request an extension for delays in the register, or for the added work of a variation.'}
              />
            </>
          ) : null}
        </Section>
      </SectionStack>
      <RevisionDrawer data={revision} portal={portal} onClose={() => onOpen(null)} />
      <EotDrawer data={application} portal={portal} onClose={() => onOpen(null)} />
      {mayKeep && programme ? <NewRevisionForm projectId={projectId} register={programme} open={sending} onClose={() => setSending(false)} /> : null}
      {mayKeep && programme ? <IntervalForm projectId={projectId} register={programme} open={editingInterval} onClose={() => setEditingInterval(false)} /> : null}
      {mayApply ? <RequestEotForm projectId={projectId} open={requesting} onClose={() => setRequesting(false)} /> : null}
    </>
  );
}

const forText = (a: EotApplicationDto) => (a.variation ? `${a.variation.label}: ${a.variation.title}` : a.delays.map((d) => d.riskNo).join(', ') || EOT_BASIS_LABELS[a.basis]);

/** Shows a problem from the server above a form's buttons. */
function Problem({ text }: { text: string | null }) {
  return text ? <Alert type="error" showIcon role="alert" style={{ marginBottom: 8 }} title={text} /> : null;
}

function NewRevisionForm({ projectId, register, open, onClose }: { projectId: string; register: ProgrammeRegisterDto; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const submit = useSubmitProgramme(projectId);
  const [form] = Form.useForm<{ submittedOn: dayjs.Dayjs; letterRef?: string; note?: string }>();
  const next = register.submissions.length ? Math.max(...register.submissions.map((s) => s.revision)) + 1 : 0;
  useEffect(() => {
    if (open) form.setFieldsValue({ submittedOn: dayjs() });
  }, [open, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={600}
      title={`Send Rev ${next} to the Engineer`}
      okText={`Send Rev ${next}`}
      projectDefault={false}
      onSubmit={async (v) => {
        const r = await submit.mutateAsync({ submittedOn: v.submittedOn.format('YYYY-MM-DD'), letterRef: v.letterRef?.trim() || null, note: v.note?.trim() || null });
        message.success(`${r.label} sent. The Engineer is asked to approve it in their portal.`);
      }}
    >
      <Typography.Paragraph type="secondary">
        The plan as it stands goes with it: <span translate="no">{register.activityCount}</span> activities, finishing {formatDate(register.plannedFinish)}. Export the Gantt for the copy you send.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false}>
        <FormGrid cols={2}>
          <Form.Item name="submittedOn" label="Sent on" rules={[{ required: true, message: 'Pick the day it went' }]}>
            <DatePicker allowClear={false} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="letterRef" label="Letter reference">
            <Input maxLength={120} placeholder="Our letter number" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="What changed">
          <Input.TextArea rows={3} maxLength={2000} placeholder="Second floor slab moved two weeks for the drawing delay" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

function IntervalForm({ projectId, register, open, onClose }: { projectId: string; register: ProgrammeRegisterDto; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const save = useProgrammeInterval(projectId);
  const [form] = Form.useForm<{ days: number | null }>();
  useEffect(() => {
    if (open) form.setFieldsValue({ days: register.intervalSet ? register.intervalDays : null });
  }, [open, form, register.intervalDays, register.intervalSet]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={480}
      title="Programme update interval"
      okText="Save interval"
      projectDefault={false}
      onSubmit={async (v) => {
        const r = await save.mutateAsync(v.days ?? null);
        message.success(`Updates are due every ${days(r.intervalDays)}`);
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="days" label="Days between updates" extra={`Leave empty for the standard ${PROGRAMME_UPDATE_DAYS} days`}>
          <InputNumber min={1} max={366} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface EotValues {
  basis: EotBasis;
  appliedOn: dayjs.Dayjs;
  delayIds?: string[];
  variationId?: string;
  daysClaimed: number;
  grounds: string;
  letterRef?: string;
}

function RequestEotForm({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const apply = useApplyEot(projectId);
  const options = useEotOptions(projectId, open);
  const [form] = Form.useForm<EotValues>();
  const basis = Form.useWatch('basis', form) ?? 'DELAY';
  const delayIds = Form.useWatch('delayIds', form);
  const variationId = Form.useWatch('variationId', form);
  useEffect(() => {
    if (open) form.setFieldsValue({ basis: 'DELAY', appliedOn: dayjs(), delayIds: [] });
  }, [open, form]);
  // The days claimed follow the delays or the variation chosen, until someone types a figure of their own: the field is
  // filled only while it is empty or still holds the last figure filled in here.
  const filled = useRef<number | undefined>(undefined);
  useEffect(() => {
    const o = options.data;
    if (!open || !o) return;
    const current = form.getFieldValue('daysClaimed') as number | null | undefined;
    if (current != null && current !== filled.current) return;
    const n =
      basis === 'DELAY'
        ? o.delays.filter((d) => delayIds?.includes(d.id)).reduce((s, d) => s + (d.daysLost ?? 0), 0)
        : (o.variations.find((v) => v.id === variationId)?.suggestedDays ?? 0);
    filled.current = n || undefined;
    form.setFieldsValue({ daysClaimed: filled.current });
  }, [open, basis, delayIds, variationId, options.data, form]);
  const variation = options.data?.variations.find((v) => v.id === variationId);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={680}
      title="Request an extension of time"
      okText="Record the application"
      draftKey={`eot:${projectId}`}
      projectDefault={false}
      onSubmit={async (v) => {
        const a = await apply.mutateAsync({
          basis: v.basis,
          appliedOn: v.appliedOn.format('YYYY-MM-DD'),
          daysClaimed: v.daysClaimed,
          grounds: v.grounds.trim(),
          letterRef: v.letterRef?.trim() || null,
          delayIds: v.basis === 'DELAY' ? (v.delayIds ?? []) : [],
          variationId: v.basis === 'VARIATION' ? (v.variationId ?? null) : null,
        });
        message.success(`${a.label} recorded. The decision is due by ${formatDate(a.decisionDue)}.`);
      }}
    >
      <Typography.Paragraph type="secondary">Record the application as it went to the Engineer. The days granted later go to the delay register and move the completion date.</Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="basis" label="Claimed for">
          <Radio.Group optionType="button" options={EOT_BASES.map((b) => ({ value: b, label: EOT_BASIS_LABELS[b] }))} />
        </Form.Item>
        {basis === 'DELAY' ? (
          <Form.Item name="delayIds" label="Delays" rules={[{ validator: (_, v?: string[]) => (v?.length ? Promise.resolve() : Promise.reject(new Error('Choose the delays the extension is claimed for'))) }]} extra={options.data && !options.data.delays.length ? 'No delay in the register is free to claim. Record the delay first.' : undefined}>
            {/* A validator rather than `required`: antd would put aria-required on the group, which a group may not carry. */}
            <Checkbox.Group role="group" aria-label="Delays" style={{ display: 'grid', gap: 8 }}>
              {(options.data?.delays ?? []).map((d) => (
                <Checkbox key={d.id} value={d.id}>
                  <span translate="no">{d.riskNo}</span> {d.title}
                  <span className="text-muted" style={small}>
                    {' '}
                    {formatDate(d.delayStart)}
                    {d.delayEnd ? ` to ${formatDate(d.delayEnd)}` : ', still holding work up'}, {days(d.daysLost ?? 0)} lost
                  </span>
                </Checkbox>
              ))}
            </Checkbox.Group>
          </Form.Item>
        ) : (
          <Form.Item
            name="variationId"
            label="Variation"
            rules={[{ required: true, message: 'Choose the variation that added the work' }]}
            extra={
              variation
                ? `${formatINR(variation.value)} of added work on a contract of ${options.data?.contractDays ? days(options.data.contractDays) : 'no set period'}: ${days(variation.suggestedDays)} in proportion.`
                : 'Time extends in proportion to the work added.'
            }
          >
            <Select
              placeholder="Choose a variation"
              showSearch={{ optionFilterProp: 'label' }}
              options={(options.data?.variations ?? []).map((v) => ({ value: v.id, label: `${v.label}: ${v.title}` }))}
              notFoundContent="No submitted or approved variation is free to claim"
            />
          </Form.Item>
        )}
        <FormGrid cols={2}>
          <Form.Item name="appliedOn" label="Applied on" rules={[{ required: true, message: 'Pick the day it went' }]}>
            <DatePicker allowClear={false} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="daysClaimed" label="Days claimed" rules={[{ required: true, message: 'Enter the days claimed' }]}>
            <InputNumber min={1} max={3650} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="letterRef" label="Letter reference">
          <Input maxLength={120} placeholder="Our letter number" />
        </Form.Item>
        <Form.Item name="grounds" label="Grounds" rules={[{ required: true, whitespace: true, message: 'Write the grounds for the extension' }]}>
          <Input.TextArea rows={4} maxLength={4000} showCount placeholder="What held the work up, from when, and the clause it falls under" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

function RevisionDrawer({ data, portal, onClose }: { data: ProgrammeSubmissionDto | null; portal: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const remove = useDeleteProgramme();
  const [askDelete, deleteDialog] = useConfirmDelete();
  const guest = !!user && isGuest(user.roleKey);
  const mayAnswer = !!data && data.status === 'SUBMITTED' && !!user && (portal ? guest : canKeepProgramme(user.roleKey));
  const mayDelete = !portal && !!data && data.status === 'SUBMITTED' && !!user && canKeepProgramme(user.roleKey) && (canApprove(user.roleKey) || data.submittedByName === user.fullName);
  return (
    <Drawer
      open={!!data}
      onClose={onClose}
      size={640}
      destroyOnHidden
      title={
        data ? (
          <Space size={8} wrap>
            <span>{data.label} of the programme</span>
            <RevisionTag r={data} />
          </Space>
        ) : (
          'Programme revision'
        )
      }
      extra={
        mayDelete && data ? (
          <Button
            danger
            onClick={() =>
              askDelete({
                what: data.label,
                description: 'The revision comes out of the register. Delete it only if it was recorded by mistake.',
                notice: `${data.label} deleted`,
                onConfirm: async () => {
                  await remove.mutateAsync(data.id);
                  onClose();
                },
              })
            }
          >
            Delete
          </Button>
        ) : null
      }
    >
      {data ? (
        <>
          <Descriptions
            size="small"
            column={1}
            bordered
            items={[
              { key: 'sent', label: 'Sent', children: `${formatDate(data.submittedOn)} by ${data.submittedByName}` },
              ...(data.letterRef ? [{ key: 'ref', label: 'Letter', children: <span translate="no">{data.letterRef}</span> }] : []),
              { key: 'plan', label: 'What it showed', children: `${data.activityCount} activities, finishing ${formatDate(data.plannedFinish)}` },
              ...(data.note ? [{ key: 'note', label: 'What changed', children: data.note }] : []),
              ...(data.decidedOn
                ? [
                    { key: 'ans', label: PROGRAMME_STATUS_LABELS[data.status], children: `${formatDate(data.decidedOn)} by ${data.decidedByName ?? 'the Engineer'}` },
                    ...(data.decisionNote ? [{ key: 'cmt', label: data.status === 'RETURNED' ? 'Comments' : 'Note', children: <span style={{ whiteSpace: 'pre-wrap' }}>{data.decisionNote}</span> }] : []),
                  ]
                : []),
            ]}
          />
          {mayAnswer ? <AnswerRevision key={data.id} revision={data} portal={portal} /> : null}
          {data.status === 'SUBMITTED' && !mayAnswer ? <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>With the Engineer for their answer.</Typography.Paragraph> : null}
        </>
      ) : null}
      {deleteDialog}
    </Drawer>
  );
}

/** The Engineer's answer: approve, or return with comments. Staff recording a letter name who answered. */
function AnswerRevision({ revision, portal }: { revision: ProgrammeSubmissionDto; portal: boolean }) {
  const { message } = App.useApp();
  const decide = useDecideProgramme(portal);
  const [form] = Form.useForm<{ decision: 'APPROVED' | 'RETURNED'; note?: string; decidedOn: dayjs.Dayjs; decidedByName?: string }>();
  const [problem, setProblem] = useState<string | null>(null);
  const decision = Form.useWatch('decision', form) ?? 'APPROVED';
  const save = async (v: { decision: 'APPROVED' | 'RETURNED'; note?: string; decidedOn: dayjs.Dayjs; decidedByName?: string }) => {
    setProblem(null);
    try {
      await decide.mutateAsync({ id: revision.id, decision: v.decision, note: v.note?.trim() || null, decidedOn: v.decidedOn.format('YYYY-MM-DD'), decidedByName: portal ? null : v.decidedByName?.trim() || null });
      message.success(v.decision === 'APPROVED' ? `${revision.label} approved` : `${revision.label} returned with comments`);
    } catch (e) {
      setProblem(errorMessage(e));
    }
  };
  return (
    <>
      <Divider titlePlacement="start" plain>
        {portal ? 'Your answer' : "Record the Engineer's answer"}
      </Divider>
      <Problem text={problem} />
      <Form form={form} layout="vertical" requiredMark={false} onFinish={save} initialValues={{ decision: 'APPROVED', decidedOn: dayjs() }}>
        <Form.Item name="decision" label="Answer">
          <Radio.Group
            optionType="button"
            options={[
              { value: 'APPROVED', label: 'Approve' },
              { value: 'RETURNED', label: 'Return with comments' },
            ]}
          />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="decidedOn" label="Answered on" rules={[{ required: true, message: 'Pick the day of the answer' }]}>
            <DatePicker allowClear={false} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(revision.submittedOn), 'day')} />
          </Form.Item>
          {!portal ? (
            <Form.Item name="decidedByName" label="Answered by" rules={[{ required: true, whitespace: true, message: 'Name the Engineer, as on their letter' }]}>
              <Input maxLength={160} placeholder="As on their letter" />
            </Form.Item>
          ) : null}
        </FormGrid>
        <Form.Item name="note" label={decision === 'RETURNED' ? 'Comments' : 'Note'} rules={decision === 'RETURNED' ? [{ required: true, whitespace: true, message: 'Write the comments, so the next revision can answer them' }] : []}>
          <Input.TextArea rows={3} maxLength={4000} />
        </Form.Item>
        <Flex justify="flex-end">
          <Button type="primary" htmlType="submit" loading={decide.isPending}>
            {decision === 'APPROVED' ? `Approve ${revision.label}` : `Return ${revision.label}`}
          </Button>
        </Flex>
      </Form>
    </>
  );
}

function EotDrawer({ data, portal, onClose }: { data: EotApplicationDto | null; portal: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { modal, message } = App.useApp();
  const action = useEotAction();
  const guest = !!user && isGuest(user.roleKey);
  const staffApply = !portal && !!user && canApplyEot(user.roleKey);
  const waiting = !!data && (data.status === 'SENT' || data.status === 'FORWARDED');
  const confirm = (what: 'withdraw' | 'undo-decision') =>
    data &&
    modal.confirm({
      title: what === 'withdraw' ? `Withdraw ${data.label}?` : `Put back the decision on ${data.label}?`,
      content:
        what === 'withdraw'
          ? 'The application stops waiting for a decision and its delays are free to claim again.'
          : `The ${days(data.grantedDays ?? 0)} granted come off the delay register and the application waits for a decision again.`,
      okText: what === 'withdraw' ? 'Withdraw' : 'Put back',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await action.mutateAsync({ id: data.id, action: what });
          message.success(what === 'withdraw' ? `${data.label} withdrawn` : `Decision on ${data.label} put back`);
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });
  return (
    <Drawer
      open={!!data}
      onClose={onClose}
      size={680}
      destroyOnHidden
      title={
        data ? (
          <Space size={8} wrap>
            <span>{data.label}</span>
            <EotTag a={data} />
          </Space>
        ) : (
          'Extension of time'
        )
      }
      extra={
        staffApply && data ? (
          waiting ? (
            <Button danger onClick={() => confirm('withdraw')}>
              Withdraw
            </Button>
          ) : data.status === 'DECIDED' ? (
            <Button danger onClick={() => confirm('undo-decision')}>
              Put back the decision
            </Button>
          ) : null
        ) : null
      }
    >
      {data ? (
        <>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{data.grounds}</Typography.Paragraph>
          <Descriptions
            size="small"
            column={1}
            bordered
            items={[
              { key: 'applied', label: 'Applied', children: `${formatDate(data.appliedOn)} by ${data.createdByName}${data.letterRef ? `, ${data.letterRef}` : ''}` },
              { key: 'claimed', label: 'Claimed', children: `${days(data.daysClaimed)} for ${data.variation ? `the added work of ${data.variation.label}, ${data.variation.title} (${formatINR(data.variation.value)})` : 'delays in the register'}` },
              { key: 'due', label: 'Decision due', children: formatDate(data.decisionDue) },
              ...(data.forwardedOn
                ? [{ key: 'fwd', label: 'Forwarded', children: `${formatDate(data.forwardedOn)} by ${data.forwardedByName ?? 'the Engineer'}${data.recommendedDays !== null ? `, ${days(data.recommendedDays)} recommended` : ''}${data.forwardNote ? `: ${data.forwardNote}` : ''}` }]
                : []),
              ...(data.decidedOn
                ? [{ key: 'dec', label: 'Decided', children: `${formatDate(data.decidedOn)}: ${data.grantedDays ? `${days(data.grantedDays)} granted` : 'refused'}${data.decisionRef ? `, ${data.decisionRef}` : ''}${data.decisionNote ? `. ${data.decisionNote}` : ''}` }]
                : []),
            ]}
          />
          {data.delays.length ? (
            <>
              <Divider titlePlacement="start" plain>
                {data.variation ? 'In the delay register' : 'Delays claimed'}
              </Divider>
              <ul style={{ paddingInlineStart: 18, margin: 0 }}>
                {data.delays.map((d) => (
                  <li key={d.id} style={{ marginBottom: 4 }}>
                    <span translate="no">{d.riskNo}</span> {d.title}
                    <span className="text-muted" style={small}>
                      {' '}
                      {days(d.daysLost ?? 0)} lost{d.eotGrantedDays !== null ? `, ${days(d.eotGrantedDays)} granted` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {data.status === 'SENT' && (portal ? guest : staffApply) ? <ForwardBox key={`f-${data.id}`} app={data} portal={portal} /> : null}
          {waiting && staffApply ? <DecideBox key={`d-${data.id}`} app={data} /> : null}
        </>
      ) : null}
    </Drawer>
  );
}

/** The Engineer forwards it with a recommendation: in the portal, or staff recording their letter. */
function ForwardBox({ app, portal }: { app: EotApplicationDto; portal: boolean }) {
  const { message } = App.useApp();
  const forward = useForwardEot(portal);
  const [problem, setProblem] = useState<string | null>(null);
  type V = { forwardedOn: dayjs.Dayjs; recommendedDays?: number | null; note?: string; forwardedByName?: string };
  const save = async (v: V) => {
    setProblem(null);
    try {
      await forward.mutateAsync({ id: app.id, forwardedOn: v.forwardedOn.format('YYYY-MM-DD'), recommendedDays: v.recommendedDays ?? null, note: v.note?.trim() || null, forwardedByName: portal ? null : v.forwardedByName?.trim() || null });
      message.success(`${app.label} forwarded to the competent authority`);
    } catch (e) {
      setProblem(errorMessage(e));
    }
  };
  return (
    <>
      <Divider titlePlacement="start" plain>
        {portal ? 'Forward to the competent authority' : "Record the Engineer's forwarding"}
      </Divider>
      <Problem text={problem} />
      <Form<V> layout="vertical" requiredMark={false} onFinish={save} initialValues={{ forwardedOn: dayjs() }}>
        <FormGrid cols={2}>
          <Form.Item name="forwardedOn" label="Forwarded on" rules={[{ required: true, message: 'Pick the day it was forwarded' }]}>
            <DatePicker allowClear={false} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(app.appliedOn), 'day')} />
          </Form.Item>
          <Form.Item name="recommendedDays" label="Days recommended" extra={`Of the ${days(app.daysClaimed)} claimed`}>
            <InputNumber min={0} max={app.daysClaimed} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        {!portal ? (
          <Form.Item name="forwardedByName" label="Forwarded by" rules={[{ required: true, whitespace: true, message: 'Name the Engineer, as on their letter' }]}>
            <Input maxLength={160} placeholder="As on their letter" />
          </Form.Item>
        ) : null}
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={4000} />
        </Form.Item>
        <Flex justify="flex-end">
          <Button type="primary" htmlType="submit" loading={forward.isPending}>
            {portal ? 'Forward' : 'Record forwarding'}
          </Button>
        </Flex>
      </Form>
    </>
  );
}

/** The authority's decision, from its letter: the days granted go to the delay register. */
function DecideBox({ app }: { app: EotApplicationDto }) {
  const { message } = App.useApp();
  const decide = useDecideEot();
  const [problem, setProblem] = useState<string | null>(null);
  type V = { decidedOn: dayjs.Dayjs; grantedDays: number; decisionRef?: string; note?: string };
  const save = async (v: V) => {
    setProblem(null);
    try {
      const a = await decide.mutateAsync({ id: app.id, decidedOn: v.decidedOn.format('YYYY-MM-DD'), grantedDays: v.grantedDays, decisionRef: v.decisionRef?.trim() || null, note: v.note?.trim() || null });
      message.success(a.grantedDays ? `${days(a.grantedDays)} granted on ${a.label}: the completion date moves` : `${a.label} recorded as refused`);
    } catch (e) {
      setProblem(errorMessage(e));
    }
  };
  return (
    <>
      <Divider titlePlacement="start" plain>
        Record the decision
      </Divider>
      <Problem text={problem} />
      <Form<V> layout="vertical" requiredMark={false} onFinish={save} initialValues={{ decidedOn: dayjs(), grantedDays: app.recommendedDays ?? undefined }}>
        <FormGrid cols={2}>
          <Form.Item name="decidedOn" label="Decided on" rules={[{ required: true, message: 'Pick the day of the decision' }]}>
            <DatePicker allowClear={false} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(app.appliedOn), 'day')} />
          </Form.Item>
          <Form.Item name="grantedDays" label="Days granted" extra="0 if it was refused" rules={[{ required: true, message: 'Enter the days granted, or 0' }]}>
            <InputNumber min={0} max={app.daysClaimed} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="decisionRef" label="Decision letter">
          <Input maxLength={120} placeholder="The authority's letter number" />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={4000} />
        </Form.Item>
        <Flex justify="flex-end">
          <Button type="primary" htmlType="submit" loading={decide.isPending}>
            Record the decision
          </Button>
        </Flex>
      </Form>
    </>
  );
}
