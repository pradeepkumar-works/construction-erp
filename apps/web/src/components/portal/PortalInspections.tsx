'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Descriptions, Divider, Drawer, Input, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { EyeOutlined } from '@/components/common/icons';
import type { UseQueryResult } from '@tanstack/react-query';
import type { InspectionResult, PortalInspectionDto } from '@erp/shared';
import { INSPECTION_STATUS_LABELS, checklistCounts, isGuest } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useWitnessInspection } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ResultTag } from '@/components/inspections/InspectionDrawer';
import { themeFontSize } from '@/lib/theme';

/** Inspections requested on the project: the client's engineer can see the checklist and record that they attended. */
export function PortalInspections({ inspections, openId, onOpen }: { inspections: UseQueryResult<PortalInspectionDto[]>; openId: string | null; onOpen: (id: string | null) => void }) {
  const { data, isLoading, error, refetch } = inspections;
  const open = data?.find((x) => x.id === openId) ?? null;
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<PortalInspectionDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        onRow={(r) => ({ onClick: () => onOpen(r.id), style: { cursor: 'pointer' } })}
        locale={{ emptyText: 'No inspections requested yet' }}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        columns={[
          { title: 'No.', dataIndex: 'inspectionNo', width: 130 },
          {
            title: 'Activity',
            dataIndex: 'activityName',
            render: (v: string, r) => (
              <span>
                {v}
                {r.holdPoint && (
                  <AppTag tone="pending" style={{ marginLeft: 8 }}>
                    Hold point
                  </AppTag>
                )}
              </span>
            ),
          },
          { title: 'Location', dataIndex: 'location', ellipsis: true },
          { title: 'Ready on', dataIndex: 'date', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Status', dataIndex: 'status', width: 120, render: (s: PortalInspectionDto['status']) => <StatusTag status={s} labels={INSPECTION_STATUS_LABELS} /> },
          { title: 'Attended', key: 'w', width: 160, render: (_, r) => (r.witnessedAt ? `${r.witnessedByName ?? ''}, ${formatDate(r.witnessedAt)}` : '-') },
        ]}
      />
      <PortalInspectionDrawer data={open} onClose={() => onOpen(null)} />
    </>
  );
}

function PortalInspectionDrawer({ data, onClose }: { data: PortalInspectionDto | null; onClose: () => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const witness = useWitnessInspection();
  const [note, setNote] = useState('');
  useEffect(() => setNote(data?.witnessNote ?? ''), [data?.id, data?.witnessNote]);
  const counts = data ? checklistCounts(data.checklist) : null;
  const mayWitness = !!user && isGuest(user.roleKey) && data?.status === 'SUBMITTED';

  const save = async () => {
    if (!data) return;
    try {
      await witness.mutateAsync({ id: data.id, note: note.trim() || null });
      message.success(`Recorded that you attended ${data.inspectionNo}`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Drawer
      open={!!data}
      onClose={onClose}
      size={720}
      title={
        data ? (
          <span>
            {data.inspectionNo} <StatusTag status={data.status} labels={INSPECTION_STATUS_LABELS} />
          </span>
        ) : (
          'Inspection'
        )
      }
      destroyOnHidden
    >
      {data && (
        <>
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'activity', label: 'Activity', children: data.activityName, span: 2 },
              { key: 'loc', label: 'Location', children: data.location, span: 2 },
              { key: 'date', label: 'Ready on', children: formatDate(data.date) },
              { key: 'by', label: 'Requested by', children: data.submittedByName ?? '-' },
              { key: 'remarks', label: 'Remarks', children: data.remarks ?? '-', span: 2 },
              ...(data.reviewedByName
                ? [
                    { key: 'insp', label: 'Inspected by', children: `${data.reviewedByName}${data.reviewedAt ? `, ${formatDateTime(data.reviewedAt)}` : ''}`, span: 2 },
                    { key: 'note', label: "Inspector's note", children: data.reviewNote ?? '-', span: 2 },
                  ]
                : []),
              ...(data.witnessedAt
                ? [{ key: 'w', label: 'Attended for the client', children: `${data.witnessedByName ?? ''}, ${formatDateTime(data.witnessedAt)}${data.witnessNote ? `: ${data.witnessNote}` : ''}`, span: 2 }]
                : []),
            ]}
          />
          {mayWitness && (
            <>
              <Divider titlePlacement="start" plain>
                Attend
              </Divider>
              <Typography.Paragraph type="secondary">Record that you were present for this inspection. Your remarks go to the site team and the quality engineer.</Typography.Paragraph>
              <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Remarks (optional)" aria-label="Your remarks" maxLength={1000} />
              <Button type="primary" icon={<EyeOutlined />} style={{ marginTop: 8 }} loading={witness.isPending} onClick={save}>
                {data.witnessedAt ? 'Update my remarks' : 'I attended this inspection'}
              </Button>
            </>
          )}
          {data.checklist.length > 0 && (
            <>
              <Divider titlePlacement="start" plain>
                Checklist{counts && counts.open < counts.total ? ` (${counts.pass} OK, ${counts.fail} not OK${counts.na ? `, ${counts.na} N/A` : ''})` : ''}
              </Divider>
              <Table
                rowKey={(_, i) => String(i)}
                size="small"
                pagination={false}
                dataSource={data.checklist}
                columns={[
                  { title: '#', key: 'n', width: 40, render: (_, __, i) => i + 1 },
                  { title: 'Point', dataIndex: 'item', render: (v: string, c) => (c.remark ? <div>{v}<div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{c.remark}</div></div> : v) },
                  { title: 'Result', dataIndex: 'result', width: 120, render: (r: InspectionResult | null) => <ResultTag result={r} /> },
                ]}
              />
            </>
          )}
          <Divider titlePlacement="start" plain>
            Photos ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
        </>
      )}
    </Drawer>
  );
}
