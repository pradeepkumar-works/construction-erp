'use client';

import React, { Suspense } from 'react';
import { canFileTds } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { NoAccess } from '@/components/common/NoAccess';
import { TdsQuarterView } from '@/components/tds/TdsQuarterView';

function TdsPage() {
  const { user } = useAuth();
  if (user && !canFileTds(user.roleKey))
    return (
      <div className="page-container">
        <PageHeader title="TDS returns" />
        <NoAccess title="TDS returns are kept by accounts" />
      </div>
    );
  return <TdsQuarterView />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TdsPage />
    </Suspense>
  );
}
