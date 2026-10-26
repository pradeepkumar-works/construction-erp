'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Checkbox, Dropdown, Space, Form, Input, Select, TimePicker, Typography, theme } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import dayjs from 'dayjs';
import {
  MEETING_ACTION_STATUS_LABELS,
  MEETING_KIND_LABELS,
  MEETING_KINDS,
  MEETING_LINK_KIND_LABELS,
  MEETING_POINT_KIND_LABELS,
  MEETING_POINT_KINDS,
  MEETING_STATUS_LABELS,
  isGuest,
  type MeetingActionDto,
  type MeetingActionStatus,
  type MeetingDetailDto,
  type MeetingKind,
  type MeetingLinkKind,
  type MeetingPointKind,
  type MeetingStatus,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useNotify } from '@/lib/notify';
import { useMeetingAction, useMeetingLinkOptions, useProjects, useUsersPage } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { afterFormLeaves, FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { EMAIL_INPUT, PHONE_INPUT, emailRule, phoneRule } from '@/components/form/inputs';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);
const notAfterToday = (d: dayjs.Dayjs) => d.isAfter(dayjs(), 'day');

const STATUS_COLORS: Record<MeetingStatus, string | undefined> = { DRAFT: undefined, ISSUED: 'success' };
export function MeetingStatusTag({ status }: { status: MeetingStatus }) {
  return <AppTag color={STATUS_COLORS[status]}>{MEETING_STATUS_LABELS[status]}</AppTag>;
}

const ACTION_COLORS: Record<MeetingActionStatus, string | undefined> = { OPEN: 'processing', DONE: 'success', DROPPED: undefined };
/** An action's state: open (late or due today in words), done or dropped. */
export function ActionStatusTag({ a }: { a: MeetingActionDto }) {
  if (a.status === 'OPEN' && a.daysOverdue) return <AppTag tone="danger">{`${a.daysOverdue} day${a.daysOverdue === 1 ? '' : 's'} late`}</AppTag>;
  if (a.status === 'OPEN' && a.daysOverdue === 0) return <AppTag tone="pending">Due today</AppTag>;
  return <AppTag color={ACTION_COLORS[a.status]}>{MEETING_ACTION_STATUS_LABELS[a.status]}</AppTag>;
}

/** Where an action's due date stands, in words: "Due 4 Nov", "3 days late", "Done 2 Nov". */
export function actionWhen(a: MeetingActionDto): string {
  if (a.status === 'DONE') return `Done ${a.doneOn ? formatDate(a.doneOn) : ''}`.trim();
  if (a.status === 'DROPPED') return `Dropped ${a.doneOn ? formatDate(a.doneOn) : ''}`.trim();
  if (!a.dueOn) return 'No date';
  return `Due ${formatDate(a.dueOn)}`;
}

/** Our own staff, to pick as attendees and owners (logins from outside the company are left out). */
function useStaffOptions(enabled: boolean) {
  const { data, isLoading } = useUsersPage({ isActive: true, pageSize: 300, sortBy: 'fullName', sortOrder: 'asc' }, enabled);
  const staff = useMemo(() => (enabled ? (data?.items ?? []).filter((u) => !isGuest(u.roleKey)) : []), [data, enabled]);
  return { loading: isLoading, staff, options: staff.map((u) => ({ value: u.id, label: `${u.fullName} · ${u.roleName}` })) };
}

interface AttendeeValue {
  userId?: string | null;
  name?: string;
  organisation?: string;
  email?: string;
  phone?: string;
  present?: boolean;
}
interface PointValue {
  kind?: MeetingPointKind;
  text?: string;
}
interface ActionValue {
  id?: string;
  text?: string;
  /** `u:<userId>` for our staff, `n:<name>` for someone from outside */
  owner?: string;
  dueOn?: dayjs.Dayjs | null;
  /** `<kind>:<id>` */
  link?: string | null;
}
interface MeetingValues {
  projectId: string;
  title: string;
  kind: MeetingKind;
  heldOn: dayjs.Dayjs;
  startTime?: dayjs.Dayjs | null;
  venue?: string;
  chairedBy?: string;
  agenda?: string;
  nextOn?: dayjs.Dayjs | null;
  attendees: AttendeeValue[];
  points: PointValue[];
  actions: ActionValue[];
}

