'use client';

import React, { useMemo, useState } from 'react';
import { Alert, App, Button, Modal, Select, Space, Table, Typography, Upload } from 'antd';
import { StageBar } from '@/components/record/StageBar';
import type { UploadProps } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { themeColor, themeFontSize } from '@/lib/theme';
import { loadXlsx } from '@/lib/exportExcel';

type Field = 'itemNo' | 'description' | 'unit' | 'rate' | 'originalQty' | 'revisedQty' | 'section' | 'sorRef';

const FIELDS: { key: Field; label: string; required: boolean; aliases: string[] }[] = [
  { key: 'itemNo', label: 'Item no.', required: true, aliases: ['itemno', 'item', 'sno', 'slno', 'sl', 'no', 'srno', 'itemcode', 'code'] },
  { key: 'description', label: 'Description', required: true, aliases: ['description', 'desc', 'descriptionofitem', 'item description', 'particulars', 'work'] },
  { key: 'unit', label: 'Unit', required: true, aliases: ['unit', 'uom', 'units'] },
  { key: 'rate', label: 'Rate', required: true, aliases: ['rate', 'unitrate', 'rateinr', 'rate(rs)', 'price'] },
  { key: 'originalQty', label: 'Quantity', required: true, aliases: ['qty', 'quantity', 'originalqty', 'boqqty', 'contractqty'] },
  { key: 'revisedQty', label: 'Revised qty (optional)', required: false, aliases: ['revisedqty', 'revised', 'revisedquantity'] },
  { key: 'section', label: 'Section or cost centre (optional)', required: false, aliases: ['section', 'costcentre', 'costcenter', 'billsection', 'head', 'subhead', 'part', 'schedule'] },
  { key: 'sorRef', label: 'Schedule of rates item (optional)', required: false, aliases: ['sor', 'sorref', 'sorno', 'sorcode', 'soritem', 'dsr', 'dsrno', 'ratereference'] },
];

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9()]/g, '');

interface ParsedRow {
  key: number;
  itemNo: string;
  description: string;
  unit: string;
  rate: string;
  originalQty: string;
  revisedQty?: string;
  section?: string;
  sorRef?: string;
  error?: string;
}

