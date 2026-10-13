'use client';

import React from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { MeasurementList } from '@/components/measurements/MeasurementList';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Measurement Book" subtitle="Measurements by BOQ item and location. Approved quantities are what gets billed." />
      <Card className="table-card" size="small">
        <MeasurementList />
      </Card>
    </div>
  );
}
