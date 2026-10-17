'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Flex, Form, Input, Skeleton, Spin, Tag, Typography, theme } from 'antd';
import { CheckCircleFilled, CheckOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import type { BillCheckDto, CheckKind } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAcceptCheck, useBillCheckSummary, useBillChecks } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';
import { SparkleIcon } from '@/components/ai/SparkleIcon';
import type { RecordSection } from '@/components/record/RecordFrame';

/**
 * Checks before approval on a bill or expense (AI item 69): one line on top (the model's when Ask Nirmaan is on and
 * something is flagged), then the flags with what they are about, and a tick for each rule that passed. Someone who may
 * approve the bill can accept a flag with a note. The record puts it first among its sections; the approvals inbox
 * shows it through the record's pane.
 */
export function ChecksSection({ kind, id, version }: { kind: CheckKind; id: string; version?: number }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useBillChecks(kind, id, version);
  const summary = useBillCheckSummary(kind, id, !!data?.aiSummaryPending);
  const accept = useAcceptCheck(kind, id);
  const [accepting, setAccepting] = useState<BillCheckDto | null>(null);
  const [form] = Form.useForm<{ note: string }>();

  if (isLoading) return <Skeleton active title={false} paragraph={{ rows: 2 }} />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const flags = data.checks.filter((c) => !c.ok);
  const passed = data.checks.filter((c) => c.ok);
  const line = summary.data && data.aiSummaryPending ? summary.data : { summary: data.summary, summaryBy: data.summaryBy };
  const reopen = (c: BillCheckDto) =>
    accept.mutate({ key: c.key, note: '', reopen: true }, { onSuccess: () => message.success('Flag reopened'), onError: (e) => message.error(errorMessage(e)) });

  return (
    <div className="bill-checks">
      <Alert
        type={data.openFlags ? 'warning' : 'success'}
        showIcon
        title={line.summary}
        description={
          line.summaryBy === 'ai' ? (
            <span className="text-muted" style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <SparkleIcon /> Summary by Ask Nirmaan from the checks below
            </span>
          ) : data.aiSummaryPending && summary.isFetching ? (
            <Spin size="small" description="Ask Nirmaan is writing a summary" />
          ) : undefined
        }
        style={{ marginBottom: 8 }}
      />

      {flags.map((c) => (
        <Flex key={c.key} gap={10} align="flex-start" className="bill-check-flag" style={{ padding: '8px 0', borderBottom: `1px solid ${token.colorSplit}` }}>
          {c.accepted ? (
            <CheckCircleFilled style={{ color: token.colorTextTertiary, marginTop: 4 }} aria-label="Accepted" />
          ) : (
            <ExclamationCircleFilled style={{ color: token.colorWarningText, marginTop: 4 }} aria-label="Flag" />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text strong={!c.accepted} type={c.accepted ? 'secondary' : undefined}>
              {c.title}
            </Typography.Text>
            {c.detail ? (
              <div className="text-muted" style={{ fontSize: 12 }}>
                {c.detail}
              </div>
            ) : null}
            {c.links.length ? (
              <Flex gap={10} wrap style={{ fontSize: 12 }}>
                {c.links.map((l) => (
                  <Link key={`${l.href}-${l.label}`} href={l.href} className="text-link">
                    {l.label}
                  </Link>
                ))}
              </Flex>
            ) : null}
            {c.accepted ? (
              <div className="text-muted" style={{ fontSize: 12 }}>
                Accepted by {c.accepted.byName}, {formatDateTime(c.accepted.at)}: {c.accepted.note}
              </div>
            ) : null}
          </div>
          {data.canAccept ? (
            c.accepted ? (
              <Button size="small" type="link" onClick={() => reopen(c)} loading={accept.isPending && accept.variables?.key === c.key}>
                Reopen
              </Button>
            ) : (
              <Button
                size="small"
                onClick={() => setAccepting(c)}
              >
                Accept
              </Button>
            )
          ) : null}
        </Flex>
      ))}

      {passed.length ? (
        <Flex gap={6} wrap style={{ marginTop: flags.length ? 10 : 0 }} role="list" aria-label="Checks passed">
          {passed.map((c) => (
            <Tag key={c.key} color="green" icon={<CheckOutlined />} role="listitem" style={{ margin: 0 }}>
              {c.title}
            </Tag>
          ))}
        </Flex>
      ) : null}

      <FormShell<{ note: string }>
        open={!!accepting}
        onClose={() => setAccepting(null)}
        layout="modal"
        title="Accept this flag"
        okText="Accept flag"
        form={form}
        onSubmit={async (v) => {
          try {
            await accept.mutateAsync({ key: accepting!.key, note: v.note });
          } catch (e) {
            message.error(errorMessage(e));
            throw e;
          }
          message.success('Flag accepted');
        }}
      >
        <Typography.Paragraph>{accepting?.title}</Typography.Paragraph>
        {/* A fresh note for each flag. */}
        <Form form={form} layout="vertical" preserve={false} key={accepting?.key ?? 'none'}>
          <Form.Item name="note" label="Why it is all right" rules={[{ required: true, message: 'Required' }, { min: 3, message: 'A few words at least' }]}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="Rate revised by the PM on site; letter on file" />
          </Form.Item>
        </Form>
      </FormShell>
    </div>
  );
}

/** The Checks section for a record's sections list. */
export const checksSection = (kind: CheckKind, id: string, version?: number): RecordSection => ({ key: 'checks', title: 'Checks', children: <ChecksSection kind={kind} id={id} version={version} /> });
