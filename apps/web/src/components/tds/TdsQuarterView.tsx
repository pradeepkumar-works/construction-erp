'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Dropdown, Flex, Segmented, Select, Typography } from 'antd';
import {
  TDS_RETURN_FORM_LABELS,
  figure,
  type TdsCertificateDto,
  type TdsChallanDto,
  type TdsDeducteeDto,
  type TdsDeductionDto,
  type TdsProblem,
  type TdsQuarterDto,
  type TdsReturnForm,
  type TdsSectionTotal,
} from '@erp/shared';
import { tk } from '@/ds';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useUrlParam, useUrlTab } from '@/lib/url-state';
import { useIsPhone } from '@/lib/screen';
import { fetchTdsStatement, useTdsCertificates, useTdsQuarter } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { useNotify } from '@/lib/notify';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { AppTabs } from '@/components/common/AppTabs';
import { QueryError } from '@/components/common/QueryState';
import { ExportButton } from '@/components/common/ExportButton';
import { Section } from '@/components/common/Section';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { Figures } from '@/components/figures/Figures';
import { LocalDataTable } from '@/components/list/LocalDataTable';
import type { ListColumn } from '@/components/list/DataTable';
import { RecordLink } from '@/components/record/RecordLink';
import { usePrintPaper } from '@/components/print/usePrintPaper';
import { DownOutlined, PlusOutlined, PrinterOutlined } from '@/components/common/icons';
import { CertificateModal, ConfirmSectionModal, FileReturnModal, RecordChallanModal, ReopenReturnModal } from './TdsForms';
import { openTdsStatementPrint } from './tdsPrint';
import { DeductionStateTag, QuarterStateTag, challanHref, downloadReturnFile, formOfParam, invalidateTds, quarterChoices, quarterOfParam } from './tdsUi';

const TABS = ['fix', 'deductions', 'challans', 'deductees', 'sections', 'certificates'] as const;
type Tab = (typeof TABS)[number];
const caption: React.CSSProperties = { display: 'block', fontSize: tk.type.caption.fontSize, color: tk.color.text.muted };
type Keyed<T> = T & { id: string };

/** Where a quarter's return stands, in one line under the title: due, late by how much, or filed with its receipt. */
function standing(q: TdsQuarterDto) {
  if (q.state === 'FILED') return `Filed on ${formatDate(q.filedOn)}, receipt ${q.receiptNo ?? ''}${q.corrections ? `, ${q.corrections} ${q.corrections === 1 ? 'correction' : 'corrections'}` : ''}`;
  if (q.state === 'REOPENED') return `Reopened: ${q.reopenNote ?? ''}`;
  if (q.state === 'RUNNING') return `The quarter runs to ${formatDate(q.quarter.to)}; the return is due ${formatDate(q.returnDue)}`;
  return `Due ${formatDate(q.returnDue)}${q.totals.lateDays ? `, ${q.totals.lateDays} ${q.totals.lateDays === 1 ? 'day' : 'days'} late` : ''}`;
}

/**
 * Accounts › TDS returns (`/tds`): one quarter of 26Q or 24Q at a time. The figures, then what blocks filing, the
 * deductions with where each is deposited, the challans, the deductees with their statements, the totals by section and,
 * for 26Q, the lower deduction certificates. The return file goes to the Return Preparation Utility, which makes the FVU.
 */
