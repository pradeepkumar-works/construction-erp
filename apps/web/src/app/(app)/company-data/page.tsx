'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Card, Input, Modal, Progress, Skeleton, Space, Typography } from 'antd';
import { DeleteOutlined, DownloadOutlined, UndoOutlined } from '@ant-design/icons';
import { DELETION_GRACE_DAYS, canManageCompanyData } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useCancelCompanyDeletion, useCompanyDeletion, useCompanyExportManifest, useRequestCompanyDeletion } from '@/lib/queries';
import { buildCompanyExport, type ExportProgress } from '@/lib/companyExport';
import { formatDate, formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';

const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function ExportCard() {
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useCompanyExportManifest();
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const rows = data?.tables.reduce((s, t) => s + t.rows, 0) ?? 0;

  const download = async () => {
    if (!data) return;
    setProgress({ percent: 0, step: 'Starting' });
    try {
      const { blob, missing } = await buildCompanyExport(data, setProgress);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${data.organizationName.replace(/[^\w-]+/g, '-')}-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      if (missing) message.warning(`Export downloaded; ${missing} file${missing === 1 ? '' : 's'} could not be fetched (listed in README.txt)`);
      else message.success('Export downloaded');
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Card title="Export all data" style={{ marginBottom: 16 }}>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : data ? (
        <>
          <Typography.Paragraph>
            One zip with an Excel file for each kind of record (projects, BOQ, progress, DPRs, bills, orders, staff and the rest) and every
            photo and document. It is yours to keep, or to move to another system.
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            {data.tables.length} tables, {rows.toLocaleString('en-IN')} rows, {data.files} files ({bytes(data.fileBytes)}). The download is built in this
            browser; keep the tab open until it finishes. It is recorded in the audit log.
          </Typography.Paragraph>
          {progress ? (
            <div style={{ maxWidth: 480 }}>
              <Progress percent={progress.percent} status="active" />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {progress.step}
              </Typography.Text>
            </div>
          ) : (
            <Button type="primary" icon={<DownloadOutlined />} onClick={download}>
              Download everything (.zip)
            </Button>
          )}
        </>
      ) : null}
    </Card>
  );
}

function DeletionCard() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useCompanyDeletion();
  const request = useRequestCompanyDeletion();
  const cancel = useCancelCompanyDeletion();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const company = user?.organizationName ?? '';
  const typed = name.trim().replace(/\s+/g, ' ').toLowerCase() === company.trim().replace(/\s+/g, ' ').toLowerCase();

  const confirm = async () => {
    try {
      const d = await request.mutateAsync(name);
      message.success(`Deletion set for ${formatDate(d.scheduledFor)}`);
      setOpen(false);
      setName('');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  const undo = async () => {
    try {
      await cancel.mutateAsync();
      message.success('Deletion cancelled');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Card title="Delete the company">
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : data?.scheduledFor ? (
        <Alert
          type="error"
          showIcon
          message={`${company} and all its data will be deleted on ${formatDate(data.scheduledFor)}.`}
          description={
            <>
              Asked for by {data.requestedByName ?? 'an admin'} on {formatDateTime(data.requestedAt)}. Until then everything works as usual. On that day all
              projects, reports, bills, photos and user accounts are erased for good. Download an export first if you want a copy.
            </>
          }
          action={
            <Button icon={<UndoOutlined />} onClick={undo} loading={cancel.isPending}>
              Cancel deletion
            </Button>
          }
        />
      ) : data?.protected ? (
        <Typography.Paragraph type="secondary">The demo company cannot be deleted.</Typography.Paragraph>
      ) : (
        <>
          <Typography.Paragraph>
            Erases the company and everything in it: projects, reports, bills, photos and every user account. Nothing is erased for {DELETION_GRACE_DAYS} days,
            and any admin can cancel until then. All admins get an email.
          </Typography.Paragraph>
          <Button danger icon={<DeleteOutlined />} onClick={() => setOpen(true)}>
            Delete this company
          </Button>
        </>
      )}
      <Modal
        open={open}
        title={`Delete ${company}?`}
        okText="Delete company"
        okButtonProps={{ danger: true, disabled: !typed, loading: request.isPending }}
        onOk={confirm}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Typography.Paragraph>
          Everything is erased {DELETION_GRACE_DAYS} days from today unless an admin cancels. Download an export first if you want a copy.
        </Typography.Paragraph>
        <Typography.Paragraph>
          Type <Typography.Text strong>{company}</Typography.Text> to confirm.
        </Typography.Paragraph>
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Company name" autoComplete="off" />
      </Modal>
    </Card>
  );
}

export default function CompanyDataPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (!canManageCompanyData(user.roleKey)) return <Alert type="info" message="Only an admin can export or delete company data." />;
  return (
    <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
      <PageHeader
        title="Data & Privacy"
        subtitle={
          <span>
            Your data is yours: take all of it, or have it erased. See the <Link href="/privacy">privacy policy</Link>.
          </span>
        }
      />
      <ExportCard />
      <DeletionCard />
    </div>
  );
}