/**
 * A meeting's minutes, new or a draft being changed: the meeting, who came (our staff from the user list, others by
 * name and side), the points noted and decided, and the actions with an owner (from either) and a due date, each
 * about an RFI, NCR or variation of the project when it is.
 */
export function MeetingForm({ open, meeting, onClose, onSaved }: { open: boolean; meeting?: MeetingDetailDto | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const [form] = Form.useForm<MeetingValues>();
  const { token } = theme.useToken();
  const { user } = useAuth();
  const act = useMeetingAction<MeetingDetailDto>();
  const notify = useNotify();
  const saved = useRef<string | null>(null);
  const { data: projects } = useProjects();
  const projectId = Form.useWatch('projectId', form) as string | undefined;
  const attendees = Form.useWatch('attendees', { form, preserve: true }) as AttendeeValue[] | undefined;
  const staff = useStaffOptions(open);
  const { data: links } = useMeetingLinkOptions(open ? projectId : undefined);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (meeting)
      form.setFieldsValue({
        projectId: meeting.projectId,
        title: meeting.title,
        kind: meeting.kind,
        heldOn: dayjs(meeting.heldOn),
        startTime: meeting.startTime ? dayjs(meeting.startTime, 'HH:mm') : null,
        venue: meeting.venue ?? undefined,
        chairedBy: meeting.chairedBy ?? undefined,
        agenda: meeting.agenda ?? undefined,
        nextOn: meeting.nextOn ? dayjs(meeting.nextOn) : null,
        attendees: meeting.attendees.map((a) => ({ userId: a.userId, name: a.userId ? undefined : a.name, organisation: a.organisation ?? undefined, email: a.userId ? undefined : (a.email ?? undefined), phone: a.userId ? undefined : (a.phone ?? undefined), present: a.present })),
        points: meeting.points.map((p) => ({ kind: p.kind, text: p.text })),
        actions: meeting.actions.map((a) => ({ id: a.id, text: a.text, owner: a.ownerUserId ? `u:${a.ownerUserId}` : `n:${a.ownerName}`, dueOn: a.dueOn ? dayjs(a.dueOn) : null, link: a.link ? `${a.link.kind}:${a.link.id}` : null })),
      });
    else
      form.setFieldsValue({
        kind: 'PROGRESS',
        heldOn: dayjs(),
        attendees: user ? [{ userId: user.id, present: true }] : [{ present: true }],
        points: [{ kind: 'NOTE' }],
        actions: [],
      });
  }, [open, meeting, form, user]);

  // Owners: our staff, then whoever from outside is on the attendance list.
  const outsiders = (attendees ?? []).filter((a) => !a.userId && a.name?.trim()).map((a) => a.name!.trim());
  const ownerOptions = [
    { label: 'Our staff', options: staff.staff.map((u) => ({ value: `u:${u.id}`, label: u.fullName })) },
    ...(outsiders.length ? [{ label: 'From outside', options: [...new Set(outsiders)].map((n) => ({ value: `n:${n}`, label: n })) }] : []),
  ];
  const linkOptions = links
    ? (
        [
          ['RFI', links.rfis],
          ['NCR', links.ncrs],
          ['VARIATION', links.variations],
        ] as [MeetingLinkKind, typeof links.rfis][]
      )
        .filter(([, list]) => list.length)
        .map(([kind, list]) => ({ label: `${MEETING_LINK_KIND_LABELS[kind]}s`, options: list.map((l) => ({ value: `${l.kind}:${l.id}`, label: l.label })) }))
    : [];
  const small = { display: 'block', fontSize: token.fontSizeSM } as const;

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={1040}
      title={meeting ? `Edit ${meeting.meetingNo}` : 'Record meeting'}
      okText={meeting ? 'Save' : 'Save draft'}
      allValues
      draftKey={meeting ? undefined : 'meeting:new'}
      onSubmit={async (v) => {
        const body = {
          title: v.title.trim(),
          kind: v.kind,
          heldOn: ymd(v.heldOn),
          startTime: v.startTime ? v.startTime.format('HH:mm') : null,
          venue: v.venue?.trim() || null,
          chairedBy: v.chairedBy?.trim() || null,
          agenda: v.agenda?.trim() || null,
          nextOn: ymd(v.nextOn),
          attendees: (v.attendees ?? []).map((a) =>
            a.userId
              ? { userId: a.userId, present: a.present ?? true }
              : { name: a.name?.trim(), organisation: a.organisation?.trim() || null, email: a.email?.trim() || null, phone: a.phone?.trim() || null, present: a.present ?? true },
          ),
          points: (v.points ?? []).filter((p) => p.text?.trim()).map((p) => ({ kind: p.kind ?? 'NOTE', text: p.text!.trim() })),
          actions: (v.actions ?? []).map((a) => {
            const [linkKind, linkId] = a.link ? a.link.split(':') : [null, null];
            return {
              ...(a.id ? { id: a.id } : {}),
              text: a.text?.trim(),
              ownerUserId: a.owner?.startsWith('u:') ? a.owner.slice(2) : null,
              ownerName: a.owner?.startsWith('n:') ? a.owner.slice(2) : null,
              dueOn: ymd(a.dueOn),
              linkKind,
              linkId,
            };
          }),
        };
        const row = meeting
          ? await act.mutateAsync({ method: 'patch', path: `/meetings/${meeting.id}`, body })
          : await act.mutateAsync({ path: '/meetings', body: { ...body, projectId: v.projectId } });
        saved.current = row.id;
        notify.saved(meeting ? `${meeting.meetingNo} saved` : `Meeting ${row.meetingNo} saved as a draft`);
        if (!meeting && onSaved) afterFormLeaves(() => saved.current && onSaved(saved.current));
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="The meeting">
          <FormGrid cols={2}>
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                disabled={!!meeting}
                onChange={() => form.setFieldValue('actions', (form.getFieldValue('actions') as ActionValue[] | undefined)?.map((a) => ({ ...a, link: null })) ?? [])}
                options={(projects ?? []).filter((p) => p.type !== 'STORE').map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
              />
            </Form.Item>
            <Form.Item name="kind" label="Kind of meeting">
              <Select options={MEETING_KINDS.map((k) => ({ value: k, label: MEETING_KIND_LABELS[k] }))} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="title" label="Meeting" rules={[{ required: true, whitespace: true, message: 'Name the meeting' }]}>
            <Input maxLength={200} placeholder="Weekly progress review" />
          </Form.Item>
          <FormGrid cols={4}>
            <Form.Item name="heldOn" label="Held on" rules={[{ required: true, message: 'Choose the day it was held' }]}>
              <DatePicker disabledDate={notAfterToday} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="startTime" label="At">
              <TimePicker format="HH:mm" minuteStep={5} needConfirm={false} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="venue" label="Venue">
              <Input maxLength={200} placeholder="Site office" />
            </Form.Item>
            <Form.Item name="chairedBy" label="Chaired by">
              <Input maxLength={120} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="agenda" label="Agenda">
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={4000} placeholder={'Actions from the last meeting\nProgress against the programme'} />
            </Form.Item>
            <Form.Item name="nextOn" label="Next meeting">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Who came">
          <LineTable
            name="attendees"
            label="Attendee"
            addText="Add attendee"
            newLine={() => ({ present: true })}
            columns={[
              {
                key: 'who',
                title: 'Our staff',
                width: 230,
                render: (f) => (
                  <Form.Item name={[f.name, 'userId']} noStyle>
                    <Select
                      allowClear
                      showSearch={{ optionFilterProp: 'label' }}
                      loading={staff.loading}
                      placeholder="Someone from outside"
                      style={{ width: '100%' }}
                      aria-label={`Staff member, attendee ${f.name + 1}`}
                      popupMatchSelectWidth={320}
                      options={staff.options}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'name',
                title: 'Name and side',
                render: (f) =>
                  attendees?.[f.name]?.userId ? (
                    <Typography.Text type="secondary" style={small}>
                      Name, email and phone from the user list
                    </Typography.Text>
                  ) : (
                    <FormGrid cols={2}>
                      <Form.Item name={[f.name, 'name']} noStyle rules={[{ required: true, whitespace: true, message: 'Give their name, or choose one of our staff' }]}>
                        <Input placeholder="Name" aria-label={`Name of attendee ${f.name + 1}`} maxLength={120} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'organisation']} noStyle>
                        <Input placeholder="Client, PMC, subcontractor…" aria-label={`Side of attendee ${f.name + 1}`} maxLength={120} />
                      </Form.Item>
                    </FormGrid>
                  ),
              },
              {
                key: 'contact',
                title: 'Email and phone',
                width: 250,
                render: (f) =>
                  attendees?.[f.name]?.userId ? null : (
                    <FormGrid cols={2}>
                      <Form.Item name={[f.name, 'email']} noStyle rules={[emailRule]}>
                        <Input {...EMAIL_INPUT} placeholder="Email" aria-label={`Email of attendee ${f.name + 1}`} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'phone']} noStyle rules={[phoneRule]}>
                        <Input {...PHONE_INPUT} placeholder="Phone" aria-label={`Phone of attendee ${f.name + 1}`} />
                      </Form.Item>
                    </FormGrid>
                  ),
              },
              {
                key: 'present',
                title: 'Present',
                width: 80,
                align: 'center',
                render: (f) => (
                  <Form.Item name={[f.name, 'present']} valuePropName="checked" noStyle>
                    <Checkbox aria-label={`Attendee ${f.name + 1} was present`} />
                  </Form.Item>
                ),
              },
            ]}
          />
          <Typography.Text type="secondary" style={{ ...small, marginTop: token.marginXS }}>
            Everyone with an email gets the minutes when they are issued.
          </Typography.Text>
        </FormSection>
        <FormSection title="Minutes">
          <LineTable
            name="points"
            label="Point"
            addText="Add point"
            newLine={() => ({ kind: 'NOTE' })}
            columns={[
              {
                key: 'kind',
                title: 'Kind',
                width: 130,
                render: (f) => (
                  <Form.Item name={[f.name, 'kind']} noStyle>
                    <Select style={{ width: '100%' }} aria-label={`Kind of point ${f.name + 1}`} options={MEETING_POINT_KINDS.map((k) => ({ value: k, label: MEETING_POINT_KIND_LABELS[k] }))} />
                  </Form.Item>
                ),
              },
              {
                key: 'text',
                title: 'Point',
                render: (f) => (
                  <Form.Item name={[f.name, 'text']} noStyle>
                    <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} maxLength={2000} placeholder="What was noted or decided" aria-label={`Point ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>
        <FormSection title="Actions">
          <LineTable
            name="actions"
            label="Action"
            addText="Add action"
            newLine={() => ({})}
            columns={[
              {
                key: 'text',
                title: 'What is to be done',
                render: (f) => (
                  <Form.Item name={[f.name, 'text']} noStyle rules={[{ required: true, whitespace: true, message: 'Say what is to be done' }]}>
                    <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={1000} placeholder="Send the revised staircase drawing" aria-label={`Action ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              {
                key: 'owner',
                title: 'Who',
                width: 190,
                render: (f) => (
                  <Form.Item name={[f.name, 'owner']} noStyle>
                    <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Choose" style={{ width: '100%' }} aria-label={`Owner of action ${f.name + 1}`} popupMatchSelectWidth={260} options={ownerOptions} />
                  </Form.Item>
                ),
              },
              {
                key: 'due',
                title: 'By',
                width: 150,
                render: (f) => (
                  <Form.Item name={[f.name, 'dueOn']} noStyle>
                    <DatePicker style={{ width: '100%' }} aria-label={`Due date of action ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              {
                key: 'link',
                title: 'About',
                width: 190,
                render: (f) => (
                  <Form.Item name={[f.name, 'link']} noStyle>
                    <Select
                      allowClear
                      showSearch={{ optionFilterProp: 'label' }}
                      placeholder={projectId ? 'RFI, NCR or variation' : 'Choose the project first'}
                      disabled={!projectId}
                      style={{ width: '100%' }}
                      aria-label={`What action ${f.name + 1} is about`}
                      popupMatchSelectWidth={360}
                      options={linkOptions}
                    />
                  </Form.Item>
                ),
              },
            ]}
          />
          <Typography.Text type="secondary" style={{ ...small, marginTop: token.marginXS }}>
            Each action needs who and by when before the minutes are issued. Our staff see theirs in My work.
          </Typography.Text>
        </FormSection>
      </Form>
    </FormShell>
  );
}

export type ActionMove = 'DONE' | 'DROPPED' | 'MOVE';

/** Close an action as done (on a day, with how), drop it (with why), or move its date. */
export function ActionDialog({ action, move, onClose }: { action: MeetingActionDto | null; move: ActionMove; onClose: () => void }) {
  const [form] = Form.useForm<{ doneOn?: dayjs.Dayjs; note?: string; dueOn?: dayjs.Dayjs | null }>();
  const act = useMeetingAction<MeetingActionDto>();
  const notify = useNotify();
  const open = !!action;
  useEffect(() => {
    if (action) form.setFieldsValue({ doneOn: dayjs(), note: undefined, dueOn: action.dueOn ? dayjs(action.dueOn) : null });
  }, [action, form]);
  const title = move === 'DONE' ? 'Mark done' : move === 'DROPPED' ? 'Drop action' : 'Move the date';
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={title}
      okText={move === 'DONE' ? 'Mark done' : move === 'DROPPED' ? 'Drop' : 'Move'}
      onSubmit={async (v) => {
        const body =
          move === 'DONE' ? { status: 'DONE', doneOn: ymd(v.doneOn), note: v.note?.trim() || null } : move === 'DROPPED' ? { status: 'DROPPED', note: v.note?.trim() } : { dueOn: ymd(v.dueOn) };
        await act.mutateAsync({ method: 'patch', path: `/meetings/actions/${action!.id}`, body });
        notify.saved(move === 'DONE' ? 'Action done' : move === 'DROPPED' ? 'Action dropped' : `Action moved to ${v.dueOn ? formatDate(ymd(v.dueOn)!) : 'no date'}`);
      }}
    >
      <Typography.Paragraph>{action?.text}</Typography.Paragraph>
      <Form form={form} layout="vertical">
        {move === 'DONE' ? (
          <>
            <Form.Item name="doneOn" label="Done on" rules={[{ required: true, message: 'Choose the day it was done' }]}>
              <DatePicker disabledDate={notAfterToday} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="note" label="How">
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} placeholder="Estimate received, sent to the client by letter" />
            </Form.Item>
          </>
        ) : move === 'DROPPED' ? (
          <Form.Item name="note" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why the action is dropped' }]}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} placeholder="Not needed any more: the client changed the design" />
          </Form.Item>
        ) : (
          <Form.Item name="dueOn" label="Due by">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        )}
      </Form>
    </FormShell>
  );
}

/**
 * What the caller may do with an action, beside it: Done, and under More, Move the date or Drop; Reopen once closed. Only
 * its owner, whoever recorded the meeting and managers see these.
 */
export function ActionControls({ a }: { a: MeetingActionDto }) {
  const { modal } = App.useApp();
  const act = useMeetingAction<MeetingActionDto>();
  const notify = useNotify();
  const [move, setMove] = useState<ActionMove | null>(null);
  if (!a.canUpdate) return null;
  const short = a.text.length > 40 ? `${a.text.slice(0, 40)}…` : a.text;
  const reopen = () =>
    modal.confirm({
      title: 'Reopen this action?',
      content: a.text,
      okText: 'Reopen',
      onOk: async () => {
        await act.mutateAsync({ method: 'patch', path: `/meetings/actions/${a.id}`, body: { status: 'OPEN' } });
        notify.saved('Action reopened');
      },
    });
  return (
    <>
      {a.status === 'OPEN' ? (
        <Space size={4}>
          <Button size="small" onClick={() => setMove('DONE')} aria-label={`Done: ${short}`}>
            Done
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'move', label: 'Move the date', onClick: () => setMove('MOVE') },
                { key: 'drop', label: 'Drop', danger: true, onClick: () => setMove('DROPPED') },
              ],
            }}
          >
            <Button size="small" aria-label={`More for: ${short}`}>
              More
            </Button>
          </Dropdown>
        </Space>
      ) : (
        <Button size="small" onClick={reopen} aria-label={`Reopen: ${short}`}>
          Reopen
        </Button>
      )}
      {move ? <ActionDialog action={a} move={move} onClose={() => setMove(null)} /> : null}
    </>
  );
}
