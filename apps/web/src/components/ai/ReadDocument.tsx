'use client';

import React, { useState } from 'react';
import { themeFontSize } from '@/lib/theme';
import { App, Button, Flex, Pagination, Segmented, Tooltip, Typography, theme } from 'antd';
import type { AttachmentDto } from '@erp/shared';
import type { FormInstance, FormItemProps } from 'antd';
import type { DocReadField, DocReadKind, DocReadResultDto } from '@erp/shared';
import { DOC_READ_MAX_PAGES, DOC_READ_PAGES_OF, readDateProblem } from '@erp/shared';
import dayjs from 'dayjs';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAsk } from '@/lib/ask';
import { pagesOf, type PageImage } from '@/lib/doc-pages';
import { uploadFile, useReadDocument } from '@/lib/queries';
import { SparkleIcon } from './SparkleIcon';

/** A document read to fill a form (AI item 70): what came back, the pages it came from and the file picked. */
export interface ReadState {
  result: DocReadResultDto;
  pages: PageImage[];
  file: File;
}

const NOUN: Record<DocReadKind, string> = { invoice: 'invoice', challan: 'challan', drawing: 'drawing', workOrder: 'work order', boq: 'BOQ' };

const FIELD_LABELS: Record<string, string> = {
  vendorName: 'Vendor', supplierName: 'Supplier', gstin: 'GSTIN', invoiceNo: 'Invoice no.', invoiceDate: 'Invoice date', poNo: 'PO no.', subtotal: 'Taxable value',
  cgst: 'CGST', sgst: 'SGST', igst: 'IGST', freight: 'Freight', total: 'Invoice total', challanNo: 'Challan no.', date: 'Date', vehicleNo: 'Vehicle no.',
  drawingNo: 'Drawing no.', revision: 'Revision', title: 'Title', scale: 'Scale', issuedBy: 'Issued by', discipline: 'Discipline',
  description: 'Item', hsn: 'HSN', quantity: 'Quantity', unit: 'Unit', rate: 'Rate', gstRate: 'GST', amount: 'Amount',
  nameOfWork: 'Name of work', clientName: 'Client', workOrderNo: 'Work order no.', workOrderDate: 'Work order date', agreementNo: 'Agreement no.', agreementDate: 'Agreement date',
  contractValue: 'Contract value', startDate: 'Start date', completionDate: 'Completion date', durationMonths: 'Time allowed', location: 'Location', itemNo: 'Item no.', section: 'Section',
};

/**
 * The reads of a long file's pages, three at a time, as one: each field from the first read that has it (a total from the
 * last), the lines in order with their pages counted across the whole file.
 */
function mergeReads(parts: DocReadResultDto[]): DocReadResultDto {
  if (parts.length === 1) return parts[0];
  const fields = { ...parts[0].fields };
  for (const p of parts.slice(1))
    for (const [k, f] of Object.entries(p.fields)) if (f.value !== null && (fields[k]?.value === null || fields[k] === undefined || k === 'total')) fields[k] = { ...f, page: f.page && f.page + parts.indexOf(p) * DOC_READ_MAX_PAGES };
  const lines = parts.flatMap((p, i) => p.lines.map((l) => Object.fromEntries(Object.entries(l).map(([k, f]) => [k, { ...f, page: f.page && f.page + i * DOC_READ_MAX_PAGES }]))));
  return { ...parts[0], fields, lines, costInr: parts.reduce((s, p) => s + p.costInr, 0) };
}

/** Every read value with a box, keyed as forms refer to them: `invoiceNo`, or `line-0-rate` for a line's. */
export function readBoxes(result: DocReadResultDto): { key: string; label: string; field: DocReadField }[] {
  const out = Object.entries(result.fields).map(([k, f]) => ({ key: k, label: FIELD_LABELS[k] ?? k, field: f }));
  result.lines.forEach((l, i) => Object.entries(l).forEach(([k, f]) => out.push({ key: `line-${i}-${k}`, label: `Line ${i + 1}: ${FIELD_LABELS[k] ?? k}`, field: f })));
  return out.filter((b) => b.field.value !== null && b.field.box && b.field.page);
}

/**
 * Picks a photo or PDF of an invoice, challan or drawing, turns it into page images in the browser, has it read and
 * hands back what was read for the form to fill. Shown only while Ask Nirmaan is on; nothing is saved here.
 */
