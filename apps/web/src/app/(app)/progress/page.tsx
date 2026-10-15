'use client';

import React from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { ProgressList } from '@/components/progress/ProgressList';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Progress Entries" subtitle="Quantity-wise daily progress reported from site against activities" />
      <Card size="small">
        <ProgressList newLabel="New progress entry" />
      </Card>
    </div>
  );
}
