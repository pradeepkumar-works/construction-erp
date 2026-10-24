'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Card, Input, Modal, Progress, Skeleton, Space, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { CustomerServiceOutlined, DeleteOutlined, DownloadOutlined, StopOutlined, UndoOutlined } from '@/components/common/icons';
import type { CompanyLogEntryDto } from '@erp/shared';
import { DELETION_GRACE_DAYS, PRODUCT_NAME, SUPPORT_ACCESS_DAYS, canManageCompanyData } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useCancelCompanyDeletion, useCompanyDeletion, useCompanyExportManifest, useCompanyLog, useRequestCompanyDeletion, useSetSupportAccess, useSupportAccess } from '@/lib/queries';
import { buildCompanyExport, type ExportProgress } from '@/lib/companyExport';
import { formatDate, formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { themeFontSize } from '@/lib/theme';

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
              <Progress percent={progress.percent} status="active" aria-label={`Export ${progress.percent}% built`} />
              <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
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
          title={`${company} and all its data will be deleted on ${formatDate(data.scheduledFor)}.`}
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

/** The company admin decides whether support may look inside, for how long, and can take it back. */
function SupportAccessCard() {
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useSupportAccess();
  const set = useSetSupportAccess();
  const active = !!data?.until && new Date(data.until) > new Date();

  const change = async (allow: boolean) => {
    try {
      await set.mutateAsync(allow);
      message.success(allow ? `${PRODUCT_NAME} support can view the company for ${SUPPORT_ACCESS_DAYS} days` : 'Support access withdrawn');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Card title={`${PRODUCT_NAME} support access`} style={{ marginBottom: 16 }}>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 1 }} />
      ) : (
        <>
          <Typography.Paragraph>
            {PRODUCT_NAME} staff cannot see your company unless you allow it here. When you do, support can open it read-only for {SUPPORT_ACCESS_DAYS} days to
            help with a problem; they cannot change anything, and every visit is recorded in the log below.
          </Typography.Paragraph>
          {active ? (
            <Space wrap>
              <AppTag tone="info" icon={<CustomerServiceOutlined />}>
                Allowed until {formatDateTime(data!.until!)}
                {data?.grantedByName ? ` by ${data.grantedByName}` : ''}
              </AppTag>
              <Button icon={<StopOutlined />} loading={set.isPending} onClick={() => change(false)}>
                Withdraw access
              </Button>
            </Space>
          ) : (
            <Button icon={<CustomerServiceOutlined />} loading={set.isPending} onClick={() => change(true)}>
              Allow support for {SUPPORT_ACCESS_DAYS} days
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

const LOG_LABELS: Record<string, string> = {
  EXPORTED: 'Data exported',
  DELETION_REQUESTED: 'Deletion requested',
  DELETION_CANCELLED: 'Deletion cancelled',
  SUPPORT_ACCESS_GRANTED: 'Support allowed',
  SUPPORT_ACCESS_REVOKED: 'Support withdrawn',
  SUPPORT_VIEW: 'Support visit',
  SUSPENDED: 'Suspended',
  UNSUSPENDED: 'Suspension lifted',
  SUBSCRIPTION_PAID: 'Subscription paid',
  TRIAL_CHANGED: 'Trial changed',
  AI_SETTINGS: 'Ask Nirmaan settings',
};

function CompanyLogCard() {
  const { data, isLoading, error, refetch } = useCompanyLog();
  return (
    <Card title="Company log" style={{ marginBottom: 16 }}>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<CompanyLogEntryDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        locale={{ emptyText: 'Nothing yet' }}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: 640 }}
        columns={[
          { title: 'When', dataIndex: 'createdAt', width: 170, render: (v: string) => formatDateTime(v) },
          { title: 'What', dataIndex: 'action', width: 160, render: (a: string) => LOG_LABELS[a] ?? a },
          { title: 'Who', dataIndex: 'actorName', width: 180 },
          { title: 'Detail', dataIndex: 'note', render: (v: string | null) => v ?? '-' },
        ]}
      />
    </Card>
  );
}

export default function CompanyDataPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (!canManageCompanyData(user.roleKey))
    return (
      <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
        <PageHeader title="Data and privacy" />
        <Alert type="info" title="Only an admin can export or delete company data." />
      </div>
    );
  return (
    <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
      <PageHeader
        title="Data and privacy"
        subtitle={
          <span>
            Your data is yours: take all of it, or have it erased. See the <Link href="/privacy" className="text-link">privacy policy</Link>.
          </span>
        }
      />
      <ExportCard />
      <SupportAccessCard />
      <DeletionCard />
      <CompanyLogCard />
    </div>
  );
}
