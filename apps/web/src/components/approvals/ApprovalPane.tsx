'use client';

import React from 'react';
import Link from 'next/link';
import { Button, ConfigProvider, Descriptions, Divider, Flex, Space, Typography, theme } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined, FileSearchOutlined } from '@/components/common/icons';
import type { PendingApprovalDto, ReviewDecision } from '@erp/shared';
import { approvalTypeParam } from '@/lib/queries';
import { approveTheme, themeFontSize } from '@/lib/theme';
import { formatDateTime, formatINR } from '@/lib/format';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ProgressRecord } from '@/components/progress/ProgressDrawer';
import { DprRecord } from '@/components/dpr/DprDrawer';
import { MrRecord } from '@/components/material/MrDrawer';
import { PurchaseOrderRecord } from '@/components/purchasing/PurchaseOrderDrawer';
import { BillRecord } from '@/components/bills/BillDrawer';
import { MachineryRecord } from '@/components/machinery/MachineryDrawer';
import { ExpenseRecord } from '@/components/expenses/ExpenseDrawer';
import { MeasurementRecord } from '@/components/measurements/MeasurementDrawer';
import { VendorBillRecord } from '@/components/purchasing/VendorBillDrawer';
import { WorkOrderRecord } from '@/components/subcontracts/WorkOrderDrawer';
import { SubBillRecord } from '@/components/subcontracts/SubBillDrawer';
import { InspectionRecord } from '@/components/inspections/InspectionDrawer';
import { PaymentRequestRecord } from '@/components/payables/PaymentRequestRecord';
import { decidedInPlace, QUEUE_TYPE_LABELS } from './queue';
import { TypeTag } from './ApprovalQueue';

/** The record of the entry picked in the queue, then the decision bar. */
export function ApprovalPane({ item, onDecide, onOpenDetails }: { item: PendingApprovalDto; onDecide: (d: ReviewDecision) => void; onOpenDetails: () => void }) {
  const { token } = theme.useToken();
  return (
    <Flex vertical style={{ height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: token.padding }} key={`${item.type}:${item.id}`}>
        <PaneRecord item={item} onOpenDetails={onOpenDetails} />
      </div>
      <Flex
        role="toolbar"
        aria-label="Decision"
        justify="space-between"
        align="center"
        wrap
        gap={token.marginSM}
        style={{ padding: `${token.paddingSM}px ${token.padding}px`, borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`, background: token.colorBgContainer }}
      >
        {decidedInPlace(item.type) ? (
          <Space wrap>
            <ConfigProvider theme={approveTheme}>
              <Button type="primary" icon={<CheckOutlined />} onClick={() => onDecide('APPROVE')}>
                Approve <Key k="A" />
              </Button>
            </ConfigProvider>
            <Button icon={<EditOutlined />} onClick={() => onDecide('REQUEST_CHANGES')}>
              Request changes <Key k="C" />
            </Button>
            <Button danger icon={<CloseOutlined />} onClick={() => onDecide('REJECT')}>
              Reject <Key k="R" />
            </Button>
          </Space>
        ) : (
          <Button type="primary" icon={<FileSearchOutlined />} onClick={onOpenDetails}>
            Record the checklist
          </Button>
        )}
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          <Key k="J" /> <Key k="K" /> next and previous
        </Typography.Text>
      </Flex>
    </Flex>
  );
}

function Key({ k }: { k: string }) {
  return (
    <Typography.Text keyboard aria-hidden style={{ fontSize: themeFontSize('fontSizeSM'), marginInlineStart: 2, color: 'inherit' }}>
      {k}
    </Typography.Text>
  );
}

function PaneRecord({ item, onOpenDetails }: { item: PendingApprovalDto; onOpenDetails: () => void }) {
  switch (item.type) {
    case 'PROGRESS':
      return <ProgressRecord mode="pane" id={item.id} />;
    case 'DPR':
      return <DprRecord mode="pane" id={item.id} />;
    case 'MATERIAL_REQUEST':
      return <MrRecord mode="pane" id={item.id} />;
    case 'PURCHASE_ORDER':
      return <PurchaseOrderRecord mode="pane" id={item.id} />;
    case 'BILL':
      return <BillRecord mode="pane" id={item.id} />;
    case 'MACHINERY':
      return <MachineryRecord mode="pane" id={item.id} />;
    case 'EXPENSE':
      return <ExpenseRecord mode="pane" id={item.id} />;
    case 'MEASUREMENT':
      return <MeasurementRecord mode="pane" id={item.id} />;
    case 'VENDOR_BILL':
      return <VendorBillRecord mode="pane" id={item.id} />;
    case 'WORK_ORDER':
      return <WorkOrderRecord mode="pane" id={item.id} />;
    case 'SUBCONTRACT_BILL':
      return <SubBillRecord mode="pane" id={item.id} />;
    case 'INSPECTION':
      return <InspectionRecord mode="pane" id={item.id} />;
    case 'PAYMENT_REQUEST':
      return <PaymentRequestRecord mode="pane" id={item.id} />;
    default:
      return <PendingSummary item={item} onOpenDetails={onOpenDetails} />;
  }
}

/** A type without a record page: what the queue knows, the activity, and the details a click away. Every type has one since item 61. */
function PendingSummary({ item, onOpenDetails }: { item: PendingApprovalDto; onOpenDetails: () => void }) {
  const { token } = theme.useToken();
  return (
    <>
      <Flex justify="space-between" align="flex-start" gap={token.marginSM} style={{ marginBottom: token.marginSM }}>
        <Space wrap size={token.marginXS} align="center">
          <span role="heading" aria-level={2} style={{ fontSize: token.fontSizeLG, fontWeight: token.fontWeightStrong }}>
            {item.title}
          </span>
          <TypeTag type={item.type} label={QUEUE_TYPE_LABELS[item.type]} />
        </Space>
        <Button size="small" icon={<FileSearchOutlined />} onClick={onOpenDetails}>
          Open details
        </Button>
      </Flex>
      <Descriptions
        size="small"
        bordered
        column={{ xs: 1, sm: 2 }}
        items={[
          { key: 'project', label: 'Project', children: <Link href={`/projects/${item.projectId}`}>{item.projectName}</Link> },
          { key: 'amount', label: 'Amount', children: item.amount === null ? '-' : <span className="mono" translate="no">{formatINR(item.amount)}</span> },
          { key: 'by', label: 'Submitted by', children: item.submittedByName },
          { key: 'at', label: 'Submitted', children: formatDateTime(item.submittedAt) },
        ]}
      />
      <Divider titlePlacement="start" plain>
        Activity
      </Divider>
      <AuditTrail type={approvalTypeParam[item.type]} id={item.id} />
    </>
  );
}