export function ReadDocumentButton({ kind, purchaseOrderId, label, onRead, disabled }: { kind: DocReadKind; purchaseOrderId?: string; label: string; onRead: (s: ReadState) => void; disabled?: boolean }) {
  const { available } = useAsk();
  const { message } = App.useApp();
  const read = useReadDocument();
  const [preparing, setPreparing] = useState(false);
  // A long file is read three pages a call: which pages are being read, of how many.
  const [progress, setProgress] = useState<{ from: number; to: number; of: number } | null>(null);
  if (!available) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    let pages: PageImage[];
    try {
      pages = await pagesOf(file, DOC_READ_PAGES_OF[kind]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'That file could not be opened');
      return;
    } finally {
      setPreparing(false);
    }
    const parts: DocReadResultDto[] = [];
    try {
      for (let from = 0; from < pages.length; from += DOC_READ_MAX_PAGES) {
        const chunk = pages.slice(from, from + DOC_READ_MAX_PAGES);
        if (pages.length > DOC_READ_MAX_PAGES) setProgress({ from: from + 1, to: from + chunk.length, of: pages.length });
        parts.push(await read.mutateAsync({ kind, pages: chunk.map((p) => p.blob), purchaseOrderId }));
      }
    } catch (e) {
      // Pages already read are kept: a long BOQ that fails on page 10 still fills the first nine.
      if (!parts.length) {
        message.error(errorMessage(e, `The ${NOUN[kind]} could not be read`));
        return;
      }
      message.warning(`Pages after ${parts.length * DOC_READ_MAX_PAGES} could not be read: ${errorMessage(e)}`);
    } finally {
      setProgress(null);
    }
    onRead({ result: mergeReads(parts), pages: pages.slice(0, parts.length * DOC_READ_MAX_PAGES), file });
  };

  // The file input is made on each click, outside the form, so the form's own upload fields stay its only file inputs.
  const choose = () => {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = 'image/*,application/pdf';
    el.style.display = 'none';
    el.onchange = () => {
      void pick(el.files?.[0]);
      el.remove();
    };
    el.oncancel = () => el.remove();
    document.body.appendChild(el);
    el.click();
  };

  return (
    <Tooltip title={`Photo or PDF of the ${NOUN[kind]}; the form fills in and nothing is saved until you save it`}>
      <Button icon={<SparkleIcon />} onClick={choose} loading={preparing || read.isPending || !!progress} disabled={disabled}>
        {preparing ? 'Preparing pages…' : progress ? `Reading pages ${progress.from} to ${progress.to} of ${progress.of}…` : read.isPending ? `Reading the ${NOUN[kind]}…` : label}
      </Button>
    </Tooltip>
  );
}

/**
 * The pages read, with a box around each value that filled the form: amber where it needs checking, blue for the one
 * a field's "From the invoice" tag points at. With `pagesHidden` only the summary and its children show.
 */
