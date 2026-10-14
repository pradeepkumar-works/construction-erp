'use client';

import React, { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, DatePicker, Tabs } from 'antd';
import dayjs from 'dayjs';
import { canViewLabourSummary, canViewPayroll } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { StaffPayroll } from '@/components/payroll/StaffPayroll';
import { ContractorMonth } from '@/components/payroll/ContractorMonth';

function PayrollPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const staff = !!user && canViewPayroll(user.roleKey);
  const labour = !!user && canViewLabourSummary(user.roleKey);
  const tab = search.get('tab') === 'contractors' || !staff ? 'contractors' : 'staff';
  // Payroll is usually run for the month just ended.
  const [month, setMonth] = useState(() => (dayjs().date() <= 10 ? dayjs().subtract(1, 'month') : dayjs()).startOf('month'));
  const [projectId, setProjectId] = useState<string | undefined>();
  const m = month.format('YYYY-MM');

  return (
    <div className="page-container">
      <PageHeader title="Payroll inputs" subtitle="The month's days present, leave and overtime per employee, and man-days per labour contractor, to send on." />
      <Card className="table-card" size="small">
        <div style={{ padding: '12px 12px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DatePicker picker="month" format="MMM YYYY" allowClear={false} value={month} onChange={(d) => d && setMonth(d.startOf('month'))} disabledDate={(d) => d.isAfter(dayjs(), 'month')} aria-label="Month" />
          <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} />
        </div>
        <Tabs
          activeKey={tab}
          onChange={(k) => router.replace(`${pathname}?tab=${k}`, { scroll: false })}
          tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
          items={[
            ...(staff ? [{ key: 'staff', label: 'Staff', children: <StaffPayroll month={m} projectId={projectId} /> }] : []),
            ...(labour ? [{ key: 'contractors', label: 'Labour contractors', children: <ContractorMonth month={m} projectId={projectId} /> }] : []),
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
