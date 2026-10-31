'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Divider, Drawer, Form, Input, Segmented, Space, Table, Typography } from 'antd';
import type { UseQueryResult } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { CHECK_LEVEL_LABELS, CHECK_LEVEL_SHARE, CHECK_OUTCOME_LABELS, isGuest, type CheckOutcome, type PortalMeasurementDto, type PortalMeasurementsDto } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCheckMeasurement } from '@/lib/queries';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { AppTag } from '@/components/common/AppTag';
import { DatePicker } from '@/components/common/DatePicker';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { RecordLink } from '@/components/record/RecordLink';
import { FormGrid } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';
import { CheckCoverage } from './CheckCoverage';

const OUTCOME_TONE: Record<CheckOutcome, 'success' | 'danger' | 'pending'> = { AGREED: 'success', LESS: 'danger', MORE: 'pending' };

/**
 * Check measurement (item 172): the contractor's approved sheets, with each level's share checked. The caller checks a sheet
 * at their level on the project; the sheets they still need are listed first.
 */
export function PortalMeasurements({ measurements, openId, onOpen }: { measurements: UseQueryResult<PortalMeasurementsDto>; openId: string | null; onOpen: (id: string | null) => void }) {
  const { data, isLoading, error, refetch } = measurements;
  // Their next sheets first, until their share is met; then every approved sheet.
  const [chosen, setChosen] = useState<'next' | 'all' | null>(null);
  const show = chosen ?? (data?.level && data.toCheck.length ? 'next' : 'all');
  const toCheck = new Set(data?.toCheck ?? []);
  const rows = (data?.sheets ?? []).filter((s) => show === 'all' || !data?.level || toCheck.has(s.id));
  const open = data?.sheets.find((s) => s.id === openId) ?? null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data ? (
        <Card size="small" style={{ margin: 12 }}>
          <Typography.Paragraph style={{ marginTop: 0 }}>
            {data.level
              ? `You check as ${CHECK_LEVEL_LABELS[data.level].toLowerCase()}: at least ${CHECK_LEVEL_SHARE[data.level]}% of the measurements by value before you certify a bill.`
              : "You have no check level on this project. The contractor's project manager sets it on the project's team; until then you can read the sheets but not record a check."}
          </Typography.Paragraph>
          <CheckCoverage coverage={data.coverage} level={data.level} />
        </Card>
      ) : null}
      {data?.level ? (
        <div style={{ padding: '0 12px 8px' }}>
          <Segmented
            aria-label="Sheets to show"
            value={show}
            onChange={(v) => setChosen(v as 'next' | 'all')}
            options={[
              { value: 'next', label: `To check next (${data.toCheck.length})` },
              { value: 'all', label: `All approved (${data.sheets.length})` },
            ]}
          />
        </div>
      ) : null}
      <Table<PortalMeasurementDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={rows}
        onRow={(r) => ({ onClick: () => onOpen(r.id), style: { cursor: 'pointer' } })}
        locale={{ emptyText: show === 'next' && data?.sheets.length ? 'You have checked your share. Show all approved sheets to check more.' : 'No approved measurements yet' }}
        scroll={{ x: 960 }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        columns={[
          { title: 'MB no.', dataIndex: 'mbNo', width: 140, render: (v: string, r) => <RecordLink onOpen={() => onOpen(r.id)}>{v}</RecordLink> },
          { title: 'Date', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) },
          {
            title: 'Item',
            key: 'item',
            render: (_, r) => (
              <div>
                <span translate="no">{r.boqItemNo}</span> {r.boqItemDescription}
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {r.location}
                </div>
              </div>
            ),
          },
          { title: 'Quantity', key: 'qty', align: 'right', width: 130, render: (_, r) => <span translate="no">{`${formatQty(r.totalQty)} ${r.unit}`}</span> },
          { title: 'Amount', dataIndex: 'amount', align: 'right', width: 130, render: (v: string) => <span translate="no">{formatINR(v)}</span> },
          {
            title: 'Checked by',
            key: 'checks',
            width: 220,
            render: (_, r) =>
              r.checks.length ? (
                <Space size={4} wrap>
                  {r.checks.map((c) => (
                    <AppTag key={c.id} tone={OUTCOME_TONE[c.outcome]}>
                      {CHECK_LEVEL_LABELS[c.level]}
                    </AppTag>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">Not checked</Typography.Text>
              ),
          },
        ]}
      />
      <MeasurementDrawer data={open} level={data?.level ?? null} onClose={() => onOpen(null)} />
    </>
  );
}

function MeasurementDrawer({ data, level, onClose }: { data: PortalMeasurementDto | null; level: PortalMeasurementsDto['level']; onClose: () => void }) {
  const { user } = useAuth();
  const mayCheck = !!user && isGuest(user.roleKey) && !!level;
  return (
    <Drawer open={!!data} onClose={onClose} size={760} destroyOnHidden title={data ? <span translate="no">{data.mbNo}</span> : 'Measurement'}>
      {data && (
        <>
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'item', label: 'BOQ item', span: 2, children: `${data.boqItemNo} ${data.boqItemDescription}` },
              { key: 'loc', label: 'Location', span: 2, children: data.location },
              { key: 'date', label: 'Measured on', children: formatDate(data.date) },
              { key: 'bill', label: 'Billed in', children: data.billLabel ?? 'Not billed yet' },
              { key: 'qty', label: 'Recorded', children: <span translate="no">{`${formatQty(data.totalQty)} ${data.unit}`}</span> },
              { key: 'amt', label: 'Amount', children: <span translate="no">{formatINR(data.amount)}</span> },
            ]}
          />
          <Divider titlePlacement="start" plain>
            Lines
          </Divider>
          <Table
            rowKey={(_, i) => String(i)}
            size="small"
            pagination={false}
            dataSource={data.lines}
            scroll={{ x: 600 }}
            columns={[
              { title: 'Description', dataIndex: 'description' },
              { title: 'Nos', dataIndex: 'nos', align: 'right', width: 70, render: (v: string | null) => (v ? formatQty(v) : '') },
              { title: 'L', dataIndex: 'length', align: 'right', width: 80, render: (v: string | null) => (v ? formatQty(v) : '') },
              { title: 'B', dataIndex: 'breadth', align: 'right', width: 80, render: (v: string | null) => (v ? formatQty(v) : '') },
              { title: 'D', dataIndex: 'depth', align: 'right', width: 80, render: (v: string | null) => (v ? formatQty(v) : '') },
              { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 110, render: (v: string, l) => (l.deduct ? `less ${formatQty(v.replace('-', ''))}` : formatQty(v)) },
            ]}
          />
          <Divider titlePlacement="start" plain>
            Checks
          </Divider>
          {data.checks.length ? (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={data.checks}
              columns={[
                { title: 'By', key: 'by', render: (_, c) => `${c.checkedByName}, ${CHECK_LEVEL_LABELS[c.level].toLowerCase()}` },
                { title: 'On', dataIndex: 'checkedOn', width: 110, render: (v: string) => formatDate(v) },
                { title: 'Found', dataIndex: 'checkedQty', align: 'right', width: 110, render: (v: string) => formatQty(v) },
                { title: 'Result', dataIndex: 'outcome', width: 160, render: (o: CheckOutcome, c) => <span><AppTag tone={OUTCOME_TONE[o]}>{CHECK_OUTCOME_LABELS[o]}</AppTag>{c.note ? <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{c.note}</div> : null}</span> },
              ]}
            />
          ) : (
            <Typography.Paragraph type="secondary">Nobody has checked this sheet yet.</Typography.Paragraph>
          )}
          {mayCheck ? <CheckForm key={data.id} sheet={data} mine={data.checks.find((c) => c.checkedById === user?.id) ?? null} /> : null}
          {data.attachments.length ? (
            <>
              <Divider titlePlacement="start" plain>
                Photos and sketches
              </Divider>
              <AttachmentGallery attachments={data.attachments} />
            </>
          ) : null}
        </>
      )}
    </Drawer>
  );
}

