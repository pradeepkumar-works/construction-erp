'use client';

import React, { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { tk } from '@/ds';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTabs } from '@/components/common/AppTabs';
import dayjs from 'dayjs';
import { canViewLabourSummary, canViewPayroll, reportingMonth } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { StaffPayroll } from '@/components/payroll/StaffPayroll';
import { ContractorMonth } from '@/components/payroll/ContractorMonth';
import { SalaryRuns } from '@/components/payroll/SalaryRuns';
import { Salaries } from '@/components/payroll/Salaries';
import { Loans } from '@/components/payroll/Loans';
import { Settlements } from '@/components/payroll/Settlements';
import { PayrollSettings } from '@/components/payroll/PayrollSettings';
import { MONTH_PICKER_FORMAT, todayDate } from '@/lib/format';

const STAFF_TABS = ['runs', 'salaries', 'loans', 'settlements', 'staff', 'settings'] as const;

/** The month's inputs (attendance, leave, overtime) for staff and labour contractors, behind a month and site filter. */
function MonthInputs({ kind }: { kind: 'staff' | 'contractors' }) {
  // The month just ended until this one has settled (the reporting month), so the 1st never opens on an empty month.
  const [month, setMonth] = useState(() => dayjs(`${reportingMonth(todayDate())}-01`));
  const [projectId, setProjectId] = useProjectScope();
  const m = month.format('YYYY-MM');
  return (
    <>
      <div style={{ padding: `${tk.space[3]} ${tk.space[3]} 0`, display: 'flex', gap: tk.space[2], flexWrap: 'wrap' }}>
        <DatePicker picker="month" format={MONTH_PICKER_FORMAT} allowClear={false} value={month} onChange={(d) => d && setMonth(d.startOf('month'))} disabledDate={(d) => d.isAfter(dayjs(), 'month')} aria-label="Month" />
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} />
      </div>
      {kind === 'staff' ? <StaffPayroll month={m} projectId={projectId} /> : <ContractorMonth month={m} projectId={projectId} />}
    </>
  );
}

function PayrollPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const staff = !!user && canViewPayroll(user.roleKey);
  const labour = !!user && canViewLabourSummary(user.roleKey);
  const raw = search.get('tab');
  const tab = !staff ? 'contractors' : raw === 'contractors' && labour ? raw : STAFF_TABS.find((t) => t === raw) ?? 'runs';

  return (
    <div className="page-container">
      <PageHeader title="Payroll" help="Monthly salary runs with payslips, PF, ESI and TDS; salaries, loans and full and final settlements; and the month's inputs for staff and labour contractors." />
      <Card size="small">
        <AppTabs
          activeKey={tab}
          onChange={(k) => router.replace(`${pathname}?tab=${k}`, { scroll: false })}
          variant="page"
          destroyOnHidden
          items={[
            ...(staff
              ? [
                  { key: 'runs', label: 'Salary runs', children: <SalaryRuns /> },
                  { key: 'salaries', label: 'Salaries', children: <Salaries /> },
                  { key: 'loans', label: 'Loans and advances', children: <Loans /> },
                  { key: 'settlements', label: 'Full and final', children: <Settlements /> },
                  { key: 'staff', label: 'Staff inputs', children: <MonthInputs kind="staff" /> },
                ]
              : []),
            ...(labour ? [{ key: 'contractors', label: 'Labour contractors', children: <MonthInputs kind="contractors" /> }] : []),
            ...(staff ? [{ key: 'settings', label: 'Payroll settings', children: <PayrollSettings /> }] : []),
          ]}
        />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PayrollPage />
    </Suspense>
  );
}
