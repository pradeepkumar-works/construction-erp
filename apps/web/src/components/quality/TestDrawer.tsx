'use client';

import { DeleteInMenu } from '@/components/record/MoreActions';
import React, { useState } from 'react';
import { App, Button, Descriptions, Divider, Drawer, InputNumber, Skeleton, Space, Table, Typography } from 'antd';
import { EditOutlined, WarningOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QualityTestDto, QualityTestReadingDto } from '@erp/shared';
import { TEST_KIND_LABELS, canEditTest, canRaiseNcr, canRecordTest, specRange } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useNcrs, useQualityTest } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { NcrStatusTag, TestResultTag } from './qualityUi';
import { TestFormModal } from './TestFormModal';
import { NcrFormModal, type NcrPrefill } from './NcrFormModal';
import { RecordLink } from '@/components/record/RecordLink';
import { themeFontSize } from '@/lib/theme';

/** One reading's value with a Save button; a recorded value can be corrected the same way. */
function ReadingInput({ test, reading }: { test: QualityTestDto; reading: QualityTestReadingDto }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [value, setValue] = useState<string | null>(reading.value);
  const save = useMutation({
    mutationFn: async () => (await api.post<QualityTestDto>(`/quality/tests/${test.id}/readings/${reading.id}`, { value: value ?? null })).data,
    onSuccess: (x) => {
      message.success(x.result === 'FAIL' ? `${x.testNo} failed` : `${reading.label} result saved`);
      qc.invalidateQueries({ queryKey: ['quality'] });
    },
    meta: FAIL_NOTICE,
  });
  const changed = (value ?? null) !== (reading.value ?? null);
  return (
    <Space.Compact>
      <InputNumber<string> stringMode size="small" style={{ width: 110 }} value={value} onChange={(v) => setValue(v)} aria-label={`${reading.label} result`} placeholder={test.unit ?? 'Value'} min="0" />
      <Button size="small" type={changed ? 'primary' : 'default'} disabled={!changed} loading={save.isPending} onClick={() => save.mutate()}>
        Save
      </Button>
    </Space.Compact>
  );
}

