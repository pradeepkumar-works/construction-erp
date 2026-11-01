'use client';

import React, { useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import type { StockEntryDto } from '@erp/shared';
import { canKeepStock } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useIncomingTransfers } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { ReceiveTransferModal } from './ReceiveTransferModal';

/** Transfers on their way to the project (or to any project the user can see), with a Receive button for stock keepers. */
export function IncomingTransfers({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const keeper = !!user && canKeepStock(user.roleKey);
  const { data } = useIncomingTransfers(projectId, !!user);
  const [receiving, setReceiving] = useState<StockEntryDto | null>(null);
  if (!data?.length) return null;
  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ margin: 12 }}
        className="incoming-transfers"
        title={`${data.length} transfer${data.length === 1 ? '' : 's'} in transit`}
        description={
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            {data.map((t) => (
              <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography.Text>
                  <span className="mono" translate="no">{t.entryNo}</span> from {t.projectName}
                  {projectId ? '' : ` to ${t.toProjectName}`}, sent {formatDate(t.date)}: {t.lines.map((l) => l.itemName).join(', ')}
                </Typography.Text>
                {keeper ? (
                  <Button size="small" type="primary" onClick={() => setReceiving(t)}>
                    Receive
                  </Button>
                ) : null}
              </div>
            ))}
          </Space>
        }
      />
      {receiving ? <ReceiveTransferModal open={!!receiving} onClose={() => setReceiving(null)} transfer={receiving} /> : null}
    </>
  );
}
