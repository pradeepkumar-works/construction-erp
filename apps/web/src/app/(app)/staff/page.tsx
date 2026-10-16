'use client';

import React, { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Badge, Card, Tabs } from 'antd';
import { canManageStaff, canMarkStaff } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useStaffSummary } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { MyStaff } from '@/components/staff/MyStaff';
import { LeaveList } from '@/components/staff/LeaveList';
import { LeaveDrawer } from '@/components/staff/LeaveDrawer';
import { LeaveFormModal } from '@/components/staff/LeaveFormModal';
import { StaffRegister } from '@/components/staff/StaffRegister';
import { EmployeeList } from '@/components/staff/EmployeeList';
import { EmployeeDrawer } from '@/components/staff/EmployeeDrawer';
import { EmployeeFormModal } from '@/components/staff/EmployeeFormModal';
import { HolidayList } from '@/components/staff/HolidayList';

const TABS = ['me', 'leave', 'register', 'staff', 'holidays'] as const;
type Tab = (typeof TABS)[number];

function StaffPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { data: summary } = useStaffSummary();
  const marks = !!user && canMarkStaff(user.roleKey);
  const admin = !!user && canManageStaff(user.roleKey);
  const deciding = marks || !!summary?.leaveToDecide;
  const raw = search.get('tab') as Tab | null;
  const allowed = (t: Tab) => t === 'me' || t === 'holidays' || (t === 'leave' && deciding) || ((t === 'register' || t === 'staff') && marks);
  const tab: Tab = raw && TABS.includes(raw) && allowed(raw) ? raw : 'me';
  // Leave notifications link here with ?tab=leave&leave=<id>
  const [leaveId, setLeaveId] = useState<string | null>(search.get('leave'));
  // Search links here with ?employee=<id>
  const [employeeId, setEmployeeId] = useState<string | null>(search.get('employee'));
  const [applyFor, setApplyFor] = useState(false);
  const [newEmployee, setNewEmployee] = useState(false);

  return (
    <div className="page-container">
      <PageHeader title="Staff & leave" subtitle="Check in, apply for leave and see your balance. Site in-charges mark the staff register; HR keeps staff records and holidays." />
      <Card size="small">
        <Tabs
          activeKey={tab}
          onChange={(k) => router.replace(`${pathname}?tab=${k}`, { scroll: false })}
          tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
          items={[
            { key: 'me', label: 'My attendance & leave', children: <MyStaff /> },
            ...(deciding
              ? [
                  {
                    key: 'leave',
                    label: (
                      <span>
                        Leave
                        {summary?.leaveToDecide ? <Badge count={summary.leaveToDecide} size="small" title="Waiting on you" style={{ marginLeft: 6 }} /> : null}
                      </span>
                    ),
                    children: <LeaveList onOpen={setLeaveId} onNew={() => setApplyFor(true)} toDecideFirst={!!summary?.leaveToDecide} />,
                  },
                ]
              : []),
            ...(marks
              ? [
                  { key: 'register', label: 'Staff register', children: <StaffRegister /> },
                  { key: 'staff', label: admin ? 'Staff' : 'My site staff', children: <EmployeeList onOpen={setEmployeeId} onNew={() => setNewEmployee(true)} /> },
                ]
              : []),
            { key: 'holidays', label: 'Holidays', children: <HolidayList /> },
          ]}
        />
      </Card>
      <LeaveDrawer id={leaveId} open={!!leaveId} onClose={() => setLeaveId(null)} />
      <EmployeeDrawer
        id={employeeId}
        open={!!employeeId}
        onClose={() => setEmployeeId(null)}
        onOpenLeave={(id) => {
          setEmployeeId(null);
          setLeaveId(id);
        }}
      />
      <LeaveFormModal open={applyFor} onClose={() => setApplyFor(false)} onSaved={(l) => setLeaveId(l.id)} />
      <EmployeeFormModal open={newEmployee} onClose={() => setNewEmployee(false)} onSaved={(e) => setEmployeeId(e.id)} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StaffPage />
    </Suspense>
  );
}