export function TestDrawer({ id, open, onClose, onOpenNcr }: { id: string | null; open: boolean; onClose: () => void; onOpenNcr?: (id: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQualityTest(id ?? undefined);
  const { data: ncrs } = useNcrs(id ? { qualityTestId: id, pageSize: 50 } : undefined);
  const [editing, setEditing] = useState(false);
  const [ncrPrefill, setNcrPrefill] = useState<NcrPrefill | null>(null);
  const mayRecord = !!user && canRecordTest(user.roleKey);
  const mayEdit = !!user && !!data && canEditTest(user, data);
  const mayRaise = !!user && canRaiseNcr(user.roleKey);

  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/quality/tests/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quality'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });

  const spec = data ? specRange(data.specMin, data.specMax, data.unit) : null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={720}
      title={
        data ? (
          <span>
            {data.testNo} <TestResultTag result={data.result} />
          </span>
        ) : (
          'Test'
        )
      }
      extra={
        data ? (
          <Space>
            {mayRaise && data.result === 'FAIL' ? (
              <Button
                size="small"
                danger
                icon={<WarningOutlined />}
                onClick={() =>
                  setNcrPrefill({
                    projectId: data.projectId,
                    qualityTestId: data.id,
                    activityId: data.activityId,
                    location: data.location,
                    source: `${data.testNo}, ${data.title}`,
                    title: `${TEST_KIND_LABELS[data.kind]} below specification: ${data.title}`,
                    description: `${data.testNo}: ${data.readings
                      .filter((r) => r.value !== null)
                      .map((r) => `${r.label} ${Number(r.value)}${data.unit ? ` ${data.unit}` : ''}`)
                      .join(', ')}${spec ? ` against ${spec} required` : ''}${data.specification ? ` (${data.specification})` : ''}.`,
                  })
                }
              >
                New NCR
              </Button>
            ) : null}
            {mayEdit ? (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            {mayEdit ? (
              <DeleteInMenu what={`test ${data.testNo}`} description="Its NCRs stay on record." onConfirm={() => remove.mutateAsync()} />
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
              { key: 'title', label: 'Sample', children: data.title, span: 2 },
              { key: 'kind', label: 'Test', children: TEST_KIND_LABELS[data.kind] },
              { key: 'sampled', label: 'Sampled on', children: formatDate(data.sampledOn) },
              { key: 'project', label: 'Project', children: data.projectName, span: 2 },
              { key: 'activity', label: 'Activity', children: data.activityName ?? '-' },
              { key: 'location', label: 'Location', children: data.location ?? '-' },
              ...(data.segments.length ? [{ key: 'pipes', label: 'Pipes tested', children: <span translate="no">{data.segments.map((x) => x.label).join('; ')}</span>, span: 2 }] : []),
              { key: 'spec', label: 'Specification', children: data.specification ?? '-', span: 2 },
              { key: 'range', label: 'Passes at', children: spec ?? 'As judged by the tester' },
              { key: 'result', label: 'Result', children: <TestResultTag result={data.result} /> },
              ...(data.labName
                ? [
                    {
                      key: 'lab',
                      label: 'Lab',
                      span: 2,
                      children: (
                        <span translate="no">
                          {[
                            data.labName,
                            data.sentOn ? `sent ${formatDate(data.sentOn)}` : null,
                            data.reportOn ? `report ${[data.labReportNo, formatDate(data.reportOn)].filter(Boolean).join(' of ')}` : data.sentOn ? 'report awaited' : null,
                            data.labCharge ? formatINR(data.labCharge) : null,
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      ),
                    },
                  ]
                : []),
              ...(data.instrumentName
                ? [
                    {
                      key: 'instrument',
                      label: 'Instrument',
                      span: 2,
                      children: (
                        <Space size={4} wrap>
                          <span translate="no">{data.instrumentName}</span>
                          {data.outOfCalibration ? <AppTag tone="danger">Out of calibration that day</AppTag> : null}
                        </Space>
                      ),
                    },
                  ]
                : []),
              { key: 'remarks', label: 'Remarks', children: data.remarks ?? '-', span: 2 },
              { key: 'by', label: 'Recorded by', children: `${data.createdByName}, ${formatDateTime(data.createdAt)}`, span: 2 },
            ]}
          />
          <Divider titlePlacement="start" plain>
            Readings
          </Divider>
          <Table<QualityTestReadingDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.readings}
            columns={[
              { title: 'Reading', dataIndex: 'label' },
              { title: 'Due', dataIndex: 'dueOn', width: 120, render: (v: string | null, r) => (v ? <span className={r.overdue ? 'text-danger' : undefined}>{formatDate(v)}</span> : '-') },
              {
                title: `Value${data.unit ? ` (${data.unit})` : ''}`,
                key: 'value',
                width: 190,
                render: (_, r) => (mayRecord ? <ReadingInput key={`${r.id}:${r.value}`} test={data} reading={r} /> : r.value !== null ? Number(r.value) : <span className="text-muted">-</span>),
              },
              { title: 'Tested on', dataIndex: 'testedOn', width: 110, render: (v: string | null) => (v ? formatDate(v) : '-') },
            ]}
          />
          {spec && data.readings.length > 1 ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: themeFontSize('fontSizeSM') }}>
              The last reading ({data.readings[data.readings.length - 1].label}) decides the result.
            </Typography.Paragraph>
          ) : null}
          <Divider titlePlacement="start" plain>
            NCRs{ncrs?.total ? <Typography.Text type="secondary" translate="no">{` ${ncrs.total}`}</Typography.Text> : null}
          </Divider>
          {ncrs?.items.length ? (
            ncrs.items.map((n) => (
              <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                {onOpenNcr ? <RecordLink onOpen={() => onOpenNcr(n.id)}>{n.ncrNo}</RecordLink> : <span>{n.ncrNo}</span>}
                <span>{n.title}</span>
                <NcrStatusTag status={n.status} />
              </div>
            ))
          ) : (
            <Typography.Text type="secondary">None</Typography.Text>
          )}
          <Divider titlePlacement="start" plain>
            Photos / lab reports ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
        </>
      )}
      <TestFormModal open={editing} onClose={() => setEditing(false)} test={data} />
      <NcrFormModal open={!!ncrPrefill} onClose={() => setNcrPrefill(null)} prefill={ncrPrefill} onSaved={(x) => onOpenNcr?.(x.id)} />
    </Drawer>
  );
}
