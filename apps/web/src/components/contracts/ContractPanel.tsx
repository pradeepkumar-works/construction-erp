'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Descriptions, Skeleton, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { EditOutlined } from '@ant-design/icons';
import type { ContractExtensionDto } from '@erp/shared';
import { CONTRACT_PERCENT_FIELDS, CONTRACT_PERCENT_LABELS, DELAY_PARTY_LABELS, GST_STATES, canEditContract, isForeign } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useContract } from '@/lib/queries';
import { formatDate, formatINR, formatMoney, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ContractFormModal } from './ContractFormModal';
import { LdExposureCard } from './LdExposure';
import { PriceVariationCard } from './PriceVariation';
import { BillingBreakup } from './BillingBreakup';
import { themeFontSize } from '@/lib/theme';
import { Section, SectionStack } from '@/components/common/Section';

/** A project's contract with its client: the Contract tab of a project. */
export function ContractPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const { data: c, isLoading, error, refetch } = useContract(projectId);
  const [editing, setEditing] = useState(false);
  const editable = !!user && canEditContract(user.roleKey);

  if (isLoading) return <Skeleton active />;
  if (error || !c) return <QueryError error={error ?? new Error('Contract not found')} onRetry={() => refetch()} />;

  const missing = [!c.client && 'a client from the client master', !c.agreementNo && 'the agreement number', !c.contractValue && 'the contract value'].filter(Boolean);
  return (
    <SectionStack>
      {missing.length > 0 && (
        <Alert type="info" showIcon title={`Bills print better with ${missing.join(', ')}.`} action={editable ? <Button size="small" onClick={() => setEditing(true)}>Fill in</Button> : undefined} />
      )}
      <Section
        title="Agreement"
        extra={
          editable ? (
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Edit contract
            </Button>
          ) : null
        }
      >
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} bordered>
          <Descriptions.Item label="Client" span={2}>
            {c.client ? (
              <div>
                <Typography.Text strong>{c.client.name}</Typography.Text>
                {c.client.department && <div>{c.client.department}</div>}
                {c.client.billingAddress && <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{c.client.billingAddress}</div>}
              </div>
            ) : (
              <span>
                {c.clientName ?? '-'} {c.clientName && <AppTag>not in the client master</AppTag>}
              </span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Client GSTIN">
            {c.client?.gstin ? <span translate="no">{c.client.gstin}</span> : '-'}
            {c.client?.stateCode && <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{GST_STATES[c.client.stateCode] ?? c.client.stateCode}</div>}
          </Descriptions.Item>
          <Descriptions.Item label="Work order">{c.workOrderNo ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Agreement">{c.agreementNo ? `${c.agreementNo}${c.agreementDate ? `, ${formatDate(c.agreementDate)}` : ''}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="Contract value">
            {c.contractValue ? <span translate="no">{formatMoney(c.contractValue, c)}</span> : '-'}
            {isForeign(c) && (
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }} translate="no">
                {formatINR(c.contractValue)} at ₹&nbsp;{c.exchangeRate} to 1 {c.currency}
              </div>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Revised contract value">
            {c.revisedContractValue ? <span translate="no">{formatMoney(c.revisedContractValue, c)}</span> : '-'}
            {toNumber(c.approvedVariations) !== 0 && (
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                <Link href={`/projects/${c.projectId}?tab=variations`}>{formatMoney(c.approvedVariations, c)} in approved variations</Link>
              </div>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Start">{formatDate(c.startDate)}</Descriptions.Item>
          <Descriptions.Item label="Completion (agreement)">{formatDate(c.endDate)}</Descriptions.Item>
          <Descriptions.Item label="Completion (with extensions)">
            {formatDate(c.revisedEndDate)}
            {c.extensionDays > 0 && <AppTag tone="info" style={{ marginLeft: 8 }}>+{c.extensionDays} days</AppTag>}
          </Descriptions.Item>
          <Descriptions.Item label="Defect liability">{c.defectLiabilityMonths !== null ? `${c.defectLiabilityMonths} months` : '-'}</Descriptions.Item>
          <Descriptions.Item label="Client pays within">{c.clientPaymentDays !== null ? `${c.clientPaymentDays} days` : 'Not set (30 days assumed)'}</Descriptions.Item>
          <Descriptions.Item label="Hindrance notice within">{c.noticeDays !== null ? `${c.noticeDays} days` : 'Not set (14 days assumed)'}</Descriptions.Item>
          <Descriptions.Item label="Price variation">{c.priceVariation ? 'Yes' : 'No'}</Descriptions.Item>
          <Descriptions.Item label="Mobilisation advance">{Number(c.mobilisationAdvance) > 0 ? <span translate="no">{formatMoney(c.mobilisationAdvance, c)}</span> : 'None'}</Descriptions.Item>
        </Descriptions>
      </Section>
      <Section title="On each bill (% of the work value)">
        <Descriptions size="small" column={{ xs: 2, sm: 4, lg: 7 }} layout="vertical" bordered>
          {CONTRACT_PERCENT_FIELDS.map((k) => (
            <Descriptions.Item key={k} label={CONTRACT_PERCENT_LABELS[k]}>
              {c[k]}%
            </Descriptions.Item>
          ))}
        </Descriptions>
      </Section>
      <BillingBreakup projectId={projectId} />
      <Section title="Extensions of time" extra={<Link href={`/projects/${projectId}?tab=risks`}>Delay register</Link>}>
        <Table<ContractExtensionDto>
          rowKey="riskId"
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={false}
          dataSource={c.extensions}
          locale={{ emptyText: 'No extension claimed. Tick "Extension of time claimed" on a delay, and enter the days once the client grants them.' }}
          columns={[
            { title: 'Delay', key: 'title', render: (_, e) => <span><Typography.Text type="secondary">{e.riskNo}</Typography.Text> {e.title}</span> },
            { title: 'Held up', key: 'dates', render: (_, e) => `${formatDate(e.delayStart)} to ${e.delayEnd ? formatDate(e.delayEnd) : 'date'}` },
            { title: 'Days lost', dataIndex: 'daysLost', align: 'right', render: (v: number | null) => v ?? '-' },
            { title: 'Caused by', dataIndex: 'responsibleParty', render: (v: ContractExtensionDto['responsibleParty']) => (v ? DELAY_PARTY_LABELS[v] : '-') },
            { title: 'Granted (days)', dataIndex: 'eotGrantedDays', align: 'right', render: (v: number | null, e) => (v !== null ? v : e.eotClaimed ? <AppTag tone="pending">Claimed</AppTag> : '-') },
          ]}
          summary={() =>
            c.extensions.length ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <Typography.Text strong>Granted in total</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Typography.Text strong>{c.extensionDays}</Typography.Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null
          }
        />
      </Section>
      {c.priceVariation ? (
        <Section title="Price variation">
          <PriceVariationCard contract={c} editable={editable} />
        </Section>
      ) : null}
      {c.ld ? (
        <Section title="Liquidated damages">
          <LdExposureCard ld={c.ld} />
        </Section>
      ) : null}
      {editable && <ContractFormModal open={editing} contract={c} onClose={() => setEditing(false)} />}
    </SectionStack>
  );
}
