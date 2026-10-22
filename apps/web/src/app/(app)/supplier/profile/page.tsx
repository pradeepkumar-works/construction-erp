'use client';

import React, { useState } from 'react';
import { Alert, Button, Card, Descriptions, Typography, theme } from 'antd';
import { MSME_CATEGORY_LABELS, SUPPLIER_BANK_FIELDS, SUPPLIER_PROFILE_FIELDS, SUPPLIER_PROFILE_LABELS, type MsmeCategory } from '@erp/shared';
import { useSupplierProfile } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ChangeForm } from '@/components/supplier/SupplierForms';
import { ChangeList } from '@/components/supplier/ChangeList';

/** The supplier's details as the company holds them; a change goes to the company for approval (bank changes to those who pay). */
export default function SupplierProfilePage() {
  const { token } = theme.useToken();
  const { data, isLoading, error, refetch } = useSupplierProfile();
  const [editing, setEditing] = useState(false);
  const pending = data?.changes.find((c) => c.status === 'PENDING');
  const show = (f: (typeof SUPPLIER_PROFILE_FIELDS)[number]) => {
    const v = data?.values[f];
    if (!v) return '-';
    return f === 'msmeCategory' ? (MSME_CATEGORY_LABELS[v as MsmeCategory] ?? v) : <span translate="no">{v}</span>;
  };
  const change = (
    <Button type="primary" onClick={() => setEditing(true)} disabled={!data || !!pending}>
      Change details
    </Button>
  );
  return (
    <div className="page-container">
      <PageHeader title="Profile" subtitle={data ? <span translate="no">{data.name}</span> : 'The details the company pays and writes to'} extra={change} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <PageSkeleton header={false} shape="record" /> : null}
      {data ? (
        <>
          {pending ? (
            <Alert
              type="info"
              showIcon
              title="A change is waiting for approval"
              description="You can ask for another change once the company decides on this one. Payments keep going to the account shown below until then."
              style={{ marginBottom: token.marginMD }}
            />
          ) : null}
          <Card title="Company and contact" size="small" style={{ marginBottom: token.marginMD }}>
            <Descriptions size="small" column={{ xs: 1, md: 2 }}>
              {SUPPLIER_PROFILE_FIELDS.filter((f) => !SUPPLIER_BANK_FIELDS.includes(f)).map((f) => (
                <Descriptions.Item key={f} label={SUPPLIER_PROFILE_LABELS[f]}>
                  {show(f)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
          <Card title="Bank account for payments" size="small" style={{ marginBottom: token.marginMD }}>
            <Descriptions size="small" column={{ xs: 1, md: 2 }}>
              {SUPPLIER_BANK_FIELDS.map((f) => (
                <Descriptions.Item key={f} label={SUPPLIER_PROFILE_LABELS[f]}>
                  {show(f)}
                </Descriptions.Item>
              ))}
            </Descriptions>
            <Typography.Paragraph type="secondary" style={{ margin: `${token.marginXS}px 0 0` }}>
              Only the last four digits are shown. A new account is checked and approved by the company&apos;s accounts before any payment goes to it.
            </Typography.Paragraph>
          </Card>
          <Card title="Changes you asked for" size="small">
            <ChangeList changes={data.changes} />
          </Card>
        </>
      ) : null}
      <ChangeForm open={editing} profile={data ?? null} onClose={() => setEditing(false)} />
    </div>
  );
}
