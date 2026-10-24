'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Select, Space, Table, Typography, Upload } from 'antd';
import { StageBar } from '@/components/record/StageBar';
import type { UploadProps } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { loadXlsx } from '@/lib/exportExcel';

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
  /** Header names that map to it, lower case with spaces and punctuation taken out. */
  aliases: string[];
  numeric?: boolean;
}

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

type Row = Record<string, string> & { _key: string; _error: string };

/**
 * Rows from the first sheet of an Excel or CSV file (v6 item 110): the columns are matched to the fields by their
 * headers and can be changed, each row is checked, and the good ones go to `onImport`. Used for a schedule of rates and
 * a bid BOQ; the BOQ's own import (`BoqImportModal`) came first and works the same way.
 */
export function ExcelImportModal({
  open,
  onClose,
  title,
  hint,
  fields,
  template,
  check,
  noun,
  onImport,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** What the sheet should look like. */
  hint: string;
  fields: ImportField[];
  /** A sample sheet to download: the file name and its rows (the first is the header). */
  template: { fileName: string; rows: (string | number)[][] };
  /** Why a row cannot be imported, or null. */
  check?: (row: Record<string, string>) => string | null;
  /** What a row is ("item"), for the counts. */
  noun: string;
  /** Imports the good rows; resolves when done (the modal closes). */
  onImport: (rows: Record<string, string>[]) => Promise<unknown>;
  extra?: React.ReactNode;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | undefined>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFileName(null);
    setHeaders([]);
    setRaw([]);
    setMapping({});
    setParseError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await loadXlsx();
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' });
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        if (!json.length) return setParseError('The first sheet has no rows under its header. Check the file and choose it again.');
        const hdrs = Object.keys(json[0]);
        const auto: Record<string, string> = {};
        for (const f of fields) {
          const hit = hdrs.find((h) => f.aliases.includes(norm(h))) ?? hdrs.find((h) => f.aliases.some((a) => norm(h).includes(a)));
          if (hit && !Object.values(auto).includes(hit)) auto[f.key] = hit;
        }
        setHeaders(hdrs);
        setRaw(json);
        setMapping(auto);
        setFileName(file.name);
      } catch (err) {
        setParseError(err instanceof Error ? `The file could not be read: ${err.message}` : 'The file could not be read. Save it as .xlsx and try again.');
      }
    };
    reader.readAsArrayBuffer(file);
    return false;
  };

  const rows: Row[] = useMemo(
    () =>
      raw
        .map((r, i) => {
          const row: Record<string, string> = {};
          for (const f of fields) {
            const h = mapping[f.key];
            const v = h ? String(r[h] ?? '').trim() : '';
            row[f.key] = f.numeric ? v.replace(/[,₹\s]/g, '') : v;
          }
          const missing = fields.filter((f) => f.required && !row[f.key]).map((f) => f.label.toLowerCase());
          const bad = fields.filter((f) => f.numeric && row[f.key] && !Number.isFinite(Number(row[f.key]))).map((f) => f.label.toLowerCase());
          const error = missing.length ? `No ${missing.join(', ')}` : bad.length ? `Not a number: ${bad.join(', ')}` : (check?.(row) ?? '');
          return { ...row, _key: String(i), _error: error } as Row;
        })
        .filter((r) => fields.some((f) => r[f.key])),
    [raw, mapping, fields, check],
  );
  const good = rows.filter((r) => !r._error);
  const missingRequired = fields.filter((f) => f.required && !mapping[f.key]);
  const step = raw.length === 0 ? 0 : missingRequired.length ? 1 : 2;

  const downloadTemplate = async () => {
    const XLSX = await loadXlsx();
    const ws = XLSX.utils.aoa_to_sheet(template.rows);
    ws['!cols'] = template.rows[0].map((h) => ({ wch: String(h).length > 12 ? 50 : 12 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, template.fileName);
  };

  const plural = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`;

  return (
    <Modal
      open={open}
      title={title}
      width={960}
      onCancel={close}
      destroyOnHidden
      footer={
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={() => void downloadTemplate()}>
            Download template
          </Button>
          {raw.length > 0 && <Button onClick={reset}>Choose another file</Button>}
          <Button onClick={close}>Cancel</Button>
          <Button
            type="primary"
            disabled={!good.length || missingRequired.length > 0}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onImport(good.map(({ _key: _k, _error: _e, ...r }) => r));
                close();
              } catch {
                // The failure notice says what went wrong; the rows stay for another try.
              } finally {
                setBusy(false);
              }
            }}
          >
            {good.length ? `Import ${plural(good.length)}` : 'Import'}
          </Button>
        </Space>
      }
    >
      <StageBar current={step} label="Import steps" items={[{ title: 'Choose the file' }, { title: 'Match the columns' }, { title: 'Check and import' }]} style={{ marginBottom: 16 }} />
      {parseError && <Alert type="error" showIcon title={parseError} style={{ marginBottom: 12 }} />}
      {raw.length === 0 ? (
        <Upload.Dragger accept=".xlsx,.xls,.csv" beforeUpload={beforeUpload} showUploadList={false} maxCount={1}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag an .xlsx or .csv file here</p>
          <p className="ant-upload-hint">{hint}</p>
        </Upload.Dragger>
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            <span translate="no">{fileName}</span>
            {`: ${raw.length} row${raw.length === 1 ? '' : 's'}. Match each field to a column of the sheet.`}
          </Typography.Paragraph>
          <Form layout="vertical" component="div">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0 16px' }}>
              {fields.map((f) => (
                <Form.Item key={f.key} label={f.label} required={f.required} style={{ marginBottom: 12 }} validateStatus={f.required && !mapping[f.key] ? 'error' : undefined}>
                  <Select
                    allowClear
                    aria-label={`Column for ${f.label}`}
                    placeholder="Choose a column"
                    value={mapping[f.key]}
                    onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                    options={headers.map((h) => ({ value: h, label: h }))}
                  />
                </Form.Item>
              ))}
            </div>
          </Form>
          {extra}
          {missingRequired.length > 0 && <Alert type="warning" showIcon title={`Choose the columns for ${missingRequired.map((f) => f.label).join(', ')}`} style={{ marginBottom: 12 }} />}
          <Table<Row>
            size="small"
            rowKey="_key"
            dataSource={rows}
            pagination={{ pageSize: 8, size: 'small', showSizeChanger: false }}
            scroll={{ x: 800 }}
            columns={[
              { key: 'n', title: 'Row', width: 60, render: (_, r) => Number(r._key) + 2 },
              ...fields.map((f) => ({ key: f.key, title: f.label, dataIndex: f.key, ellipsis: f.key === 'description', align: f.numeric ? ('right' as const) : undefined })),
              { key: 'check', title: 'Check', width: 200, render: (_: unknown, r: Row) => (r._error ? <Typography.Text type="danger">{r._error}</Typography.Text> : <Typography.Text type="success">Ready</Typography.Text>) },
            ]}
          />
          {rows.length !== good.length && (
            <Typography.Paragraph type="warning" style={{ marginTop: 8 }}>
              {`${plural(rows.length - good.length)} with a problem will be left out. Fix them in the sheet to bring them in.`}
            </Typography.Paragraph>
          )}
        </>
      )}
    </Modal>
  );
}
