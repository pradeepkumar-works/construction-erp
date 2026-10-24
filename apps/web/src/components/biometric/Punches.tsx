'use client';

import React, { useState } from 'react';
import { Alert, App, Button, DatePicker, Form, Select, Space, Table, Typography, Upload } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps, UploadProps } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { BiometricIngestResultDto, BiometricPunchDto, BiometricPunchResult } from '@erp/shared';
import { BIOMETRIC_PUNCH_RESULTS, BIOMETRIC_PUNCH_RESULT_LABELS } from '@erp/shared';
import { loadXlsx } from '@/lib/exportExcel';
import { useBiometricAction, useBiometricDevices, useBiometricPunches } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';

const RESULT_COLOR: Record<BiometricPunchResult, string> = { APPLIED: 'green', UNMATCHED: 'orange', LOCKED: 'default', SKIPPED: 'default' };

/** A punch file from the device or its software: Excel is turned into CSV here, the API reads the columns. */
function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ deviceId: string }>();
  const { message } = App.useApp();
  const { data: devices } = useBiometricDevices(open);
  const act = useBiometricAction<BiometricIngestResultDto>();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const beforeUpload: UploadProps['beforeUpload'] = (f) => {
    setReadError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (/\.(xlsx|xls)$/i.test(f.name)) {
          const XLSX = await loadXlsx();
          const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd hh:mm:ss' });
          setFile({ name: f.name, text: XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { dateNF: 'yyyy-mm-dd hh:mm:ss' }) });
        } else setFile({ name: f.name, text: new TextDecoder().decode(e.target?.result as ArrayBuffer) });
      } catch {
        setReadError('The file could not be read. Save it as Excel or CSV and try again.');
      }
    };
    reader.readAsArrayBuffer(f);
    return false;
  };
  const deviceOptions = (devices ?? []).filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }));
  return (
    <FormShell
      open={open}
      onClose={() => {
        setFile(null);
        onClose();
      }}
      form={form}
      layout="modal"
      width={600}
      projectDefault={false}
      title="Import a punch file"
      okText="Import"
      onSubmit={async (v) => {
        if (!file) throw new Error('Choose the punch file');
        const r = await act.mutateAsync({ path: '/biometric/import', body: { deviceId: v.deviceId, text: file.text } });
        const text = `${r.received} ${r.received === 1 ? 'punch' : 'punches'} read: ${r.added} new (${r.duplicates} already in), ${r.applied} marked attendance, ${r.unmatched} wait for their user number to be matched`;
        if (r.errors.length) message.warning(`${text}. ${r.errors.length === 1 ? '1 line' : `${r.errors.length} lines`} could not be read: ${r.errors[0]}`, 10);
        else message.success(text, 6);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="deviceId" label="From device" rules={[{ required: true, message: 'Choose the device the punches came from' }]} extra="Register it under Devices first; its site is where workers are marked.">
          <Select showSearch={{ optionFilterProp: 'label' }} options={deviceOptions} />
        </Form.Item>
        <Form.Item label="Punch file" required extra="Excel or CSV with the user number and the date and time on each line, as the device software exports it.">
          <Upload.Dragger accept=".xlsx,.xls,.csv,.txt,.dat" beforeUpload={beforeUpload} showUploadList={false} maxCount={1}>
            <p>
              <UploadOutlined /> {file ? file.name : 'Drop the file here or click to choose it'}
            </p>
          </Upload.Dragger>
        </Form.Item>
        {readError && <Alert type="error" showIcon title={readError} />}
      </Form>
    </FormShell>
  );
}

/** A day's punches from every device, newest first, with what each did. */
export function Punches() {
  const [date, setDate] = useState(() => dayjs());
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [result, setResult] = useState<BiometricPunchResult | undefined>();
  const [importing, setImporting] = useState(false);
  const { data: devices } = useBiometricDevices();
  const { data, isLoading, isFetching, error, refetch } = useBiometricPunches({ date: date.format('YYYY-MM-DD'), deviceId, result });

  const columns: TableProps<BiometricPunchDto>['columns'] = [
    { title: 'Time', dataIndex: 'time', width: 80, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'User number', dataIndex: 'pin', width: 120, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'Who', key: 'who', ellipsis: true, render: (_, p) => (p.personName ? <span translate="no">{`${p.personName} (${p.personCode})`}</span> : <Typography.Text type="secondary">Not matched</Typography.Text>) },
    { title: 'Device', dataIndex: 'deviceName', width: 180, ellipsis: true },
    { title: 'Attendance', dataIndex: 'result', width: 140, render: (v: BiometricPunchResult) => <AppTag color={RESULT_COLOR[v]}>{BIOMETRIC_PUNCH_RESULT_LABELS[v]}</AppTag> },
    { title: 'Why', dataIndex: 'note', ellipsis: true, render: (v: string | null) => v ?? '' },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Space wrap>
          <DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} aria-label="Day" />
          <Select allowClear placeholder="Every device" value={deviceId} onChange={setDeviceId} options={(devices ?? []).map((d) => ({ value: d.id, label: d.name }))} style={{ minWidth: 180 }} aria-label="Device" />
          <Select allowClear placeholder="Any result" value={result} onChange={setResult} options={BIOMETRIC_PUNCH_RESULTS.map((r) => ({ value: r, label: BIOMETRIC_PUNCH_RESULT_LABELS[r] }))} style={{ minWidth: 150 }} aria-label="Attendance" />
        </Space>
        <Button icon={<UploadOutlined />} onClick={() => setImporting(true)}>
          Import punch file
        </Button>
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<BiometricPunchDto>
          rowKey="id"
          size="small"
          loading={isLoading || isFetching}
          columns={columns}
          dataSource={data ?? []}
          pagination={{ pageSize: 100, hideOnSinglePage: true }}
          scroll={{ x: 860 }}
          locale={{ emptyText: 'No punches on this day' }}
        />
      )}
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
