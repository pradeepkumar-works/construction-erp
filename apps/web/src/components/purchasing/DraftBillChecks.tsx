'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Skeleton, Typography } from 'antd';
import { useDraftVendorBillChecks, type DraftVendorBill } from '@/lib/queries';
import { CheckRows } from '@/components/checks/ChecksSection';

/**
 * The bill checks on a vendor bill being filled from a scanned invoice, before it is saved: against the
 * PO, what was received and the bills already entered. Re-run a moment after the figures stop changing.
 */
export function DraftBillChecks({ draft }: { draft: DraftVendorBill }) {
  const key = JSON.stringify(draft);
  const [settled, setSettled] = useState<DraftVendorBill | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSettled(JSON.parse(key) as DraftVendorBill), 600);
    return () => clearTimeout(t);
  }, [key]);
  const { data, isLoading } = useDraftVendorBillChecks(settled);

  return (
    <div className="draft-bill-checks" style={{ marginBottom: 12 }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
        Checks on this bill
      </Typography.Text>
      {isLoading || !data ? (
        <Skeleton active title={false} paragraph={{ rows: 1 }} />
      ) : (
        <>
          <Alert type={data.openFlags ? 'warning' : 'success'} showIcon title={data.summary} style={{ marginBottom: 6 }} />
          <CheckRows checks={data.checks} />
        </>
      )}
    </div>
  );
}
