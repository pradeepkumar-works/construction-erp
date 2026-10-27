'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DatePicker, Select, Space } from 'antd';
import dayjs from 'dayjs';
import { ACCOUNT_GROUP_LABELS, isMoneyGroup } from '@erp/shared';
import { useLedger, useLedgerAccounts } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { LedgerView } from './LedgerView';

/** This financial year so far: 1 April to today. */
const fyStart = () => {
  const t = dayjs();
  return dayjs(`${t.month() >= 3 ? t.year() : t.year() - 1}-04-01`);
};

/**
 * One account's ledger for a period. `money` keeps the choice to cash and bank accounts (the cash and bank books) and
 * starts on cash; otherwise any account, for a project when the header has one.
 */
export function Ledgers({ money = false }: { money?: boolean }) {
  const { data: accounts } = useLedgerAccounts();
  // The statements open an account's ledger with ?account=…&from=…&to=….
  const search = useSearchParams();
  const [picked, setPicked] = useState<string | undefined>(() => (money ? undefined : (search.get('account') ?? undefined)));
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
    const from = search.get('from');
    const to = search.get('to');
    return !money && from && to && dayjs(from).isValid() && dayjs(to).isValid() ? [dayjs(from), dayjs(to)] : [fyStart(), dayjs()];
  });
  const [projectId, setProjectId] = useProjectScope();
  const choices = (accounts ?? []).filter((a) => (money ? isMoneyGroup(a.group) : true));
  const accountId = picked ?? (money ? (choices.find((a) => a.group === 'CASH_IN_HAND') ?? choices[0])?.id : undefined);
  const ledger = useLedger({ accountId, from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), projectId: money ? undefined : projectId });
  return (
    <div style={{ padding: 16 }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          aria-label={money ? 'Cash or bank account' : 'Account'}
          placeholder={money ? 'Cash or bank account' : 'Choose an account'}
          showSearch={{ optionFilterProp: 'label' }}
          value={accountId}
          onChange={setPicked}
          style={{ minWidth: 280 }}
          options={choices.map((a) => ({ value: a.id, label: a.name, title: ACCOUNT_GROUP_LABELS[a.group] }))}
        />
        <DatePicker.RangePicker
          aria-label="Period"
          format="DD MMM YYYY"
          allowClear={false}
          value={range}
          onChange={(r) => r?.[0] && r[1] && setRange([r[0], r[1]])}
          presets={[
            { label: 'This financial year', value: [fyStart(), dayjs()] },
            { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
            { label: 'Last month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
          ]}
        />
        {!money && <ProjectSelect allowClear placeholder="All projects" value={projectId} onChange={(v) => setProjectId(v)} aria-label="Project" style={{ minWidth: 220 }} />}
      </Space>
      <LedgerView
        data={ledger.data}
        isLoading={ledger.isLoading || ledger.isFetching}
        error={ledger.error}
        refetch={() => void ledger.refetch()}
        emptyText={accountId ? 'No entries in this period' : 'Choose an account to see its ledger'}
      />
    </div>
  );
}
