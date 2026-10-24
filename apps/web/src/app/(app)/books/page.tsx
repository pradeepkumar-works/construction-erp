'use client';

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, Result } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { canKeepBooks } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { DayBook } from '@/components/books/DayBook';
import { Ledgers } from '@/components/books/Ledgers';
import { Vouchers } from '@/components/books/Vouchers';
import { ChartOfAccounts } from '@/components/books/ChartOfAccounts';
import { ResultMark } from '@/components/common/ResultMark';

const TABS = ['day', 'cash', 'ledgers', 'vouchers', 'accounts'] as const;

function BooksPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const raw = search.get('tab');
  const tab = TABS.find((t) => t === raw) ?? 'day';
  const allowed = !!user && canKeepBooks(user.roleKey);
  return (
    <div className="page-container">
      <PageHeader title="Books" subtitle="The day book, cash and bank books and ledgers, kept from the modules' bills, receipts, payments, expenses and salaries, with vouchers accounts make by hand." />
      {!allowed ? (
        <Result icon={<ResultMark kind="no-access" />} title="Only admin, management and accounts see the books" />
      ) : (
        <Card size="small">
          <AppTabs
            activeKey={tab}
            onChange={(k) => router.replace(`${pathname}?tab=${k}`, { scroll: false })}
            variant="page"
            destroyOnHidden
            items={[
              { key: 'day', label: 'Day book', children: <DayBook /> },
              { key: 'cash', label: 'Cash and bank', children: <Ledgers money /> },
              { key: 'ledgers', label: 'Ledgers', children: <Ledgers /> },
              { key: 'vouchers', label: 'Vouchers', children: <Vouchers /> },
              { key: 'accounts', label: 'Chart of accounts', children: <ChartOfAccounts /> },
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
      <BooksPage />
    </Suspense>
  );
}
