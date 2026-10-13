'use client';

import React from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { MrList } from '@/components/material/MrList';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Material Requests" subtitle="Material indents raised from site for procurement" />
      <Card className="table-card" size="small">
        <MrList newLabel="New material request" />
      </Card>
    </div>
  );
}
