'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Modal, Space, Table, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useImportRateAnalysis, type RateImportRow } from '@/lib/queries';
import { loadXlsx } from '@/lib/exportExcel';
import { themeColor, themeFontSize } from '@/lib/theme';

type Col = 'boqItemNo' | 'kind' | 'name' | 'unit' | 'qtyPerUnit' | 'wastagePct' | 'note';

const COLS: { key: Col; header: string; required: boolean; aliases: string[] }[] = [
  { key: 'boqItemNo', header: 'BOQ item', required: true, aliases: ['boqitem', 'boqitemno', 'itemno', 'item'] },
  { key: 'kind', header: 'Kind', required: true, aliases: ['kind', 'type', 'resourcetype'] },
  { key: 'name', header: 'Resource', required: true, aliases: ['resource', 'storeitem', 'name', 'material', 'trade', 'machine'] },
  { key: 'unit', header: 'Unit', required: false, aliases: ['unit', 'uom'] },
  { key: 'qtyPerUnit', header: 'Per unit', required: true, aliases: ['perunit', 'quantityperunit', 'qtyperunit', 'coefficient', 'constant', 'quantity', 'qty'] },
  { key: 'wastagePct', header: 'Wastage %', required: false, aliases: ['wastage', 'wastagepct', 'wastage%'] },
  { key: 'note', header: 'Note', required: false, aliases: ['note', 'notes', 'source', 'remarks'] },
];

const flat = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9%]/g, '');
const KIND_WORDS: Record<string, RateImportRow['kind']> = { material: 'MATERIAL', materials: 'MATERIAL', labour: 'LABOUR', labor: 'LABOUR', machine: 'EQUIPMENT', machinery: 'EQUIPMENT', equipment: 'EQUIPMENT', plant: 'EQUIPMENT' };

type Parsed = RateImportRow & { error: string | null };

export async function downloadRateAnalysisTemplate() {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet([
    COLS.map((c) => c.header),
    ['3.01', 'Material', 'OPC 53 Grade Cement', 'Bags', 8.2, 2, 'M25 design mix'],
    ['3.01', 'Material', 'TMT Fe500D 12mm', 'MT', 0.11, 3, 'From the bar bending schedule'],
    ['3.01', 'Labour', 'Mason', '', 0.25, '', ''],
    ['3.01', 'Labour', 'Helper', '', 2.5, '', ''],
    ['3.01', 'Machine', 'Concreting', '', 0.8, '', 'Mixer and vibrator, hours'],
  ]);
  ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 36 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rate analysis');
  XLSX.writeFile(wb, 'Rate-analysis-template.xlsx');
}

/**
 * Rate analysis from Excel (v5 item 92): one row per line, for any BOQ items of the project. Rows are checked here
 * first; the server checks them again and refuses the whole sheet if any is wrong, so nothing is half imported.
 */