export async function downloadBoqTemplate() {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Item no.', 'Description', 'Unit', 'Rate', 'Quantity', 'Revised qty', 'Section', 'SOR item'],
    ['1.01', 'Clearing and grubbing including removal of vegetation', 'Sqm', 18.5, 85000, '', 'Site works', '2.1'],
    ['1.02', 'Earthwork in embankment with borrowed earth', 'Cum', 245, 42000, '', 'Site works', '2.14'],
  ]);
  ws['!cols'] = [{ wch: 10 }, { wch: 60 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOQ');
  XLSX.writeFile(wb, 'BOQ-import-template.xlsx');
}

export function BoqImportModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<Field, string>>>({});
  const [parseError, setParseError] = useState<string | null>(null);

  const reset = () => {
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setParseError(null);
  };

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await loadXlsx();
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        if (json.length === 0) {
          setParseError('The first sheet has no data rows.');
          return;
        }
        const hdrs = Object.keys(json[0]);
        const auto: Partial<Record<Field, string>> = {};
        for (const f of FIELDS) {
          const hit = hdrs.find((h) => f.aliases.includes(norm(h))) ?? hdrs.find((h) => f.aliases.some((a) => norm(h).includes(a)));
          if (hit && !Object.values(auto).includes(hit)) auto[f.key] = hit;
        }
        setHeaders(hdrs);
        setRows(json);
        setMapping(auto);
        setFileName(file.name);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Could not parse the file');
      }
    };
    reader.readAsArrayBuffer(file);
    return false;
  };

  const parsed: ParsedRow[] = useMemo(() => {
    if (rows.length === 0) return [];
    const get = (r: Record<string, unknown>, f: Field) => {
      const h = mapping[f];
      return h ? String(r[h] ?? '').trim() : '';
    };
    return rows
      .map((r, i) => {
        const row: ParsedRow = {
          key: i,
          itemNo: get(r, 'itemNo'),
          description: get(r, 'description'),
          unit: get(r, 'unit'),
          rate: get(r, 'rate').replace(/[,₹\s]/g, ''),
          originalQty: get(r, 'originalQty').replace(/[,\s]/g, ''),
          revisedQty: get(r, 'revisedQty').replace(/[,\s]/g, '') || undefined,
          section: get(r, 'section') || undefined,
          sorRef: get(r, 'sorRef') || undefined,
        };
        const problems: string[] = [];
        if (!row.itemNo) problems.push('item no');
        if (!row.description) problems.push('description');
        if (!row.unit) problems.push('unit');
        if (!row.rate || Number.isNaN(Number(row.rate))) problems.push('rate');
        if (!row.originalQty || Number.isNaN(Number(row.originalQty))) problems.push('quantity');
        if (row.revisedQty && Number.isNaN(Number(row.revisedQty))) problems.push('revised qty');
        if (problems.length) row.error = `Invalid ${problems.join(', ')}`;
        return row;
      })
      .filter((r) => r.itemNo || r.description || r.rate || r.originalQty);
  }, [rows, mapping]);

  const valid = parsed.filter((r) => !r.error);
  const missingRequired = FIELDS.filter((f) => f.required && !mapping[f.key]);

  const mutation = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ created: number; skipped: number }>(`/projects/${projectId}/boq/bulk`, {
          items: valid.map((r) => ({
            itemNo: r.itemNo,
            description: r.description,
            unit: r.unit,
            rate: r.rate,
            originalQty: r.originalQty,
            revisedQty: r.revisedQty,
            section: r.section,
            sorRef: r.sorRef,
          })),
        })
      ).data,
    onSuccess: (res) => {
      message.success(`Imported ${res.created} item${res.created === 1 ? '' : 's'}${res.skipped ? `, skipped ${res.skipped} duplicate${res.skipped === 1 ? '' : 's'}` : ''}`);
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      reset();
      onClose();
    },
    meta: FAIL_NOTICE,
  });

  const step = rows.length === 0 ? 0 : missingRequired.length > 0 ? 1 : 2;

  return (
    <Modal
      open={open}
      title="Import BOQ from Excel"
      width={960}
      onCancel={() => {
        reset();
        onClose();
      }}
      footer={
        <Space>
          <Button icon={<DownloadOutlined />} onClick={downloadBoqTemplate}>
            Download template
          </Button>
          {rows.length > 0 && <Button onClick={reset}>Choose another file</Button>}
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="primary" disabled={valid.length === 0 || missingRequired.length > 0} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Import {valid.length > 0 ? `${valid.length} item${valid.length === 1 ? '' : 's'}` : ''}
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      <StageBar current={step} label="Import steps" items={[{ title: 'Upload file' }, { title: 'Map columns' }, { title: 'Preview & import' }]} style={{ marginBottom: 16 }} />
      {parseError && <Alert type="error" showIcon title={parseError} style={{ marginBottom: 12 }} />}

      {rows.length === 0 ? (
        <Upload.Dragger accept=".xlsx,.xls,.csv" beforeUpload={beforeUpload} showUploadList={false} maxCount={1}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag an .xlsx / .csv file here</p>
          <p className="ant-upload-hint">First sheet is read. The header row should contain Item No, Description, Unit, Rate and Quantity. Use the template if unsure.</p>
        </Upload.Dragger>
      ) : (
        <>
          <Typography.Text type="secondary">
            File: <strong>{fileName}</strong> · {rows.length} row{rows.length === 1 ? '' : 's'} found. Map each BOQ field to a column from your sheet.
          </Typography.Text>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 16px', margin: '12px 0 16px' }}>
            {FIELDS.map((f) => (
              <div key={f.key}>
                <div style={{ fontSize: themeFontSize('fontSizeSM'), marginBottom: 2 }}>
                  {f.label} {f.required && <span style={{ color: themeColor('colorErrorText') }}>*</span>}
                </div>
                <Select
                  allowClear
                  style={{ width: '100%' }}
                  placeholder="Select column"
                  value={mapping[f.key]}
                  status={f.required && !mapping[f.key] ? 'error' : undefined}
                  onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                  options={headers.map((h) => ({ value: h, label: h }))}
                />
              </div>
            ))}
          </div>
          {missingRequired.length > 0 && <Alert type="warning" showIcon title={`Map the required columns: ${missingRequired.map((f) => f.label).join(', ')}`} style={{ marginBottom: 12 }} />}
          <Table<ParsedRow>
            size="small"
            rowKey="key"
            dataSource={parsed}
            pagination={{ pageSize: 8, size: 'small' }}
            scroll={{ x: 800 }}
            rowClassName={(r) => (r.error ? 'boq-row-error' : '')}
            columns={[
              { title: '#', dataIndex: 'key', width: 50, render: (k: number) => k + 2 },
              { title: 'Item no.', dataIndex: 'itemNo', width: 90 },
              { title: 'Description', dataIndex: 'description', ellipsis: true },
              { title: 'Unit', dataIndex: 'unit', width: 70 },
              { title: 'Rate', dataIndex: 'rate', width: 100, align: 'right' },
              { title: 'Qty', dataIndex: 'originalQty', width: 100, align: 'right' },
              { title: 'Revised', dataIndex: 'revisedQty', width: 90, align: 'right', render: (v) => v ?? '-' },
              { title: 'Section', dataIndex: 'section', width: 130, render: (v) => v ?? '-' },
              { title: 'Check', dataIndex: 'error', width: 180, render: (e?: string) => (e ? <Typography.Text type="danger">{e}</Typography.Text> : <Typography.Text type="success">OK</Typography.Text>) },
            ]}
          />
          {parsed.length !== valid.length && (
            <Typography.Text type="warning" style={{ display: 'block', marginTop: 8 }}>
              {parsed.length - valid.length} row{parsed.length - valid.length === 1 ? '' : 's'} with problems will be skipped.
            </Typography.Text>
          )}
        </>
      )}
    </Modal>
  );
}
