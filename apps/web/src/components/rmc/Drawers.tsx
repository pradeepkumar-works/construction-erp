'use client';

import React, { useState } from 'react';
import { OrderDrawer } from './OrderDrawer';
import { BatchDrawer } from './BatchDrawer';

/** An order's drawer and a truck's, opened from a list (a truck from inside its order's drawer too). */
export function useRmcDrawers() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const drawers = (
    <>
      <OrderDrawer id={orderId} onClose={() => setOrderId(null)} onBatch={setBatchId} />
      <BatchDrawer id={batchId} onClose={() => setBatchId(null)} />
    </>
  );
  return { openOrder: setOrderId, openBatch: setBatchId, drawers };
}
