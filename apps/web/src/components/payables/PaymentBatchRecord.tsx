'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, App, Button, Form, Input, Segmented, Select, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BANK_FILE_FORMATS, figure, type BankFileDto, type PaymentBatchDetailDto, type PaymentBatchLineDto, type UtrImportResultDto } from '@erp/shared';
import { UploadOutlined } from '@/components/common/icons';
import { tk } from '@/ds';
import { api, errorMessage } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { usePayableRequests, usePaymentBatch } from '@/lib/queries';
import { formatDateTime, formatDate, formatINR, NO_VALUE } from '@/lib/format';
import { readCells } from '@/lib/read-cells';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { RecordFrame } from '@/components/record/RecordFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { FormShell } from '@/components/form/FormShell';
import { saveText } from '@/components/payroll/payrollUi';
import { BATCHES, BatchStatusTag, LineStateTag, batchHref, invalidateBatches } from './paymentBatchUi';

const LIST = { href: BATCHES, label: 'Bank payments' };
const caption: React.CSSProperties = { display: 'block', fontSize: tk.type.caption.fontSize, color: tk.color.text.muted };
const requestHref = (id: string) => `/payment-requests/${id}`;

function Lines({ batch, onRemove }: { batch: PaymentBatchDetailDto; onRemove: (lines: PaymentBatchLineDto[]) => Promise<void> }) {
  const router = useRouter();
  const columns: ListColumn<PaymentBatchLineDto>[] = [
    {
      key: 'request',
      title: 'Request',
      locked: true,
      render: (_, l) => (
        <div>
          <RecordLink href={requestHref(l.paymentRequestId)} onOpen={() => router.push(requestHref(l.paymentRequestId))} strong>
            {l.requestNo}
          </RecordLink>
          <span style={caption} translate="no">{`${l.vendorName} · ${l.projectCode}`}</span>
        </div>
      ),
    },
    { key: 'against', title: 'Against', width: 200, render: (_, l) => l.against, defaultFrom: 1280 },
    {
      key: 'account',
      title: 'Account',
      width: 190,
      render: (_, l) => (l.accountEnding ? <span className="mono" translate="no">{`…${l.accountEnding} · ${l.ifsc ?? NO_VALUE}`}</span> : NO_VALUE),
      defaultFrom: 1024,
    },
    { key: 'mode', title: 'Mode', width: 90, render: (_, l) => l.mode ?? NO_VALUE },
    { key: 'amount', title: 'Amount', kind: 'money', value: (l) => l.amount, width: 150 },
    {
      key: 'state',
      title: batch.status === 'DRAFT' ? 'Bank details' : 'UTR',
      width: 240,
      render: (_, l) => (
        <div>
          <LineStateTag state={l.state} />
          {l.utr ? (
            <span style={caption} className="mono" translate="no">
              {l.utr}
            </span>
          ) : l.problem ? (
            <span style={caption}>{l.problem}</span>
          ) : null}
        </div>
      ),
    },
  ];
  const choice = useColumnChoice('bank-payment-lines', columns);
  return (
    <DataTable<PaymentBatchLineDto>
      columns={columns}
      visible={choice.visible}
      onChooseColumns={choice.setChosen}
      chosenIsDefault={choice.isDefault}
      rows={batch.items}
      table={{ pagination: batch.items.length > 50 ? { pageSize: 50, showSizeChanger: false } : false }}
      onOpen={(id) => {
        const l = batch.items.find((x) => x.id === id);
        if (l) router.push(requestHref(l.paymentRequestId));
      }}
      bulk={batch.status === 'DRAFT' ? [{ key: 'remove', label: 'Take out of the batch', danger: true, run: onRemove }] : undefined}
    />
  );
}

