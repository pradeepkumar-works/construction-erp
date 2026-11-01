'use client';

import React, { Suspense } from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { LetterRegister } from '@/components/correspondence/LetterRegister';

/** The inward register: letters received, numbered on entry and marked to someone. */
export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Inward register" subtitle="Letters received, numbered as they come in, marked to someone with what to do and by when, and closed once replied, complied with or filed." />
      <Card size="small">
        <Suspense fallback={null}>
          <LetterRegister direction="IN" />
        </Suspense>
      </Card>
    </div>
  );
}
