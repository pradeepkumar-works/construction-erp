'use client';

import React, { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { tk } from '@/ds';
import { canSeeConsolidation, type ConsolidationBasis } from '@erp/shared';
import { AppTabs } from '@/components/common/AppTabs';
import { NoAccess } from '@/components/common/NoAccess';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { CompanyNotes, ConsolidatedStatement, ConsolidationToolbar, SisterPairs, periodQuery } from '@/components/group/ConsolidatedAccounts';
import { thisYearSoFar } from '@/components/statements/statementsUi';
import { useAuth } from '@/lib/auth';
import { useConsolidation } from '@/lib/queries';

const TABS = ['pl', 'bs', 'sisters'] as const;

/**
 * Consolidated accounts (item 192, ARCHITECTURE "Consolidated accounts"): the group's profit and loss and balance
 * sheet, each company's own figures in its column, what passed between sisters taken out, and the pairs that differ.
 */
function ConsolidatedPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const allowed = !!user && canSeeConsolidation(user);
  const tab = TABS.find((t) => t === search.get('tab')) ?? 'pl';
  const [period, setPeriod] = useState(thisYearSoFar);
  const [basis, setBasis] = useState<ConsolidationBasis>('BOOKS');
  const { data, isLoading, isFetching, error, refetch } = useConsolidation({ ...periodQuery(period), basis }, allowed);
  const differing = data?.pairs.filter((p) => Number(p.difference) !== 0).length ?? 0;
  const loading = isLoading || isFetching;
  const toolbar = <ConsolidationToolbar period={period} onPeriod={setPeriod} basis={basis} onBasis={setBasis} data={data} which={tab} />;
  const statement = (which: 'pl' | 'bs') => (
    <div style={{ padding: tk.space[4] }}>
      {toolbar}
      <ConsolidatedStatement data={data} which={which} loading={loading} />
      {data && <CompanyNotes data={data} />}
    </div>
  );
  return (
    <div className="page-container">
      <PageHeader
        title="Consolidated accounts"
        help="Each company's own profit and loss and balance sheet, by Schedule III line, added up for the group. Balances and sales between sisters named under Sister companies come out where both companies' books hold them; what one holds and the other does not stays in and shows under Between sisters. Investments in the companies and their share capital are not taken out."
      />
      {!allowed ? (
        <NoAccess title="Group admins in the holding company only" subTitle="Switch to the holding company, or ask a group admin." />
      ) : error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Card size="small">
          <AppTabs
            activeKey={tab}
            onChange={(k) => router.replace(`${pathname}?tab=${k}`, { scroll: false })}
            variant="page"
            items={[
              { key: 'pl', label: 'Profit and loss', children: statement('pl') },
              { key: 'bs', label: 'Balance sheet', children: statement('bs') },
              {
                key: 'sisters',
                label: 'Between sisters',
                count: differing || undefined,
                countLabel: differing === 1 ? 'difference to settle' : 'differences to settle',
                attention: differing > 0,
                children: (
                  <div style={{ padding: tk.space[4] }}>
                    {toolbar}
                    <SisterPairs data={data} loading={loading} />
                  </div>
                ),
              },
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
      <ConsolidatedPage />
    </Suspense>
  );
}
