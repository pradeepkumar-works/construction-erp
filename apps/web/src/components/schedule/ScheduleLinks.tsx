'use client';

import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Descriptions, Drawer, Flex, Form, InputNumber, Segmented, Select, Space, Table, Typography, Upload, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import {
  ACTIVITY_LINK_TYPE_LABELS,
  ACTIVITY_LINK_TYPES,
  SCHEDULE_FILE_FORMAT_LABELS,
  linkLabel,
  type ActivityLinkDto,
  type ActivityLinkType,
  type GanttActivityDto,
  type GanttDto,
  type ScheduleFileFormat,
  type ScheduleImportResultDto,
} from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useNotify } from '@/lib/notify';
import { useScheduleAction } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

const floatText = (a: GanttActivityDto) =>
  a.totalFloat === null ? '-' : a.totalFloat < 0 ? `${-a.totalFloat} days short` : a.totalFloat === 0 ? 'None' : `${a.totalFloat} day${a.totalFloat === 1 ? '' : 's'}`;

/**
 * One activity's place in the network (v6 item 114): what it waits on and what waits on it, the dates the links give and
 * its float. Project editors add, change and remove its links here.
 */
export function LinksDrawer({ projectId, data, activity, editor, onClose }: { projectId: string; data: GanttDto; activity: GanttActivityDto | null; editor: boolean; onClose: () => void }) {
  const { token } = theme.useToken();
  const act = useScheduleAction(projectId);
  const notify = useNotify();
  const [form, setForm] = useState<{ link: ActivityLinkDto | null; side: 'pred' | 'succ' } | null>(null);
  const a = activity ? (data.activities.find((x) => x.id === activity.id) ?? activity) : null;
  const preds = a ? data.links.filter((l) => l.successorId === a.id) : [];
  const succs = a ? data.links.filter((l) => l.predecessorId === a.id) : [];
  const row = (l: ActivityLinkDto, other: string) => (
    <Flex key={l.id} justify="space-between" align="center" gap={8} style={{ minHeight: 44, borderTop: `1px solid ${token.colorSplit}` }}>
      <div style={{ minWidth: 0 }}>
        <Typography.Text>{other}</Typography.Text>
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }} translate="no">
          {`${linkLabel(l.type, l.lagDays)} · ${ACTIVITY_LINK_TYPE_LABELS[l.type]}${l.lagDays ? `, ${Math.abs(l.lagDays)} day${Math.abs(l.lagDays) === 1 ? '' : 's'} ${l.lagDays > 0 ? 'after' : 'before'}` : ''}`}
        </Typography.Text>
      </div>
      {editor ? (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Change the link with ${other}`} onClick={() => setForm({ link: l, side: l.successorId === a!.id ? 'pred' : 'succ' })} />
          <ConfirmDelete
            what={`the link with ${other}`}
            onConfirm={async () => {
              await act.mutateAsync({ method: 'delete', path: `/links/${l.id}` });
              notify.saved('Link removed');
            }}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove the link with ${other}`} />
          </ConfirmDelete>
        </Space>
      ) : null}
    </Flex>
  );
  return (
    <Drawer open={!!a} onClose={onClose} title={a?.name} size="default" destroyOnHidden>
      {a ? (
        <Flex vertical gap={16}>
          {a.linkStartsOn ? <Alert type="warning" showIcon title={`Planned to start ${formatDate(a.plannedStart)}, but its links let it start on ${formatDate(a.linkStartsOn)} at the earliest.`} /> : null}
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 'plan', label: 'Planned', children: a.plannedStart ? <span translate="no">{`${formatDate(a.plannedStart)} to ${formatDate(a.plannedEnd)}`}</span> : 'No dates' },
              ...(a.earlyStart ? [{ key: 'early', label: 'Earliest', children: <span translate="no">{`${formatDate(a.earlyStart)} to ${formatDate(a.earlyFinish)}`}</span> }] : []),
              ...(a.lateStart ? [{ key: 'late', label: 'Latest', children: <span translate="no">{`${formatDate(a.lateStart)} to ${formatDate(a.lateFinish)}`}</span> }] : []),
              { key: 'float', label: 'Float', children: <span>{floatText(a)}{a.critical ? <AppTag tone="danger" style={{ marginLeft: 8 }}>Critical</AppTag> : null}</span> },
            ]}
          />
          <div>
            <Flex justify="space-between" align="center">
              <Typography.Title level={3} style={{ fontSize: token.fontSize, margin: 0 }}>{`Waits on (${preds.length})`}</Typography.Title>
              {editor ? (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setForm({ link: null, side: 'pred' })}>
                  Add predecessor
                </Button>
              ) : null}
            </Flex>
            {preds.length ? preds.map((l) => row(l, l.predecessorName)) : <Typography.Text type="secondary">Nothing: it starts on its own date.</Typography.Text>}
          </div>
          <div>
            <Flex justify="space-between" align="center">
              <Typography.Title level={3} style={{ fontSize: token.fontSize, margin: 0 }}>{`Followed by (${succs.length})`}</Typography.Title>
              {editor ? (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setForm({ link: null, side: 'succ' })}>
                  Add successor
                </Button>
              ) : null}
            </Flex>
            {succs.length ? succs.map((l) => row(l, l.successorName)) : <Typography.Text type="secondary">Nothing waits on it.</Typography.Text>}
          </div>
        </Flex>
      ) : null}
      {a && form ? <LinkFormModal projectId={projectId} data={data} activity={a} link={form.link} side={form.side} onClose={() => setForm(null)} /> : null}
    </Drawer>
  );
}

