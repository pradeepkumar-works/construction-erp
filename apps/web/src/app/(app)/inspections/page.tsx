'use client';

import React from 'react';
import { Card, Tabs } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { InspectionList } from '@/components/inspections/InspectionList';
import { ChecklistsPanel } from '@/components/inspections/ChecklistsPanel';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Inspections" subtitle="Site requests an inspection when work is ready; QA/QC checks it against the checklist and passes it, fails it or asks for re-inspection." />
      <Card className="table-card" size="small">
        <Tabs
          tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
          items={[
            { key: 'inspections', label: 'Inspections', children: <InspectionList /> },
            { key: 'checklists', label: 'Checklists', children: <ChecklistsPanel /> },
          ]}
        />
      </Card>
    </div>
  );
}
