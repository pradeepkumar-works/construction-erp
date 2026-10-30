'use client';

import React from 'react';
import Link from 'next/link';
import { Table, Typography } from 'antd';
import type { ContractCurrency, ObligationBillLineDto } from '@erp/shared';
import { formatMoney, toNumber } from '@/lib/format';

/**
 * What a bill deducts for the contract's obligations (item 167): per obligation, what it costs as of the bill's date, what
 * earlier bills took and this bill's share, negative where a withholding is given back once met.
 */
export function ObligationRecoveryNotes({ lines, total, c, projectId }: { lines: ObligationBillLineDto[]; total: string; c: ContractCurrency; projectId: string }) {
  const net = toNumber(total);
  return (
    <>
      <Typography.Paragraph type="secondary">
        {net < 0
          ? `This bill gives back ${formatMoney(-net, c, true)} held for obligations since met.`
          : `This bill recovers ${formatMoney(net, c, true)} for obligations missed as of its date, less what earlier bills took.`}
      </Typography.Paragraph>
      <Table<ObligationBillLineDto>
        rowKey="obligationId"
        size="small"
        pagination={false}
        dataSource={lines}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Obligation', key: 'title', render: (_, l) => <span>{l.title}{l.clause ? <Typography.Text type="secondary"> ({l.clause})</Typography.Text> : null}</span> },
          { title: 'Due to date', dataIndex: 'upto', align: 'right', render: (v: string) => <span translate="no">{formatMoney(v, c, true)}</span> },
          { title: 'Earlier bills', dataIndex: 'previous', align: 'right', render: (v: string) => <span translate="no">{formatMoney(v, c, true)}</span> },
          { title: 'This bill', dataIndex: 'amount', align: 'right', render: (v: string) => <strong translate="no">{formatMoney(v, c, true)}</strong> },
        ]}
      />
      <p style={{ marginTop: 8, marginBottom: 0 }}>
        <Link href={`/projects/${projectId}?tab=contract`}>Obligations on the contract</Link>
      </p>
    </>
  );
}
