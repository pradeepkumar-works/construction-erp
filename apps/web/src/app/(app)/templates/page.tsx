'use client';

import React from 'react';
import { Card, Skeleton, Tabs } from 'antd';
import { PROJECT_TYPE_LABELS, canManageTemplates } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useActivityTemplates } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { TemplateEditor } from '@/components/templates/TemplateEditor';

export default function Page() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useActivityTemplates();
  const editable = !!user && canManageTemplates(user.roleKey);
  return (
    <div className="page-container">
      <PageHeader
        title="Activity Templates"
        subtitle={`Standard activities for each project type, added when a project is created (or later from its Activities tab).${editable ? '' : ' Admin and management can change them.'}`}
      />
      <Card size="small">
        {error && <QueryError error={error} onRetry={() => refetch()} />}
        {isLoading ? <Skeleton active /> : null}
        {data ? <Tabs items={data.map((t) => ({ key: t.projectType, label: PROJECT_TYPE_LABELS[t.projectType], children: <TemplateEditor template={t} editable={editable} /> }))} /> : null}
      </Card>
    </div>
  );
}
