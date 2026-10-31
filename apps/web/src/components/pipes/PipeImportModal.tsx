'use client';

import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Descriptions, Form, Modal, Select, Space, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  parseEpanetInp,
  parseNetworkSheets,
  type PipeNetworkFile,
  type PipeNetworkImportBody,
  type PipeNetworkImportResultDto,
  type PipeZoneDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { loadXlsx } from '@/lib/exportExcel';
import { formatQty } from '@/lib/format';

async function downloadTemplate() {
  const XLSX = await loadXlsx();
  const nodes = XLSX.utils.aoa_to_sheet([
    ['Code', 'Kind', 'Ground level', 'X', 'Y'],
    ['T-1', 'Tank', 112.5, 0, 0],
    ['J-1', 'Junction', 110.2, 120, 0],
    ['SV-1', 'Sluice valve', 109.8, 180, 0],
    ['J-2', 'Junction', 109.4, 240, 0],
    ['J-3', 'Junction', 108.9, 240, -90],
  ]);
  const pipes = XLSX.utils.aoa_to_sheet([
    ['Code', 'From', 'To', 'Length m', 'Diameter mm', 'Material', 'Class', 'Scope', 'Surface'],
    ['P-1', 'T-1', 'J-1', 120, 200, 'DI', 'K7', 'Proposed', 'Bitumen road'],
    ['P-2', 'J-1', 'SV-1', 60, 160, 'HDPE', 'PN 6', 'Proposed', 'Earthen'],
    ['P-3', 'SV-1', 'J-2', 60, 160, 'HDPE', 'PN 6', 'Proposed', 'Earthen'],
    ['P-4', 'J-2', 'J-3', 90, 110, 'HDPE', 'PN 6', 'Proposed', 'CC road'],
  ]);
  nodes['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 8 }];
  pipes['!cols'] = [{ wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, nodes, 'Nodes');
  XLSX.utils.book_append_sheet(wb, pipes, 'Pipes');
  XLSX.writeFile(wb, 'Pipe-network-template.xlsx');
}

/** A pipe sheet without a node sheet still reads: each end it names becomes a junction. */
function withEnds(file: PipeNetworkFile): PipeNetworkFile {
  const known = new Set(file.nodes.map((n) => n.code));
  const nodes = [...file.nodes];
  for (const p of file.pipes)
    for (const code of [p.from, p.to])
      if (code && !known.has(code)) {
        known.add(code);
        nodes.push({ code, kind: 'JUNCTION', groundLevel: null, x: null, y: null, chainage: null });
      }
  return { ...file, nodes };
}

async function readFile(file: File): Promise<PipeNetworkFile> {
  if (/\.inp$/i.test(file.name)) return parseEpanetInp(await file.text());
  const XLSX = await loadXlsx();
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const rows = (name: string | undefined) => (name ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' }) : []);
  const pipeSheet = wb.SheetNames.find((n) => /pipe|link|segment/i.test(n)) ?? wb.SheetNames[wb.SheetNames.length - 1];
  const nodeSheet = wb.SheetNames.find((n) => n !== pipeSheet && /node|junction/i.test(n));
  return withEnds(parseNetworkSheets(rows(nodeSheet), rows(pipeSheet)));
}

/**
 * Loads a zone's network from the design office's model: an EPANET .inp file (WaterGEMS, LOOP and EPANET all
 * write one) or an Excel book of nodes and pipes. The file is read here, the server says what saving would change, and
 * nothing is saved until that is accepted. Codes match pipes already loaded, so work recorded on them stays.
 */
export function PipeImportModal({ open, onClose, projectId, zones, zoneId }: { open: boolean; onClose: () => void; projectId: string; zones: PipeZoneDto[]; zoneId: string | null }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [zone, setZone] = useState<string | null>(zoneId);
  const [file, setFile] = useState<{ name: string; data: PipeNetworkFile } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const body = (dryRun: boolean): PipeNetworkImportBody => ({ projectId, zoneId: zone!, nodes: file!.data.nodes, pipes: file!.data.pipes, dryRun });
  const preview = useMutation({
    mutationFn: async () => (await api.post<PipeNetworkImportResultDto>(`/projects/${projectId}/pipe-network/import`, body(true))).data,
    meta: FAIL_NOTICE,
  });
  const save = useMutation({
    mutationFn: async () => (await api.post<PipeNetworkImportResultDto>(`/projects/${projectId}/pipe-network/import`, body(false))).data,
    onSuccess: (res) => {
      if (!res.saved) return;
      message.success(`Network saved: ${res.plan.pipes.added} pipes added, ${res.plan.pipes.changed} changed. The zone's stages are planned at ${formatQty(res.proposedM)} m.`);
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
      close();
    },
    meta: FAIL_NOTICE,
  });
  const { mutate: runPreview, reset: resetPreview } = preview;

  // Each file or zone chosen gets its preview from the server.
  useEffect(() => {
    if (file && zone && file.data.pipes.length) runPreview();
    else resetPreview();
  }, [file, zone, runPreview, resetPreview]);

  const close = () => {
    setFile(null);
    setProblem(null);
    preview.reset();
    save.reset();
    onClose();
  };

  const beforeUpload: UploadProps['beforeUpload'] = (f) => {
    setProblem(null);
    readFile(f)
      .then((data) => {
        if (!data.pipes.length) setProblem('No pipes were found in that file. Use an EPANET .inp file, or the template: a Nodes sheet and a Pipes sheet.');
        setFile({ name: f.name, data });
      })
      .catch(() => setProblem('That file could not be read. Use an EPANET .inp file, or save the sheet as .xlsx and try again.'));
    return false;
  };

  const result = save.data && !save.data.saved ? save.data : preview.data;
  const problems = result?.problems ?? [];
  const plan = result?.plan;

  return (
    <Modal
      open={open}
      title="Import pipe network"
      width={760}
      onCancel={close}
      footer={
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
            Download template
          </Button>
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" disabled={!plan || problems.length > 0 || preview.isPending} loading={save.isPending} onClick={() => save.mutate()}>
            Save network
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <Form.Item label="Zone or main" htmlFor="pipe-import-zone" required>
          <Select id="pipe-import-zone" value={zone ?? undefined} onChange={setZone} placeholder="Choose the zone" options={zones.map((z) => ({ value: z.id, label: z.label }))} />
        </Form.Item>
      </Form>
      {problem ? <Alert type="error" showIcon title={problem} style={{ marginBottom: 12 }} /> : null}
      {!file ? (
        <Upload.Dragger accept=".inp,.xlsx,.xls,.csv" beforeUpload={beforeUpload} showUploadList={false} maxCount={1}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Choose or drop the network file</p>
          <p className="ant-upload-hint">
            An EPANET .inp file from WaterGEMS, LOOP or EPANET, or an Excel book with a Nodes sheet (code, kind, ground level, X, Y) and a Pipes sheet (code, from, to,
            length, diameter, material, class, scope).
          </p>
        </Upload.Dragger>
      ) : (
        <>
          <Descriptions
            size="small"
            column={1}
            bordered
            items={[
              { key: 'file', label: 'File', children: <span translate="no">{file.name}</span> },
              {
                key: 'read',
                label: 'Read',
                children: (
                  <span translate="no">
                    {file.data.nodes.length} nodes, {file.data.pipes.length} pipes, {formatQty(file.data.pipes.filter((p) => p.scope === 'PROPOSED').reduce((t, p) => t + p.lengthM, 0))} m proposed
                  </span>
                ),
              },
              ...(plan
                ? [
                    { key: 'pipes', label: 'Pipes', children: `${plan.pipes.added} new, ${plan.pipes.changed} changed, ${plan.pipes.unchanged} as they are` },
                    { key: 'nodes', label: 'Nodes', children: `${plan.nodes.added} new, ${plan.nodes.changed} changed, ${plan.nodes.unchanged} as they are` },
                  ]
                : []),
              ...(plan?.notInFile.length
                ? [{ key: 'kept', label: 'Not in the file', children: <span translate="no">{`${plan.notInFile.slice(0, 12).join(', ')}${plan.notInFile.length > 12 ? ` and ${plan.notInFile.length - 12} more` : ''}: kept as they are`}</span> }]
                : []),
            ]}
          />
          {file.data.notes.length ? (
            <ul style={{ marginTop: 12, paddingInlineStart: 20 }}>
              {file.data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          {problems.length ? (
            <Alert
              type="error"
              showIcon
              style={{ marginTop: 12 }}
              title="Correct these in the file and choose it again"
              description={
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              }
            />
          ) : null}
          <Button style={{ marginTop: 12 }} onClick={() => setFile(null)}>
            Choose another file
          </Button>
        </>
      )}
    </Modal>
  );
}