/** Add approved requests: each with what it has left to pay; one in another open batch, or without bank details, says so. */
function AddRequestsModal({ batch, open, onClose }: { batch: PaymentBatchDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ paymentRequestIds: string[] }>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data, isLoading } = usePayableRequests(open);
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  const mine = useMemo(() => new Set(batch.items.map((l) => l.paymentRequestId)), [batch.items]);
  const options = (data ?? [])
    .filter((r) => !mine.has(r.id))
    .map((r) => ({
      value: r.id,
      disabled: !!r.inBatch,
      label: `${r.requestNo} · ${r.vendorName} · ${formatINR(r.left)}${r.inBatch ? ` · in ${r.inBatch}` : r.problem ? ` · ${r.problem}` : ''}`,
    }));
  const mutation = useMutation({
    mutationFn: async (v: { paymentRequestIds: string[] }) => (await api.post<PaymentBatchDetailDto>(`/payment-batches/${batch.id}/lines`, v)).data,
    onSuccess: (b, v) => {
      invalidateBatches(qc);
      notify.saved(`${v.paymentRequestIds.length === 1 ? 'One request' : `${v.paymentRequestIds.length} requests`} added; the file pays ${formatINR(b.total)}`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={`Add payment requests · ${batch.batchNo}`} okText="Add to batch" projectDefault={false} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="paymentRequestIds" label="Approved payment requests" tooltip="Requests paid through the bank with something left to pay" rules={[{ required: true, message: 'Choose the requests to pay' }]}>
          <Select mode="multiple" loading={isLoading} options={options} showSearch={{ optionFilterProp: 'label' }} placeholder="Search request no. or vendor" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

type UtrSource = 'file' | 'paste';

/** The bank's response file (CSV or Excel) or a pasted list, one request number and its UTR a line. */
function ImportUtrsModal({ batch, open, onClose }: { batch: PaymentBatchDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ source: UtrSource; text?: string }>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { message } = App.useApp();
  const [file, setFile] = useState<{ name: string; cells: unknown[][] } | null>(null);
  const source = Form.useWatch('source', form) ?? 'file';
  useEffect(() => {
    if (open) form.setFieldsValue({ source: 'file', text: '' });
  }, [open, form]);
  const beforeUpload: UploadProps['beforeUpload'] = (f) => {
    readCells(f)
      .then((cells) => setFile({ name: f.name, cells }))
      .catch(() => message.error('That file could not be read. Save it from the bank as CSV or Excel and try again.'));
    return false;
  };
  const mutation = useMutation({
    mutationFn: async (v: { source: UtrSource; text?: string }) => {
      const cells = v.source === 'file' ? (file?.cells ?? []) : (v.text ?? '').split(/\r?\n/).filter((l) => l.trim()).map((l) => [l]);
      return (await api.post<UtrImportResultDto>(`/payment-batches/${batch.id}/utrs`, { cells })).data;
    },
    onSuccess: (r) => {
      invalidateBatches(qc);
      const head = r.batch.status === 'SETTLED' ? `${batch.batchNo} is settled: every payment has its UTR` : `${r.set} UTRs in; ${r.waiting} still waiting`;
      const rest = [...r.rejected.map((x) => `${x.reference} ${x.status}`), ...r.problems];
      notify.saved(rest.length ? `${head}. ${rest.join('. ')}` : head);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell
      open={open}
      onClose={() => {
        setFile(null);
        onClose();
      }}
      form={form}
      layout="modal"
      title={`Import UTRs · ${batch.batchNo}`}
      okText="Import UTRs"
      projectDefault={false}
      onSubmit={async (v) => {
        if (v.source === 'file' && !file) throw new Error('Choose the bank’s response file');
        return mutation.mutateAsync(v);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="source" label="From">
          <Segmented<UtrSource> options={[{ value: 'file', label: 'Bank response file' }, { value: 'paste', label: 'Paste UTRs' }]} />
        </Form.Item>
        {source === 'file' ? (
          <Form.Item label="Response file" tooltip="Each row is matched by the request number the file carried">
            <Upload.Dragger accept=".csv,.xlsx,.xls,.txt" beforeUpload={beforeUpload} showUploadList={false}>
              <p>
                <UploadOutlined />
              </p>
              <p>{file ? `${file.name}: ${file.cells.length} rows` : 'Drop the file here, or choose it'}</p>
            </Upload.Dragger>
          </Form.Item>
        ) : (
          <Form.Item name="text" label="UTRs" tooltip="One a line: the request number, then its UTR" rules={[{ required: true, message: 'Paste a request number and its UTR on each line' }]}>
            <Input.TextArea rows={6} className="mono" placeholder={batch.items[0] ? `${batch.items[0].requestNo} HDFCN52026111012345` : undefined} />
          </Form.Item>
        )}
      </Form>
    </FormShell>
  );
}

/**
 * A bank payment at `/bank-payments/<id>`: a draft takes approved requests; Make bank file writes the file and records
 * each payment without its UTR; Import UTRs reads the bank's references back and settles the batch.
 */
export function PaymentBatchRecord({ id, onClose }: { id: string; onClose: () => void }) {
  const { modal } = App.useApp();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: b, isLoading, error, refetch } = usePaymentBatch(id);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const download = async () => {
    try {
      const f = (await api.get<BankFileDto>(`/payment-batches/${id}/file`)).data;
      saveText(f.fileName, f.mimeType, f.content);
    } catch (err) {
      notify.failed(err, download, errorMessage(err, 'Could not download the file'));
    }
  };
  const step = useMutation({
    mutationFn: async (to: 'export' | 'undo-export') => (await api.post<PaymentBatchDetailDto>(`/payment-batches/${id}/${to}`)).data,
    onSuccess: (batch, to) => {
      invalidateBatches(qc);
      if (to === 'export') {
        notify.saved(`${batch.inFile} payments of ${formatINR(batch.total)} recorded; upload the file to the bank`);
        void download();
      } else notify.saved(`${batch.batchNo} is a draft again; its payments are taken off`);
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({ mutationFn: async () => (await api.delete(`/payment-batches/${id}`)).data });
  const removeLines = async (lines: PaymentBatchLineDto[]) => {
    try {
      for (const l of lines) await api.delete(`/payment-batches/${id}/lines/${l.id}`);
      notify.success(lines.length === 1 ? `${lines[0].requestNo} taken out` : `${lines.length} requests taken out`);
    } catch (err) {
      notify.failed(err);
    } finally {
      invalidateBatches(qc);
    }
  };
  const draft = b?.status === 'DRAFT';
  const exported = b?.status === 'EXPORTED';
  const leftOut = b ? b.items.filter((l) => l.state === 'MISSING' || l.state === 'LEFT_OUT') : [];

  return (
    <>
      <RecordFrame
        mode="page"
        kind="Bank payment"
        list={LIST}
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        record={
          b && {
            href: batchHref(b.id),
            title: b.batchNo,
            tags: <BatchStatusTag status={b.status} />,
            headline: [figure('paymentBatchTotal', b.total, { count: b.inFile })],
            notices: leftOut.length ? (
              <Alert
                type="warning"
                showIcon
                title={`${leftOut.length === 1 ? 'One request is' : `${leftOut.length} requests are`} ${draft ? 'left out of the file' : 'not in the file'}: the vendor has no bank account or IFSC. Add them on the vendor${draft ? ', or take the request out' : ' and pay in another batch'}`}
              />
            ) : null,
            facts: [
              { key: 'account', label: 'Debit account', children: <span className="mono" translate="no">{b.debitAccount}</span> },
              { key: 'format', label: 'Bank file layout', children: BANK_FILE_FORMATS[b.format].label },
              { key: 'utrs', label: 'UTRs in', children: draft ? NO_VALUE : `${b.paid} of ${b.inFile}` },
              ...(b.paymentDate ? [{ key: 'date', label: 'Payment date', children: formatDate(b.paymentDate) }] : []),
              ...(b.exportedByName && b.exportedAt ? [{ key: 'exported', label: 'File made', children: `${b.exportedByName}, ${formatDateTime(b.exportedAt)}` }] : []),
              ...(b.settledAt ? [{ key: 'settled', label: 'Settled', children: formatDateTime(b.settledAt) }] : []),
            ],
            sections: [{ key: 'lines', title: 'Payments', count: b.items.length, empty: !b.items.length, children: <Lines batch={b} onRemove={removeLines} /> }],
            actions: (size) =>
              draft ? (
                <>
                  <Button
                    size={size}
                    type="primary"
                    disabled={!!b.exportProblem}
                    title={b.exportProblem ?? undefined}
                    loading={step.isPending && step.variables === 'export'}
                    onClick={() =>
                      modal.confirm({
                        title: `Make the bank file for ${formatINR(b.total)}?`,
                        content: `${b.inFile} payments are recorded today without their UTRs, and the file downloads to upload to the bank.${leftOut.length ? ` ${leftOut.length} without bank details stay out.` : ''}`,
                        okText: 'Make bank file',
                        onOk: () => step.mutateAsync('export'),
                      })
                    }
                  >
                    Make bank file
                  </Button>
                  <Button size={size} onClick={() => setAdding(true)}>
                    Add requests
                  </Button>
                </>
              ) : (
                <>
                  {exported ? (
                    <Button size={size} type="primary" onClick={() => setImporting(true)}>
                      Import UTRs
                    </Button>
                  ) : null}
                  <Button size={size} onClick={() => void download()}>
                    Download file
                  </Button>
                </>
              ),
            more: draft
              ? [
                  {
                    key: 'delete',
                    label: 'Delete',
                    danger: true,
                    onSelect: () =>
                      askDelete({
                        what: b.batchNo,
                        onConfirm: () => remove.mutateAsync(),
                        onDone: () => {
                          invalidateBatches(qc);
                          onClose();
                        },
                      }),
                  },
                ]
              : exported && !b.paid
                ? [
                    {
                      key: 'undo',
                      label: 'Undo export',
                      danger: true,
                      onSelect: () =>
                        modal.confirm({
                          title: `Undo the export of ${b.batchNo}?`,
                          content: 'Use it when the bank refused the file or nothing was uploaded: its payments are taken off and the batch is a draft again.',
                          okText: 'Undo export',
                          okButtonProps: { danger: true },
                          onOk: () => step.mutateAsync('undo-export'),
                        }),
                    },
                  ]
                : [],
          }
        }
      />
      {b && draft ? <AddRequestsModal batch={b} open={adding} onClose={() => setAdding(false)} /> : null}
      {b && exported ? <ImportUtrsModal batch={b} open={importing} onClose={() => setImporting(false)} /> : null}
      {deleteDialog}
    </>
  );
}