/** The caller's own check: the quantity they found, the day and a note. Checking again replaces it. */
function CheckForm({ sheet, mine }: { sheet: PortalMeasurementDto; mine: PortalMeasurementDto['checks'][number] | null }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const check = useCheckMeasurement();
  const [form] = Form.useForm<{ checkedQty: number | null; checkedOn: dayjs.Dayjs; note?: string }>();
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (v: { checkedQty: number | null; checkedOn: dayjs.Dayjs; note?: string }) => {
    setProblem(null);
    try {
      const out = await check.mutateAsync({ id: sheet.id, checkedQty: String(v.checkedQty ?? 0), checkedOn: v.checkedOn.format('YYYY-MM-DD'), note: v.note?.trim() || null });
      const c = out.checks.find((x) => x.checkedById === user?.id);
      message.success(c && c.outcome !== 'AGREED' ? `Check of ${sheet.mbNo} recorded: ${CHECK_OUTCOME_LABELS[c.outcome].toLowerCase()}. The QS is told.` : `Check of ${sheet.mbNo} recorded: it agrees`);
    } catch (e) {
      setProblem(errorMessage(e));
    }
  };
  return (
    <>
      <Divider titlePlacement="start" plain>
        {mine ? 'Your check' : 'Record your check'}
      </Divider>
      {problem ? <Alert type="error" showIcon role="alert" style={{ marginBottom: 8 }} title={problem} /> : null}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={save}
        initialValues={{ checkedQty: mine ? Number(mine.checkedQty) : Number(sheet.totalQty), checkedOn: mine ? dayjs(mine.checkedOn) : dayjs(), note: mine?.note ?? '' }}
      >
        <FormGrid cols={2}>
          <Form.Item name="checkedQty" label="Quantity you found" rules={[{ required: true, message: 'Enter the quantity you measured' }]}>
            <QuantityInput unit={sheet.unit} />
          </Form.Item>
          <Form.Item name="checkedOn" label="Checked on" rules={[{ required: true, message: 'Pick the day you checked it' }]}>
            <DatePicker allowClear={false} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(sheet.date), 'day')} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={2000} placeholder="Where it differs, and why" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={check.isPending}>
          {mine ? 'Update my check' : 'Record my check'}
        </Button>
      </Form>
    </>
  );
}
