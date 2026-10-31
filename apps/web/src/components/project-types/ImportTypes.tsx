'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Checkbox, Flex, Modal, Space, Typography, Upload, theme } from 'antd';
import type { UploadProps } from 'antd';
import { IMPORT_ACTION_LABELS, MAX_BUNDLE_BYTES, bundleFileName, readBundle, type ImportAction, type ImportRowDto, type TypeBundle } from '@erp/shared';
import { InboxOutlined } from '@/components/common/icons';
import { AppTag, type TagTone } from '@/components/common/AppTag';
import { formatDateTime } from '@/lib/format';
import { useImportPreview, useImportTypes, type TypeImportPreviewDto } from '@/lib/queries';
import { saveText } from '@/components/payroll/payrollUi';

const TONE: Record<ImportAction, TagTone> = { CREATE: 'info', REPLACE: 'pending', SAME: 'neutral', REFUSED: 'danger' };
const pickKey = (r: Pick<ImportRowDto, 'what' | 'code'>) => `${r.what}:${r.code}`;
const importable = (r: ImportRowDto) => (r.action === 'CREATE' || r.action === 'REPLACE') && !r.problems.length;

/** Save a project types file the API made. */
export function saveBundle(bundle: TypeBundle, what: string) {
  saveText(bundleFileName(what, bundle.exportedAt.slice(0, 10)), 'application/json', JSON.stringify(bundle, null, 2));
}

/**
 * Import project types (ARCHITECTURE "Project types", Export and import): a file exported from another
 * company, read here, previewed item by item (new, replacing yours, the same, or refused with why), and the chosen ones
 * saved through the editors' own checks.
 */
export function ImportTypes({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const preview = useImportPreview();
  const save = useImportTypes();
  const [file, setFile] = useState<unknown>(null);
  const [plan, setPlan] = useState<TypeImportPreviewDto | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPlan(null);
    setPicks([]);
    setProblem(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const beforeUpload: UploadProps['beforeUpload'] = (f) => {
    reset();
    if (f.size > MAX_BUNDLE_BYTES) {
      setProblem('That file is too large to be a project types file. Choose the .json file exported from Project types.');
      return false;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(e.target?.result ?? ''));
      } catch {
        setProblem('That file could not be read. Choose the .json file exported from Project types.');
        return;
      }
      const read = readBundle(raw);
      if (!read.bundle) {
        setProblem(read.problem);
        return;
      }
      try {
        const p = await preview.mutateAsync(raw);
        setFile(raw);
        setPlan(p);
        setPicks(p.rows.filter(importable).map(pickKey));
      } catch {
        // The failure notice says why.
      }
    };
    reader.readAsText(f);
    return false;
  };

  const go = async () => {
    const res = await save.mutateAsync({ file, picks });
    message.success(`Imported ${res.imported} item${res.imported === 1 ? '' : 's'}${res.skipped.length ? `; ${res.skipped.length} left out` : ''}`);
    if (res.skipped.length) message.warning(res.skipped.join('. '));
    close();
  };

  const rows = plan?.rows ?? [];
  const types = rows.filter((r) => r.what === 'TYPE');
  const kinds = rows.filter((r) => r.what === 'KIND');

  const group = (title: string, list: ImportRowDto[]) =>
    list.length ? (
      <div style={{ marginTop: token.marginSM }}>
        <Typography.Text strong>{title}</Typography.Text>
        <div style={{ display: 'grid', gap: token.marginXS, marginTop: token.marginXXS }}>
          {list.map((r) => (
            <div key={pickKey(r)}>
              <Flex justify="space-between" align="center" gap={token.marginXS} wrap>
                <Checkbox
                  checked={picks.includes(pickKey(r))}
                  disabled={!importable(r)}
                  onChange={(e) => setPicks((p) => (e.target.checked ? [...p, pickKey(r)] : p.filter((k) => k !== pickKey(r))))}
                >
                  <strong translate="no">{r.name || r.code}</strong> <span className="text-muted" translate="no">{r.code}</span>
                </Checkbox>
                <AppTag tone={TONE[r.action]}>{r.problems.length && r.action !== 'REFUSED' ? 'Cannot import' : IMPORT_ACTION_LABELS[r.action]}</AppTag>
              </Flex>
              {r.note ? (
                <Typography.Paragraph type="secondary" style={{ margin: 0, paddingInlineStart: 24 }}>
                  {r.note}
                </Typography.Paragraph>
              ) : null}
              {r.problems.length ? (
                <ul style={{ margin: 0, paddingInlineStart: 42 }}>
                  {r.problems.map((p) => (
                    <li key={p}>
                      <Typography.Text type="danger">{p}</Typography.Text>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <Modal
      open={open}
      title="Import project types"
      width={720}
      onCancel={close}
      footer={
        <Space wrap>
          {plan ? <Button onClick={reset}>Choose another file</Button> : null}
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" disabled={!plan || !picks.length} loading={save.isPending} onClick={go}>
            {picks.length ? `Import ${picks.length} item${picks.length === 1 ? '' : 's'}` : 'Import'}
          </Button>
        </Space>
      }
    >
      {problem ? <Alert type="error" showIcon title={problem} style={{ marginBottom: 12 }} /> : null}
      {!plan ? (
        <Upload.Dragger accept=".json,application/json" beforeUpload={beforeUpload} showUploadList={false} maxCount={1} disabled={preview.isPending}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{preview.isPending ? 'Reading the file…' : 'Choose or drop the project types file'}</p>
          <p className="ant-upload-hint">The .json file from Export on a project type or on Component kinds. Nothing is saved until you import.</p>
        </Upload.Dragger>
      ) : (
        <>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            From <span translate="no">{plan.from || 'another company'}</span>
            {plan.exportedAt ? `, exported ${formatDateTime(plan.exportedAt)}` : ''}. A type or kind you have is saved as a new version; your projects keep what they
            have until you update them.
          </Typography.Paragraph>
          {group('Project types', types)}
          {group('Component kinds', kinds)}
        </>
      )}
    </Modal>
  );
}