/** Add a predecessor or successor to an activity, or change a link's kind and lag. */
function LinkFormModal({ projectId, data, activity, link, side, onClose }: { projectId: string; data: GanttDto; activity: GanttActivityDto; link: ActivityLinkDto | null; side: 'pred' | 'succ'; onClose: () => void }) {
  const [form] = Form.useForm<{ otherId: string; type: ActivityLinkType; lagDays: number }>();
  const act = useScheduleAction(projectId);
  const notify = useNotify();
  useEffect(() => {
    form.setFieldsValue(link ? { otherId: side === 'pred' ? link.predecessorId : link.successorId, type: link.type, lagDays: link.lagDays } : { type: 'FS', lagDays: 0 });
  }, [link, side, form]);
  const taken = new Set(data.links.filter((l) => (side === 'pred' ? l.successorId === activity.id : l.predecessorId === activity.id)).map((l) => (side === 'pred' ? l.predecessorId : l.successorId)));
  return (
    <FormShell
      open
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={link ? 'Change link' : side === 'pred' ? `What ${activity.name} waits on` : `What waits on ${activity.name}`}
      okText={link ? 'Save' : 'Add link'}
      onSubmit={async (v) => {
        if (link) await act.mutateAsync({ method: 'patch', path: `/links/${link.id}`, body: { type: v.type, lagDays: v.lagDays ?? 0 } });
        else
          await act.mutateAsync({
            path: '/links',
            body: side === 'pred' ? { predecessorId: v.otherId, successorId: activity.id, type: v.type, lagDays: v.lagDays ?? 0 } : { predecessorId: activity.id, successorId: v.otherId, type: v.type, lagDays: v.lagDays ?? 0 },
          });
        notify.saved(link ? 'Link changed' : 'Link added');
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="otherId" label={side === 'pred' ? 'Waits on' : 'Followed by'} rules={[{ required: true, message: 'Choose the activity' }]}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            disabled={!!link}
            options={data.activities.filter((x) => x.id !== activity.id && (!taken.has(x.id) || x.id === (link && (side === 'pred' ? link.predecessorId : link.successorId)))).map((x) => ({ value: x.id, label: x.name }))}
          />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="type" label="Link">
            <Select options={ACTIVITY_LINK_TYPES.map((t) => ({ value: t, label: `${t} · ${ACTIVITY_LINK_TYPE_LABELS[t]}` }))} />
          </Form.Item>
          <Form.Item name="lagDays" label="Lag in days" extra="Negative for a lead">
            <InputNumber min={-365} max={365} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

/** Save the schedule as an MS Project XML or P6 XER file. */
export async function exportSchedule(projectId: string, format: ScheduleFileFormat) {
  const { data } = await api.get<{ fileName: string; mimeType: string; content: string }>(`/projects/${projectId}/schedule/export`, { params: { format } });
  const url = URL.createObjectURL(new Blob([data.content], { type: `${data.mimeType};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: data.fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ACTION_LABELS = { CREATE: 'New', UPDATE: 'New dates', SAME: 'No change' } as const;

/** Read an MS Project XML or P6 XER file: what it would change is shown first, and nothing is saved until Import. Mount it only while open, so each opening starts afresh. */
export function ImportScheduleModal({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ format: ScheduleFileFormat }>();
  const { message } = App.useApp();
  const act = useScheduleAction<ScheduleImportResultDto>(projectId);
  const notify = useNotify();
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<ScheduleImportResultDto | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const format = Form.useWatch('format', form) ?? 'MSP_XML';
  const check = async (f: ScheduleFileFormat, content: string) => {
    setPreview(null);
    setProblem(null);
    try {
      setPreview(await act.mutateAsync({ path: '/schedule/import', body: { format: f, content, dryRun: true } }));
    } catch (e) {
      setProblem(errorMessage(e, 'The file could not be read'));
    }
  };
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={720}
      projectDefault={false}
      title="Import a schedule"
      okText="Import"
      okDisabled={!preview || !file}
      onSubmit={async (v) => {
        const r = await act.mutateAsync({ path: '/schedule/import', body: { format: v.format, content: file!.content } });
        notify.saved(`Schedule imported: ${r.created} added, ${r.updated} with new dates, ${r.links} links`);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ format: 'MSP_XML' }}>
        <Form.Item name="format" label="From">
          <Segmented
            options={(['MSP_XML', 'XER'] as const).map((f) => ({ value: f, label: SCHEDULE_FILE_FORMAT_LABELS[f] }))}
            onChange={(f) => file && void check(f as ScheduleFileFormat, file.content)}
          />
        </Form.Item>
        <Form.Item label="File" extra="Activities are matched by name: a match takes the file's dates, the rest are added. The file's links replace the links between them.">
          <Upload
            accept={format === 'XER' ? '.xer,.txt' : '.xml'}
            maxCount={1}
            showUploadList={false}
            beforeUpload={(f) => {
              if (f.size > 4_000_000) {
                message.error('The file is too big: at most 4 MB');
                return Upload.LIST_IGNORE;
              }
              void f.text().then((content) => {
                setFile({ name: f.name, content });
                void check(format, content);
              });
              return false;
            }}
          >
            <Button icon={<UploadOutlined />}>{file ? `Change file (${file.name})` : 'Choose file'}</Button>
          </Upload>
        </Form.Item>
      </Form>
      {problem ? <Alert type="error" showIcon title={problem} /> : null}
      {preview ? (
        <Flex vertical gap={8}>
          <Typography.Paragraph style={{ margin: 0 }}>
            {`${preview.activities.length} activities read: ${preview.created} to add, ${preview.updated} with new dates, ${preview.activities.length - preview.created - preview.updated} unchanged; ${preview.links} links.`}
          </Typography.Paragraph>
          {preview.skipped.length ? <Alert type="info" showIcon title="Left out" description={preview.skipped.slice(0, 8).join('; ') + (preview.skipped.length > 8 ? '…' : '')} /> : null}
          <Table
            size="small"
            rowKey="name"
            pagination={false}
            scroll={{ x: 540, y: 240 }}
            dataSource={preview.activities}
            columns={[
              { title: 'Activity', dataIndex: 'name', width: 220 },
              { title: 'Dates', key: 'dates', width: 210, render: (_, r) => <span translate="no">{`${formatDate(r.start)} to ${formatDate(r.end)}`}</span> },
              { title: 'Change', dataIndex: 'action', width: 110, render: (v: keyof typeof ACTION_LABELS) => <AppTag color={v === 'CREATE' ? 'blue' : v === 'UPDATE' ? 'gold' : undefined}>{ACTION_LABELS[v]}</AppTag> },
            ]}
          />
        </Flex>
      ) : null}
    </FormShell>
  );
}
