'use client';

import React from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { ExpenseList } from '@/components/expenses/ExpenseList';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Site Expenses" subtitle="Bills paid at site with GST and bill photo. Approved expenses count as project cost." />
      <Card className="table-card" size="small">
        <ExpenseList />
      </Card>
    </div>
  );
}