export function ReadPreview({
  state,
  active,
  onClear,
  pagesHidden,
  kept,
  children,
}: {
  state: ReadState;
  active: string | null;
  onClear: () => void;
  pagesHidden?: boolean;
  /** The file's name once it is kept on the record, so nobody attaches it again */
  kept?: string | null;
  children?: React.ReactNode;
}) {
  const { token } = theme.useToken();
  const boxes = readBoxes(state.result);
  const activeBox = boxes.find((b) => b.key === active);
  const [pageNo, setPageNo] = useState(1);
  const shown = activeBox?.field.page ?? pageNo;
  const page = state.pages[shown - 1] ?? state.pages[0];
  const toCheck = boxes.filter((b) => b.field.confidence === 'low');
  const noun = NOUN[state.result.kind];

  return (
    <div className="doc-read-preview" style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, padding: 12, marginBottom: 16 }}>
      <Flex justify="space-between" align="flex-start" gap={12} wrap>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Typography.Text strong>
            <SparkleIcon /> Filled from {state.file.name}
          </Typography.Text>
          {/* A BOQ's rows are checked in the import's table, which says what each needs; a form's fields say it here. */}
          {state.result.kind === 'boq' ? null : (
            <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
              {toCheck.length
                ? `${toCheck.length} value${toCheck.length === 1 ? '' : 's'} to check, marked in amber: ${toCheck.map((b) => b.label.toLowerCase().replace(/\.$/, '')).join(', ')}.`
                : `Check the values against the ${noun} before saving.`}{' '}
              Point at a field&apos;s &ldquo;From the {noun}&rdquo; to see where it was read. Nothing is saved until you save.
              {kept ? ` ${kept} is attached below, so there is no need to pick it again.` : ''}
            </div>
          )}
          {children}
        </div>
        <Flex gap={8} align="center">
          {pagesHidden ? null : state.pages.length > 4 ? (
            <Pagination simple size="small" current={shown} total={state.pages.length} pageSize={1} onChange={setPageNo} aria-label="Page" />
          ) : state.pages.length > 1 ? (
            <Segmented size="small" value={shown} onChange={(v) => setPageNo(Number(v))} options={state.pages.map((_, i) => ({ value: i + 1, label: `Page ${i + 1}` }))} aria-label="Page" />
          ) : null}
          {pagesHidden ? null : (
            <Button size="small" type="link" onClick={onClear}>
              Hide
            </Button>
          )}
        </Flex>
      </Flex>
      {pagesHidden ? null : (
        <div style={{ maxHeight: 420, overflow: 'auto', marginTop: 8, background: token.colorFillQuaternary, borderRadius: token.borderRadius }}>
          <div style={{ position: 'relative', width: '100%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
            <img src={page.url} alt={`Page ${shown} of the ${noun}`} style={{ width: '100%', display: 'block' }} />
            {boxes
              .filter((b) => b.field.page === shown)
              .map((b) => {
                const [l, t, r, btm] = b.field.box!;
                const on = b.key === active;
                const color = on ? token.colorPrimary : b.field.confidence === 'low' ? token.colorWarning : token.colorSuccess;
                return (
                  <div
                    key={b.key}
                    aria-hidden
                    title={b.label}
                    data-read-box={b.key}
                    style={{
                      position: 'absolute',
                      left: `${l / 10}%`,
                      top: `${t / 10}%`,
                      width: `${(r - l) / 10}%`,
                      height: `${(btm - t) / 10}%`,
                      border: `${on ? 3 : 1.5}px solid ${color}`,
                      background: on ? `${token.colorPrimary}22` : undefined,
                      borderRadius: 2,
                      pointerEvents: 'none',
                    }}
                  />
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Props for the Form.Item a read value went into: low confidence shows as a warning with why; any read value says it
 * came from the document, and pointing at that shows its box.
 */
export function readFieldProps(state: ReadState | null, key: string, setActive: (k: string | null) => void, problem?: string | null): Partial<FormItemProps> {
  if (!state) return {};
  const m = key.match(/^line-(\d+)-(.+)$/);
  const field = m ? state.result.lines[Number(m[1])]?.[m[2]] : state.result.fields[key];
  if (!field || (field.value === null && !problem)) return {};
  const tag = <ReadSource kind={state.result.kind} page={field.page} onActive={(on) => setActive(on ? key : null)} />;
  // A value the form would not take (a date in the future, finding 13 of the October review) is amber with its reason,
  // however sure the model was.
  return problem || field.confidence === 'low'
    ? { validateStatus: 'warning', help: <span>Check this: {problem ?? field.reason ?? 'hard to read'}. {tag}</span> }
    : { extra: tag };
}

/**
 * Why a date read off a document was not filled in, in words for the amber line under the field, or null when it was
 * taken (finding 13 of the October review).
 */
export function readDateReason(value: string | null | undefined): string | null {
  const problem = readDateProblem(value, dayjs().format('YYYY-MM-DD'));
  if (!problem || !value) return null;
  if (problem === 'unreadable') return `“${value}” is not a date`;
  return problem === 'future' ? `the date read, ${formatDate(value)}, is still to come` : `the date read, ${formatDate(value)}, is over a year old`;
}

/**
 * Keeps the read file on the record (finding 13 of the October review): the scan the model read is uploaded and added
 * to the form's own attachment field, so nobody picks the same file twice. `kept` is its name once it is on the form.
 */
export function useKeepReadFile(form: FormInstance, field: string | (string | number)[]) {
  const { message } = App.useApp();
  const [kept, setKept] = useState<string | null>(null);
  const keep = (s: ReadState) => {
    uploadFile(s.file)
      .then((att) => {
        form.setFieldValue(field, [...((form.getFieldValue(field) as AttachmentDto[] | undefined) ?? []), att]);
        setKept(s.file.name);
      })
      .catch((e) => {
        setKept(null);
        message.warning(`The form is filled, but the ${NOUN[s.result.kind]} could not be attached: ${errorMessage(e)}`);
      });
  };
  return { keep, kept, forgetKept: () => setKept(null) };
}

/** "From the invoice, page 1": pointing at it or focusing it shows the value's box in the preview. */
export function ReadSource({ kind, page, onActive }: { kind: DocReadKind; page: number | null; onActive: (on: boolean) => void }) {
  return (
    <Button
      type="link"
      size="small"
      icon={<SparkleIcon />}
      style={{ padding: 0, fontSize: themeFontSize('fontSizeSM') }}
      onMouseEnter={() => onActive(true)}
      onMouseLeave={() => onActive(false)}
      onFocus={() => onActive(true)}
      onBlur={() => onActive(false)}
      onClick={() => {
        onActive(true);
        document.querySelector('.doc-read-preview')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }}
    >
      From the {NOUN[kind]}
      {page ? `, page ${page}` : ''}
    </Button>
  );
}
