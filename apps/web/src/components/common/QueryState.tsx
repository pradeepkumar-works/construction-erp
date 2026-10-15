'use client';

import React from 'react';
import { Alert, Button, Empty, Spin } from 'antd';
import { errorMessage } from '@/lib/api';

export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      title="Could not load data"
      description={errorMessage(error)}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    />
  );
}

export function Loading({ tip }: { tip?: string }) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <Spin size="large" description={tip}>
        <div style={{ height: 40 }} />
      </Spin>
    </div>
  );
}

export function EmptyState({ description = 'Nothing here yet', children }: { description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Empty description={description} style={{ padding: '32px 0' }}>
      {children}
    </Empty>
  );
}
