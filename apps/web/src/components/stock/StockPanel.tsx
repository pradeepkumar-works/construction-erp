'use client';

import React, { useState } from 'react';
import { Button, Space, Tabs } from 'antd';
import { ExportOutlined, ImportOutlined, SlidersOutlined } from '@ant-design/icons';
import { canAdjustStock, canKeepStock } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { StockBalances } from './StockBalances';
import { StockEntries } from './StockEntries';
import { ItemsTable } from './ItemsTable';
import { ReceiptModal } from './ReceiptModal';
import { IssueModal } from './IssueModal';
import { AdjustmentModal } from './AdjustmentModal';

/** Receive / Issue / Adjust buttons for the roles allowed to use them. */
export function StockActions({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState<'receipt' | 'issue' | 'adjust' | null>(null);
  if (!user) return null;
  const keeper = canKeepStock(user.roleKey);
  const adjuster = canAdjustStock(user.roleKey);
  if (!keeper && !adjuster) return null;
  return (
    <>
      <Space wrap>
        {keeper ? (
          <Button type="primary" icon={<ImportOutlined />} onClick={() => setOpen('receipt')}>
            Receive (GRN)
          </Button>
        ) : null}
        {keeper ? (
          <Button icon={<ExportOutlined />} onClick={() => setOpen('issue')}>
            Issue
          </Button>
        ) : null}
        {adjuster ? (
          <Button icon={<SlidersOutlined />} onClick={() => setOpen('adjust')}>
            Adjust
          </Button>
        ) : null}
      </Space>
      <ReceiptModal open={open === 'receipt'} onClose={() => setOpen(null)} projectId={projectId} />
      <IssueModal open={open === 'issue'} onClose={() => setOpen(null)} projectId={projectId} />
      <AdjustmentModal open={open === 'adjust'} onClose={() => setOpen(null)} projectId={projectId} />
    </>
  );
}

/** Stock on hand and the store register, for one project (project tab) or all of them (Stock page, which also shows the item master). */
export function StockPanel({ projectId, initialLow, initialProject }: { projectId?: string; initialLow?: boolean; initialProject?: string }) {
  const [tab, setTab] = useState('balances');
  return (
    <Tabs
      activeKey={tab}
      onChange={setTab}
      tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
      tabBarExtraContent={projectId ? <StockActions projectId={projectId} /> : undefined}
      items={[
        { key: 'balances', label: 'Stock on hand', children: <StockBalances projectId={projectId} initialLow={initialLow} initialProject={initialProject} /> },
        { key: 'register', label: 'Register', children: <StockEntries projectId={projectId} /> },
        ...(projectId ? [] : [{ key: 'items', label: 'Item master', children: <ItemsTable /> }]),
      ]}
    />
  );
}
