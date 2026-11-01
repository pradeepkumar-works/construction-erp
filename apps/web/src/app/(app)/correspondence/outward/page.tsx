'use client';

import React, { Suspense } from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { LetterRegister } from '@/components/correspondence/LetterRegister';

/** The outward register: letters drafted, signed, numbered, dispatched and delivered. */
export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Outward register" subtitle="Letters drafted from a template, approved by their signatory where they need it, numbered, printed on the letterhead and dispatched, with proof of delivery." />
      <Card size="small">
        <Suspense fallback={null}>
          <LetterRegister direction="OUT" />
        </Suspense>
      </Card>
    </div>
  );
}