export function RateAnalysisImportModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { message } = App.useApp();
  const save = useImportRateAnalysis();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Parsed[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setProblem(null);
    save.reset();
  };
  const close = () => {
    reset();
    onClose();
  };

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    reset();
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await loadXlsx();
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' });
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        if (!json.length) return setProblem('The first sheet has no rows. Start from the template.');
        const headers = Object.keys(json[0]);
        const at: Partial<Record<Col, string>> = {};
        for (const c of COLS) at[c.key] = headers.find((h) => c.aliases.includes(flat(h)));
        const missing = COLS.filter((c) => c.required && !at[c.key]).map((c) => c.header);
        if (missing.length) return setProblem(`The sheet has no ${missing.join(', ')} column. Use the template's headings.`);
        const get = (r: Record<string, unknown>, c: Col) => (at[c] ? String(r[at[c]!] ?? '').trim() : '');
        setRows(
          json
            .map((r, i): Parsed => {
              const kind = KIND_WORDS[flat(get(r, 'kind'))];
              const qty = get(r, 'qtyPerUnit').replace(/[,\s]/g, '');
              const wastage = get(r, 'wastagePct').replace(/[%\s]/g, '');
              const row = {
                row: i + 2,
                boqItemNo: get(r, 'boqItemNo'),
                kind: kind ?? 'MATERIAL',
                name: get(r, 'name'),
                unit: get(r, 'unit') || undefined,
                qtyPerUnit: qty,
                wastagePct: wastage || undefined,
                note: get(r, 'note') || undefined,
              };
              const error = !row.boqItemNo
                ? 'No BOQ item'
                : !kind
                  ? 'Kind is Material, Labour or Machine'
                  : !row.name
                    ? 'No resource'
                    : !qty || !(Number(qty) > 0)
                      ? 'Per unit must be above zero'
                      : wastage && (Number.isNaN(Number(wastage)) || Number(wastage) < 0 || Number(wastage) > 100)
                        ? 'Wastage is 0 to 100'
                        : null;
              return { ...row, error };
            })
            .filter((r) => r.boqItemNo || r.name || r.qtyPerUnit),
        );
        setFileName(file.name);
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'Could not read the file');
      }
    };
    reader.readAsArrayBuffer(file);
    return false;
  };

  const bad = rows.filter((r) => r.error).length;
  const submit = async () => {
    const r = await save.mutateAsync({ projectId, rows: rows.map(({ error: _e, ...row }) => row) });
    message.success(`Rate analysis imported: ${r.added} added${r.updated ? `, ${r.updated} changed` : ''}`);
    close();
  };
  const serverError = (save.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message;

  return (
    <Modal
      open={open}
      onCancel={close}
      title="Import rate analysis"
      width={900}
      okText={rows.length ? `Import ${rows.length} row${rows.length === 1 ? '' : 's'}` : 'Import'}
      okButtonProps={{ disabled: !rows.length || bad > 0, loading: save.isPending }}
      onOk={submit}
      destroyOnHidden
    >
      <Typography.Paragraph>
        One row per line: the BOQ item number, Material, Labour or Machine, the store item (by its name in the item master), trade or equipment category, and how much one unit
        of the BOQ item takes. Lines a BOQ item already has are changed; the rest stay.
      </Typography.Paragraph>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<DownloadOutlined />} onClick={() => void downloadRateAnalysisTemplate()}>
          Download the template
        </Button>
      </Space>
      <Upload.Dragger accept=".xlsx,.xls,.csv" maxCount={1} beforeUpload={beforeUpload} showUploadList={false}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p>{fileName ? `${fileName}: choose another file to replace it` : 'Drop the Excel file here, or click to choose it'}</p>
      </Upload.Dragger>
      {problem ? <Alert type="error" showIcon title={problem} style={{ marginTop: 12 }} /> : null}
      {serverError ? <Alert type="error" showIcon title="Nothing was imported" description={serverError} style={{ marginTop: 12 }} /> : null}
      {rows.length ? (
        <>
          {bad ? <Alert type="warning" showIcon title={`${bad} row${bad === 1 ? ' needs' : 's need'} fixing in the sheet before it can be imported`} style={{ marginTop: 12 }} /> : null}
          <Table<Parsed>
            style={{ marginTop: 12 }}
            rowKey="row"
            size="small"
            dataSource={rows}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 760 }}
            columns={[
              { title: 'Row', dataIndex: 'row', width: 60 },
              { title: 'BOQ item', dataIndex: 'boqItemNo', width: 90, className: 'mono' },
              { title: 'Kind', dataIndex: 'kind', width: 100, render: (k: string) => (k === 'MATERIAL' ? 'Material' : k === 'LABOUR' ? 'Labour' : 'Machine') },
              { title: 'Resource', dataIndex: 'name' },
              { title: 'Per unit', dataIndex: 'qtyPerUnit', width: 100, align: 'right', className: 'mono' },
              { title: 'Wastage', dataIndex: 'wastagePct', width: 90, align: 'right', render: (v?: string) => (v ? `${v}%` : '') },
              {
                title: 'Check',
                dataIndex: 'error',
                width: 200,
                render: (e: string | null) =>
                  e ? (
                    <span style={{ color: themeColor('colorErrorText'), fontSize: themeFontSize('fontSizeSM') }}>{e}</span>
                  ) : (
                    <span className="text-muted">Ready</span>
                  ),
              },
            ]}
          />
        </>
      ) : null}
    </Modal>
  );
}
