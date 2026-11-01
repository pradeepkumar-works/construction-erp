'use client';

import React from 'react';
import { Card } from 'antd';
import { navNode } from '@erp/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { MeasurementList } from '@/components/measurements/MeasurementList';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Measurement book" subtitle={navNode('site.mb')?.description} />
      <Card size="small">
        <MeasurementList />
      </Card>
    </div>
  );
}
