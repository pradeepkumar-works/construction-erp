'use client';

import React, { useState } from 'react';
import { App, Alert, Button, Descriptions, Drawer, Form, Input, Modal, Space, Table, Typography } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined, RollbackOutlined, SendOutlined, StopOutlined } from '@/components/common/icons';
import type { BookLineDto, BookVoucherDto } from '@erp/shared';
import { useBookVoucher, useBooksAction } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { LinkButton } from '@/components/common/LinkButton';
import { Amount, VoucherStatusTag, VoucherTypeTag, sourceHref, sourceLabel } from './booksUi';
import { VoucherForm } from './VoucherForm';

/** Sending back or cancelling needs a reason. */
function ReasonModal({ open, title, okText, onClose, onOk }: { open: boolean; title: string; okText: string; onClose: () => void; onOk: (note: string) => Promise<unknown> }) {
  const [form] = Form.useForm<{ note: string }>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      onCancel={onClose}
      confirmLoading={busy}
      destroyOnHidden
      onOk={async () => {
        const { note } = await form.validateFields();
        setBusy(true);
        setProblem(null);
        try {
          await onOk(note.trim());
          form.resetFields();
          onClose();
        } catch (e) {
          setProblem(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="note" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why, so accounts know what to change' }]}>
          <Input.TextArea rows={3} maxLength={1000} />
        </Form.Item>
      </Form>
      {problem && <Alert type="error" showIcon title={problem} />}
    </Modal>
  );
}

/** A voucher with its lines, and what the caller may do with it. */
export function VoucherDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message } = App.useApp();
  const { data: v, error, refetch } = useBookVoucher(id);
  const act = useBooksAction<BookVoucherDto>();
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState<'reject' | 'cancel' | null>(null);
  const run = async (path: string, done: (r: BookVoucherDto) => string, body?: unknown) => {
    try {
      const r = await act.mutateAsync({ path, body });
      message.success(done(r));
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  const href = v ? sourceHref(v.source, v.sourceId) : null;
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={760}
      title={v ? <span translate="no">{v.voucherNo}</span> : 'Voucher'}
      extra={
        v ? (
          <Space wrap>
            {v.canEdit && (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>
                Change
              </Button>
            )}
            {v.canSubmit && (
              <Button size="small" type="primary" icon={<SendOutlined />} loading={act.isPending} onClick={() => run(`/books/vouchers/${v.id}/submit`, (r) => `${r.voucherNo} submitted for approval`)}>
                Submit for approval
              </Button>
            )}
            {v.canDecide && (
              <>
                <Button size="small" icon={<RollbackOutlined />} onClick={() => setAsking('reject')}>
                  Send back
                </Button>
                <Button size="small" type="primary" icon={<CheckOutlined />} loading={act.isPending} onClick={() => run(`/books/vouchers/${v.id}/approve`, (r) => `${r.voucherNo} approved and in the books`, {})}>
                  Approve
                </Button>
              </>
            )}
            {v.canCancel && (
              <Button size="small" danger icon={<StopOutlined />} onClick={() => setAsking('cancel')}>
                Cancel voucher
              </Button>
            )}
            {v.canEdit && (
              <ConfirmDelete what={`voucher ${v.voucherNo}`} onConfirm={() => act.mutateAsync({ method: 'delete', path: `/books/vouchers/${v.id}` })} onDone={onClose}>
                <Button size="small" danger icon={<DeleteOutlined />}>
                  Delete
                </Button>
              </ConfirmDelete>
            )}
          </Space>
        ) : null
      }
    >
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : v ? (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          {v.reviewNote && v.status !== 'APPROVED' && <Alert type={v.status === 'CANCELLED' ? 'info' : 'warning'} showIcon title={v.status === 'CANCELLED' ? `Cancelled: ${v.reviewNote}` : `Sent back: ${v.reviewNote}`} />}
          <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Voucher">
              <VoucherTypeTag type={v.type} />
              <VoucherStatusTag status={v.status} />
            </Descriptions.Item>
            <Descriptions.Item label="Date">{formatDate(v.date)}</Descriptions.Item>
            <Descriptions.Item label="From">
              {href ? (
                <LinkButton href={href} type="link" size="small" style={{ padding: 0 }}>
                  {sourceLabel(v.source)}
                </LinkButton>
              ) : (
                sourceLabel(v.source)
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Reference">{v.reference ? <span translate="no">{v.reference}</span> : NO_VALUE}</Descriptions.Item>
            {v.party && <Descriptions.Item label="Party">{v.party}</Descriptions.Item>}
            <Descriptions.Item label="Project">{v.projectName ?? 'Head office'}</Descriptions.Item>
            {v.preparedByName && <Descriptions.Item label="Made by">{v.preparedByName}</Descriptions.Item>}
            {v.approvedByName && <Descriptions.Item label="Approved by">{`${v.approvedByName}, ${formatDateTime(v.approvedAt)}`}</Descriptions.Item>}
            <Descriptions.Item label="Narration" span={2}>
              {v.narration}
            </Descriptions.Item>
          </Descriptions>
          <Table<BookLineDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={v.lines}
            scroll={{ x: 560 }}
            columns={[
              { title: 'Account', dataIndex: 'accountName', render: (n: string, l) => <span translate="no">{l.projectCode ? `${n} · ${l.projectCode}` : n}</span> },
              { title: 'Debit', dataIndex: 'debit', align: 'right', width: 150, render: (x: string | null) => <Amount value={x} /> },
              { title: 'Credit', dataIndex: 'credit', align: 'right', width: 150, render: (x: string | null) => <Amount value={x} /> },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <Typography.Text strong>Total</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Typography.Text strong>
                    <Amount value={v.amount} />
                  </Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <Typography.Text strong>
                    <Amount value={v.amount} />
                  </Typography.Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Space>
      ) : null}
      {v?.canEdit && <VoucherForm open={editing} onClose={() => setEditing(false)} voucher={v} />}
      {v && (
        <ReasonModal
          open={!!asking}
          title={asking === 'cancel' ? `Cancel ${v.voucherNo}?` : `Send ${v.voucherNo} back to accounts?`}
          okText={asking === 'cancel' ? 'Cancel voucher' : 'Send back'}
          onClose={() => setAsking(null)}
          onOk={async (note) => {
            const r = await act.mutateAsync({ path: `/books/vouchers/${v.id}/${asking}`, body: { note } });
            message.success(asking === 'cancel' ? `${r.voucherNo} cancelled and out of the books` : `${r.voucherNo} sent back`);
          }}
        />
      )}
    </Drawer>
  );
}