export function TdsQuarterView() {
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();
  const notify = useNotify();
  const print = usePrintPaper();
  const phone = useIsPhone();
  const [formParam, setFormParam] = useUrlParam('form');
  const [qParam, setQParam] = useUrlParam('q');
  const form: TdsReturnForm = formOfParam(formParam);
  const quarter = quarterOfParam(qParam);
  const [tab, setTab] = useUrlTab<Tab>(TABS, 'deductions', { param: 'tab' });
  const { data: q, isLoading, isFetching, error, refetch } = useTdsQuarter(form, quarter.from, !!user);
  const certificates = useTdsCertificates(!!user && form === 'FORM_26Q' && tab === 'certificates');
  const [recording, setRecording] = useState<string[] | null>(null);
  const [filing, setFiling] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [confirming, setConfirming] = useState<TdsDeductionDto | null>(null);
  const [adding, setAdding] = useState(false);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const formWord = TDS_RETURN_FORM_LABELS[form];
  const blocking = q?.problems.filter((p) => p.blocks) ?? [];
  const byId = useMemo(() => new Map((q?.deductions ?? []).map((d) => [d.id, d])), [q]);

  const printStatement = async (d: TdsDeducteeDto) => {
    try {
      const s = await fetchTdsStatement({ form, periodFrom: quarter.from, vendorId: d.vendorId, employeeId: d.employeeId });
      print((l) => openTdsStatementPrint(s, l));
    } catch (e) {
      notify.failed(e);
    }
  };

  const deductionColumns: ListColumn<TdsDeductionDto>[] = [
    {
      key: 'deductee',
      title: form === 'FORM_24Q' ? 'Employee' : 'Deductee',
      locked: true,
      card: 'title',
      cardText: (d) => d.deducteeName,
      render: (_, d) => (
        <div>
          <span translate="no">{d.deducteeName}</span>
          <span style={caption}>
            {d.sourceHref ? (
              <Link href={d.sourceHref} className="text-link">
                {d.sourceLabel}
              </Link>
            ) : (
              d.sourceLabel
            )}
            {d.projectName ? ` · ${d.projectName}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'pan', title: 'PAN', width: 130, render: (_, d) => (d.deducteePan ? <span className="mono" translate="no">{d.deducteePan}</span> : <Typography.Text type="danger">No PAN</Typography.Text>), defaultFrom: 1024 },
    {
      key: 'section',
      title: 'Section',
      width: 170,
      render: (_, d) =>
        d.state === 'TO_CONFIRM' ? (
          d.canConfirm ? (
            <Button size="small" onClick={() => setConfirming(d)}>
              Confirm section
            </Button>
          ) : (
            <DeductionStateTag state={d.state} />
          )
        ) : (
          <span>
            <span translate="no">{d.sectionName}</span>
            <span style={caption}>{`${d.rate ? `${d.rate}%` : ''}${d.reason === 'A' ? ', certificate' : d.reason === 'C' ? ', no PAN' : ''}`}</span>
          </span>
        ),
    },
    { key: 'paidOn', title: 'Paid on', width: 120, render: (_, d) => formatDate(d.paidOn), card: 'date' },
    { key: 'amountPaid', title: 'Amount paid', kind: 'money', value: (d) => d.amountPaid, width: 150, defaultFrom: 768 },
    { key: 'tds', title: 'TDS', kind: 'money', value: (d) => d.tdsAmount, width: 140, total: (rows) => formatINR(rows.reduce((n, d) => n + Number(d.tdsAmount), 0)), card: 'amount' },
    {
      key: 'state',
      title: 'Deposited',
      width: 220,
      render: (_, d) =>
        d.challanId ? (
          <Link href={challanHref(d.challanId)} className="mono" translate="no">
            {d.challanLabel}
          </Link>
        ) : d.state === 'TO_CONFIRM' ? (
          <DeductionStateTag state={d.state} />
        ) : (
          <span>
            <DeductionStateTag state={d.state} />
            <span style={caption}>{`Due ${formatDate(d.depositDue)}`}</span>
          </span>
        ),
    },
    { key: 'interest', title: 'Interest 201(1A)', kind: 'money', value: (d) => (Number(d.interest) ? d.interest : null), tone: (d) => (Number(d.interest) ? 'danger' : undefined), width: 150, defaultFrom: 1280 },
  ];

  const challanColumns: ListColumn<TdsChallanDto>[] = [
    {
      key: 'challan',
      title: 'Challan',
      locked: true,
      card: 'title',
      cardText: (c) => c.label,
      render: (_, c) => (
        <div>
          <RecordLink href={challanHref(c.id)} onOpen={() => router.push(challanHref(c.id))} strong>
            <span className="mono" translate="no">
              {c.label}
            </span>
          </RecordLink>
          <span style={caption}>{`${c.deductions} ${c.deductions === 1 ? 'deduction' : 'deductions'}${c.late ? ', deposited late' : ''}${c.exportedToTally ? ', in Tally' : ''}`}</span>
        </div>
      ),
    },
    { key: 'depositedOn', title: 'Deposited on', width: 130, render: (_, c) => formatDate(c.depositedOn), card: 'date' },
    { key: 'tax', title: 'Tax', kind: 'money', value: (c) => c.tax, width: 140, total: (rows) => formatINR(rows.reduce((n, c) => n + Number(c.tax), 0)) },
    { key: 'interest', title: 'Interest', kind: 'money', value: (c) => (Number(c.interest) ? c.interest : null), width: 130, defaultFrom: 1024 },
    { key: 'fee', title: 'Late fee', kind: 'money', value: (c) => (Number(c.fee) ? c.fee : null), width: 130, defaultFrom: 1280 },
    { key: 'total', title: 'Paid', kind: 'money', value: (c) => c.total, width: 140, card: 'amount' },
  ];

  const deducteeColumns: ListColumn<Keyed<TdsDeducteeDto>>[] = [
    {
      key: 'name',
      title: form === 'FORM_24Q' ? 'Employee' : 'Deductee',
      locked: true,
      card: 'title',
      cardText: (d) => d.name,
      render: (_, d) => (
        <div>
          <span translate="no">{d.name}</span>
          <span style={caption}>{d.pan ? <span className="mono" translate="no">{d.pan}</span> : 'No PAN'}</span>
        </div>
      ),
    },
    { key: 'deductions', title: 'Deductions', kind: 'qty', value: (d) => d.deductions, width: 120, defaultFrom: 1024 },
    { key: 'paid', title: 'Amount paid', kind: 'money', value: (d) => d.paid, width: 150, defaultFrom: 768 },
    { key: 'tds', title: 'TDS', kind: 'money', value: (d) => d.tds, width: 140, card: 'amount' },
    { key: 'deposited', title: 'Deposited', kind: 'money', value: (d) => d.deposited, width: 140, defaultFrom: 1024 },
    {
      key: 'print',
      title: 'Statement',
      width: 150,
      render: (_, d) => (
        <Button size="small" icon={<PrinterOutlined />} onClick={() => void printStatement(d)}>
          {form === 'FORM_24Q' ? 'Print' : 'Print 16A'}
        </Button>
      ),
    },
  ];

  const sectionColumns: ListColumn<Keyed<TdsSectionTotal>>[] = [
    { key: 'section', title: 'Section', locked: true, card: 'title', cardText: (s) => s.name, render: (_, s) => <span translate="no">{s.name}</span> },
    { key: 'deductions', title: 'Deductions', kind: 'qty', value: (s) => s.deductions, width: 120 },
    { key: 'paid', title: 'Amount paid', kind: 'money', value: (s) => s.paid, width: 160 },
    { key: 'tds', title: 'TDS', kind: 'money', value: (s) => s.tds, width: 150, card: 'amount', total: (rows) => formatINR(rows.reduce((n, s) => n + Number(s.tds), 0)) },
    { key: 'deposited', title: 'Deposited', kind: 'money', value: (s) => s.deposited, width: 150 },
  ];

  const certificateColumns: ListColumn<TdsCertificateDto>[] = [
    {
      key: 'vendor',
      title: 'Vendor',
      locked: true,
      card: 'title',
      cardText: (c) => c.vendorName,
      render: (_, c) => (
        <div>
          <span translate="no">{c.vendorName}</span>
          <span style={caption} className="mono" translate="no">
            {c.certificateNo}
          </span>
        </div>
      ),
    },
    { key: 'section', title: 'Section', width: 110, render: (_, c) => <span translate="no">{c.sectionName}</span> },
    { key: 'rate', title: 'Rate', kind: 'pct', value: (c) => c.rate, width: 90 },
    { key: 'valid', title: 'Valid', width: 220, render: (_, c) => `${formatDate(c.validFrom)} to ${formatDate(c.validTo)}`, card: 'date' },
    { key: 'limit', title: 'Covers', kind: 'money', value: (c) => c.limit, width: 140 },
    { key: 'used', title: 'Used', kind: 'money', value: (c) => c.used, width: 140, card: 'amount' },
    {
      key: 'remove',
      title: '',
      width: 110,
      render: (_, c) => (
        <Button
          size="small"
          danger
          onClick={() =>
            askDelete({
              what: `certificate ${c.certificateNo}`,
              verb: 'Remove',
              onConfirm: async () => (await api.delete(`/tds/certificates/${c.id}`)).data,
              onDone: () => invalidateTds(qc),
            })
          }
        >
          Remove
        </Button>
      ),
    },
  ];

  const recordButton = q?.can.record ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setRecording([])}>
      Record challan
    </Button>
  ) : null;

  const problemLine = (p: TdsProblem, i: number) => {
    const d = p.deductionId ? byId.get(p.deductionId) : undefined;
    const act =
      p.kind === 'NO_TAN' ? (
        <Link href="/company-settings">Enter the TAN</Link>
      ) : p.kind === 'TO_CONFIRM' && d?.canConfirm ? (
        <Button size="small" onClick={() => setConfirming(d)}>
          Confirm section
        </Button>
      ) : p.kind === 'NOT_DEPOSITED' && d && q?.can.record && d.state === 'NOT_DEPOSITED' ? (
        <Button size="small" onClick={() => setRecording([d.id])}>
          Record its challan
        </Button>
      ) : p.challanId ? (
        <Link href={challanHref(p.challanId)}>Open the challan</Link>
      ) : d?.sourceHref ? (
        <Link href={d.sourceHref}>Open {d.sourceLabel}</Link>
      ) : null;
    return (
      <Flex key={`${p.kind}-${p.deductionId ?? p.challanId ?? i}`} align="center" justify="space-between" gap={tk.space[3]} wrap style={{ minHeight: 44, borderBottom: `1px solid ${tk.color.line.hairline}` }}>
        <Typography.Text type={p.blocks ? undefined : 'secondary'}>{p.text}</Typography.Text>
        {act}
      </Flex>
    );
  };

  const fixTab =
    q && q.problems.length ? (
      <Flex vertical gap={tk.space[4]}>
        {blocking.length > 0 && (
          <Section title="Blocks filing">
            <div>{blocking.map(problemLine)}</div>
          </Section>
        )}
        {q.problems.some((p) => !p.blocks) && (
          <Section title="Check before filing">
            <div>{q.problems.filter((p) => !p.blocks).map(problemLine)}</div>
          </Section>
        )}
      </Flex>
    ) : (
      <Typography.Paragraph type="secondary">{q?.totals.deductions ? 'Nothing stops this return being filed.' : `No ${formWord} deductions in ${quarter.label}.`}</Typography.Paragraph>
    );

  const more = q?.can.reopen
    ? [{ key: 'reopen', label: 'Reopen for correction', onClick: () => setReopening(true) }]
    : [];

  const actions = q && (
    <Flex gap={tk.space[2]} wrap>
      {recordButton}
      {q.can.file && <Button onClick={() => setFiling(true)}>{q.state === 'REOPENED' ? 'Mark correction filed' : 'Mark filed'}</Button>}
      <ExportButton label="Return file" onExport={async () => (q.can.exportFile ? downloadReturnFile(q) : notify.failed(new Error(blocking[0]?.text ?? 'Nothing to put in the file yet')))} />
      {more.length > 0 && (
        <Dropdown menu={{ items: more }} trigger={['click']}>
          <Button aria-label="More actions" icon={<DownOutlined />} iconPlacement="end">
            More
          </Button>
        </Dropdown>
      )}
    </Flex>
  );

  return (
    <div className="page-container">
      <PageHeader
        title="TDS returns"
        help="TDS deducted on payments to vendors, subcontractor bills (26Q) and salary runs (24Q), by section and quarter: the challans it was deposited by, what blocks filing, the file for the government's Return Preparation Utility and each deductee's statement. The utility checks the file and makes the FVU to upload; Form 16A and Form 16 that count come from TRACES."
        subtitle={
          q ? (
            <Flex align="center" gap={tk.space[2]} wrap>
              <QuarterStateTag state={q.state} />
              <span>{standing(q)}</span>
            </Flex>
          ) : undefined
        }
        extra={
          <Flex gap={tk.space[2]} wrap>
            <Segmented
              aria-label="Return"
              value={formWord}
              options={['26Q', '24Q']}
              onChange={(v) => {
                setFormParam(v === '24Q' ? '24Q' : undefined);
                if (tab === 'certificates' && v === '24Q') setTab('deductions');
              }}
            />
            <Select aria-label="Quarter" style={{ minWidth: 150 }} value={quarter.from} options={quarterChoices()} onChange={(v: string) => setQParam(v)} />
          </Flex>
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <div style={{ marginBottom: tk.space[4] }}>
        <Figures
          label={`${formWord} figures for ${quarter.label}`}
          figures={
            q
              ? [
                  figure('tdsDeducted', q.totals.tds, { count: q.totals.deductions }),
                  figure('tdsNotDeposited', q.totals.notDeposited),
                  figure('tdsInterest', q.totals.interest),
                  q.state !== 'RUNNING' && figure('tdsLateFee', q.totals.lateFee),
                ]
              : undefined
          }
        />
      </div>
      {/* On a phone the actions take a line of their own, so the tab bar keeps the width to scroll its tabs. */}
      {phone && actions && <div style={{ marginBottom: tk.space[3] }}>{actions}</div>}
      <Card size="small">
        <AppTabs
          variant="page"
          activeKey={tab}
          onChange={(k) => setTab(k as Tab)}
          extra={phone ? undefined : actions}
          items={[
            { key: 'fix', label: 'To fix', count: blocking.length || undefined, countLabel: 'blocking filing', attention: blocking.length > 0, children: fixTab },
            {
              key: 'deductions',
              label: 'Deductions',
              count: q?.deductions.length,
              countLabel: 'deductions',
              children: (
                <LocalDataTable<TdsDeductionDto>
                  list={`tds-deductions-${formWord}`}
                  columns={deductionColumns}
                  rows={q?.deductions ?? []}
                  loading={isLoading || isFetching}
                  failed={!!error}
                  onOpen={(id) => {
                    const href = byId.get(id)?.sourceHref;
                    if (href) router.push(href);
                  }}
                  bulk={
                    q?.can.record
                      ? [{ key: 'challan', label: 'Record their challan', primary: true, allowed: (rows) => rows.every((r) => r.state === 'NOT_DEPOSITED'), run: (rows) => setRecording(rows.map((r) => r.id)) }]
                      : undefined
                  }
                  emptyText={`No ${formWord} deductions in ${quarter.label}`}
                />
              ),
            },
            {
              key: 'challans',
              label: 'Challans',
              count: q?.challans.length,
              countLabel: 'challans',
              children: (
                <LocalDataTable<TdsChallanDto>
                  list={`tds-challans-${formWord}`}
                  columns={challanColumns}
                  rows={q?.challans ?? []}
                  loading={isLoading || isFetching}
                  failed={!!error}
                  onOpen={(id) => router.push(challanHref(id))}
                  emptyText={<Flex gap={tk.space[3]} align="center" wrap><span>No challan for {quarter.label} yet</span>{recordButton}</Flex>}
                />
              ),
            },
            {
              key: 'deductees',
              label: form === 'FORM_24Q' ? 'Employees' : 'Deductees',
              count: q?.deductees.length,
              countLabel: form === 'FORM_24Q' ? 'employees' : 'deductees',
              children: (
                <LocalDataTable<Keyed<TdsDeducteeDto>>
                  list={`tds-deductees-${formWord}`}
                  columns={deducteeColumns}
                  rows={(q?.deductees ?? []).map((d) => ({ ...d, id: d.key }))}
                  loading={isLoading || isFetching}
                  failed={!!error}
                  emptyText={`No ${formWord} deductions in ${quarter.label}`}
                />
              ),
            },
            {
              key: 'sections',
              label: 'By section',
              children: (
                <LocalDataTable<Keyed<TdsSectionTotal>>
                  list={`tds-sections-${formWord}`}
                  columns={sectionColumns}
                  rows={(q?.bySection ?? []).map((s) => ({ ...s, id: s.section ?? 'confirm' }))}
                  loading={isLoading || isFetching}
                  failed={!!error}
                  emptyText={`No ${formWord} deductions in ${quarter.label}`}
                />
              ),
            },
            ...(form === 'FORM_26Q'
              ? [
                  {
                    key: 'certificates',
                    label: 'Certificates',
                    children: (
                      <>
                        <Flex justify="flex-end" style={{ marginBottom: tk.space[3] }}>
                          <Button icon={<PlusOutlined />} onClick={() => setAdding(true)}>
                            Record certificate
                          </Button>
                        </Flex>
                        <LocalDataTable<TdsCertificateDto>
                          list="tds-certificates"
                          columns={certificateColumns}
                          rows={certificates.data ?? []}
                          loading={certificates.isLoading || certificates.isFetching}
                          failed={!!certificates.error}
                          emptyText="No lower deduction certificate recorded"
                        />
                      </>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      {q && <RecordChallanModal open={recording !== null} onClose={() => setRecording(null)} quarter={q} chosen={recording ?? undefined} />}
      {q && <FileReturnModal open={filing} onClose={() => setFiling(false)} quarter={q} />}
      {q && <ReopenReturnModal open={reopening} onClose={() => setReopening(false)} quarter={q} />}
      <ConfirmSectionModal deduction={confirming} onClose={() => setConfirming(null)} />
      <CertificateModal open={adding} onClose={() => setAdding(false)} />
      {deleteDialog}
    </div>
  );
}

