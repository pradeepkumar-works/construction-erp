'use client';

import React from 'react';
import { Card } from 'antd';
import { navNode } from '@erp/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { ProgressList, useProgressFromDpr } from '@/components/progress/ProgressList';
import { useProjectScope } from '@/lib/project-scope';

export default function Page() {
  const [projectId] = useProjectScope();
  const fromDpr = useProgressFromDpr(projectId ?? undefined);
  return (
    <div className="page-container">
      <PageHeader title="Progress entries" subtitle={fromDpr ? 'Quantities done against each activity, from the approved daily reports' : navNode('site.progress')?.description} />
      <Card size="small">
        <ProgressList newLabel="New progress entry" />
      </Card>
    </div>
  );
}
