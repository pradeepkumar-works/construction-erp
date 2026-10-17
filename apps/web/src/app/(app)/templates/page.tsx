'use client';

import React from 'react';
import { Card, Tabs } from 'antd';
import { PROJECT_TYPE_LABELS, canManageTemplates } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useActivityTemplates } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
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
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <PageSkeleton header={false} /> : null}
      {data ? (
        <Card size="small">
          <Tabs items={data.map((t) => ({ key: t.projectType, label: PROJECT_TYPE_LABELS[t.projectType], children: <TemplateEditor template={t} editable={editable} /> }))} />
        </Card>
      ) : null}
    </div>
  );
}
