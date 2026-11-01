'use client';

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { canKeepBooks } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { TrialBalance } from '@/components/statements/TrialBalance';
import { ProfitLoss } from '@/components/statements/ProfitLoss';
import { BalanceSheet } from '@/components/statements/BalanceSheet';
import { BankReconciliation } from '@/components/statements/BankReconciliation';
import { YearClose } from '@/components/statements/YearClose';
import { NoAccess } from '@/components/common/NoAccess';

const TABS = ['trial', 'pl', 'bs', 'bank', 'year'] as const;

function StatementsPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const raw = search.get('tab');
  const tab = TABS.find((t) => t === raw) ?? 'trial';
  const allowed = !!user && canKeepBooks(user.roleKey);
  return (
    <div className="page-container">
      <PageHeader title="Financial statements" subtitle="The trial balance, profit and loss and balance sheet in Schedule III order from the books, the bank reconciliation, opening balances and the year's close." />
      {!allowed ? (
        <NoAccess title="Only admin, management and accounts see the statements" />
      ) : (
        <Card size="small">
          <AppTabs
            activeKey={tab}
            onChange={(k) => router.replace(`${pathname}?tab=${k}`, { scroll: false })}
            variant="page"
            destroyOnHidden
            items={[
              { key: 'trial', label: 'Trial balance', children: <TrialBalance /> },
              { key: 'pl', label: 'Profit and loss', children: <ProfitLoss /> },
              { key: 'bs', label: 'Balance sheet', children: <BalanceSheet /> },
              { key: 'bank', label: 'Bank reconciliation', children: <BankReconciliation /> },
              { key: 'year', label: 'Opening and year close', children: <YearClose /> },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StatementsPage />
    </Suspense>
  );
}
