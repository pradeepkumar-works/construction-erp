'use client';

import React, { useMemo, useState } from 'react';
import { Alert, App, Button, Modal, Space, Table, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WORK_ELEMENT_TYPES, WORK_ELEMENT_TYPE_LABELS, compareCodes, type WorkElementType } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { loadXlsx } from '@/lib/exportExcel';

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADERS = {
  code: ['number', 'no', 'code', 'sno', 'slno', 'wbs', 'item'],
  name: ['name', 'component', 'description', 'particulars'],
  kind: ['kind', 'type', 'elementtype'],
  weight: ['weight', 'weightpct', 'weight%', 'share', 'billingshare', 'percent'],
};
const KIND_BY_TEXT = new Map<string, WorkElementType>([...WORK_ELEMENT_TYPES.map((t) => [norm(t), t] as const), ...WORK_ELEMENT_TYPES.map((t) => [norm(WORK_ELEMENT_TYPE_LABELS[t]), t] as const)]);

interface Parsed {
  key: number;
  code: string;
  name: string;
  elementType?: WorkElementType;
  weightPct?: string;
  error?: string;
}

async function downloadTemplate() {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Number', 'Name', 'Kind', 'Weight %'],
    ['1', 'Intake well with approach bridge', 'Intake well', 7],
    ['2', 'Water treatment plant', 'Water treatment plant', 14.5],
    ['2.1', 'Clariflocculator', 'Treatment plant unit', 40],
    ['2.2', 'Filter house', 'Treatment plant unit', 35],
    ['3', 'Distribution network', 'Pipe network zone', 26.5],
  ]);
  ws['!cols'] = [{ wch: 8 }, { wch: 40 }, { wch: 26 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Structure');
  XLSX.writeFile(wb, 'Structure-import-template.xlsx');
}

/** Components from Excel (item 125): number, name, kind and weight; "2.1" goes under "2". */
export function StructureImportModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const close = () => {
    setRows([]);
    setProblem(null);
    onClose();
  };

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    setProblem(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await loadXlsx();
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' });
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        if (!json.length) setProblem('The first sheet has no rows. Use the template, one component per row.');
        setRows(json);
      } catch {
        setProblem('That file could not be read. Save it as .xlsx and try again.');
      }
    };
    reader.readAsArrayBuffer(file);
    return false;
  };

  const parsed: Parsed[] = useMemo(() => {
    if (!rows.length) return [];
    const headers = Object.keys(rows[0]);
    const col = (aliases: string[]) => headers.find((h) => aliases.includes(norm(h)));
    const c = { code: col(HEADERS.code), name: col(HEADERS.name), kind: col(HEADERS.kind), weight: col(HEADERS.weight) };
    return rows
      .map((r, i) => {
        const code = c.code ? String(r[c.code]).trim() : '';
        const name = c.name ? String(r[c.name]).trim() : '';
        const kindText = c.kind ? norm(r[c.kind]) : '';
        const weight = c.weight ? String(r[c.weight]).replace(/[%\s]/g, '') : '';
        const row: Parsed = { key: i, code, name, elementType: kindText ? KIND_BY_TEXT.get(kindText) : undefined, weightPct: weight || undefined };
        const bad: string[] = [];
        if (!/^\d+(\.\d+)?$/.test(code)) bad.push('number (like 2 or 2.1)');
        if (name.length < 2) bad.push('name');
        if (kindText && !row.elementType) bad.push('kind');
        if (weight && (Number.isNaN(Number(weight)) || Number(weight) < 0 || Number(weight) > 100)) bad.push('weight (0 to 100)');
        if (bad.length) row.error = `Check the ${bad.join(', ')}`;
        return row;
      })
      .filter((r) => r.code || r.name)
      .sort((a, b) => compareCodes(a.code, b.code));
  }, [rows]);
  const valid = parsed.filter((r) => !r.error);

  const mutation = useMutation({
    mutationFn: async () =>
      (await api.post<{ created: number; skipped: string[] }>(`/projects/${projectId}/structure/elements/import`, { rows: valid.map(({ code, name, elementType, weightPct }) => ({ code, name, elementType, weightPct })) })).data,
    onSuccess: (res) => {
      message.success(`Imported ${res.created} component${res.created === 1 ? '' : 's'}${res.skipped.length ? `, skipped ${res.skipped.length}` : ''}`);
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
      close();
    },
    meta: FAIL_NOTICE,
  });

  return (
    <Modal
      open={open}
      title="Import components from Excel"
      width={820}
      onCancel={close}
      footer={
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
            Download template
          </Button>
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" disabled={!valid.length} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Import {valid.length || ''} components
          </Button>
        </Space>
      }
    >
      {problem ? <Alert type="error" showIcon title={problem} style={{ marginBottom: 12 }} /> : null}
      {!rows.length ? (
        <Upload.Dragger accept=".xlsx,.xls,.csv" beforeUpload={beforeUpload} showUploadList={false} maxCount={1}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Choose or drop the Excel file</p>
          <p className="ant-upload-hint">Columns: Number, Name, Kind and Weight %. A number like 2.1 puts the row inside component 2. Numbers already in the components are skipped.</p>
        </Upload.Dragger>
      ) : (
        <>
          <Table<Parsed>
            rowKey="key"
            size="small"
            dataSource={parsed}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 640 }}
            columns={[
              { title: 'Number', dataIndex: 'code', width: 80 },
              { title: 'Name', dataIndex: 'name' },
              { title: 'Component type', dataIndex: 'elementType', width: 180, render: (v?: WorkElementType) => (v ? WORK_ELEMENT_TYPE_LABELS[v] : 'Other') },
              { title: 'Weight', dataIndex: 'weightPct', width: 80, align: 'right', render: (v?: string) => (v ? `${v}%` : 'Auto') },
              { title: 'Check', dataIndex: 'error', width: 200, render: (e?: string) => (e ? <Typography.Text type="danger">{e}</Typography.Text> : 'OK') },
            ]}
          />
          {parsed.length !== valid.length ? (
            <Typography.Paragraph type="warning" style={{ marginTop: 8 }}>
              {parsed.length - valid.length} row{parsed.length - valid.length === 1 ? '' : 's'} with problems will be left out.
            </Typography.Paragraph>
          ) : null}
        </>
      )}
    </Modal>
  );
}
