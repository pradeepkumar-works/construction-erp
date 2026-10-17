'use client';

import React, { useState } from 'react';
import { App, Button, Flex, Segmented, Tooltip, Typography, theme } from 'antd';
import type { FormItemProps } from 'antd';
import type { DocReadField, DocReadKind, DocReadResultDto } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAsk } from '@/lib/ask';
import { pagesOf, type PageImage } from '@/lib/doc-pages';
import { useReadDocument } from '@/lib/queries';
import { SparkleIcon } from './SparkleIcon';

/** A document read to fill a form (AI item 70): what came back, the pages it came from and the file picked. */
export interface ReadState {
  result: DocReadResultDto;
  pages: PageImage[];
  file: File;
}

const NOUN: Record<DocReadKind, string> = { invoice: 'invoice', challan: 'challan', drawing: 'drawing' };

const FIELD_LABELS: Record<string, string> = {
  vendorName: 'Vendor', supplierName: 'Supplier', gstin: 'GSTIN', invoiceNo: 'Invoice no.', invoiceDate: 'Invoice date', poNo: 'PO no.', subtotal: 'Taxable value',
  cgst: 'CGST', sgst: 'SGST', igst: 'IGST', freight: 'Freight', total: 'Invoice total', challanNo: 'Challan no.', date: 'Date', vehicleNo: 'Vehicle no.',
  drawingNo: 'Drawing no.', revision: 'Revision', title: 'Title', scale: 'Scale', issuedBy: 'Issued by', discipline: 'Discipline',
  description: 'Item', hsn: 'HSN', quantity: 'Quantity', unit: 'Unit', rate: 'Rate', gstRate: 'GST', amount: 'Amount',
};

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
  if (!available) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    let pages: PageImage[];
    try {
      pages = await pagesOf(file);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'That file could not be opened');
      return;
    } finally {
      setPreparing(false);
    }
    read.mutate(
      { kind, pages: pages.map((p) => p.blob), purchaseOrderId },
      {
        onSuccess: (result) => onRead({ result, pages, file }),
        onError: (e) => message.error(errorMessage(e, `The ${NOUN[kind]} could not be read`)),
      },
    );
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
      <Button icon={<SparkleIcon />} onClick={choose} loading={preparing || read.isPending} disabled={disabled}>
        {preparing ? 'Preparing pages…' : read.isPending ? `Reading the ${NOUN[kind]}…` : label}
      </Button>
    </Tooltip>
  );
}

/**
 * The pages read, with a box around each value that filled the form: amber where it needs checking, blue for the one
 * a field's "From the invoice" tag points at.
 */
export function ReadPreview({ state, active, onClear, children }: { state: ReadState; active: string | null; onClear: () => void; children?: React.ReactNode }) {
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
          <div className="text-muted" style={{ fontSize: 12 }}>
            {toCheck.length
              ? `${toCheck.length} value${toCheck.length === 1 ? '' : 's'} to check, marked in amber: ${toCheck.map((b) => b.label.toLowerCase()).join(', ')}.`
              : `Check the values against the ${noun} before saving.`}{' '}
            Point at a field&apos;s &ldquo;From the {noun}&rdquo; to see where it was read. Nothing is saved until you save.
          </div>
          {children}
        </div>
        <Flex gap={8} align="center">
          {state.pages.length > 1 ? (
            <Segmented size="small" value={shown} onChange={(v) => setPageNo(Number(v))} options={state.pages.map((_, i) => ({ value: i + 1, label: `Page ${i + 1}` }))} aria-label="Page" />
          ) : null}
          <Button size="small" type="link" onClick={onClear}>
            Hide
          </Button>
        </Flex>
      </Flex>
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
    </div>
  );
}

/**
 * Props for the Form.Item a read value went into: low confidence shows as a warning with why; any read value says it
 * came from the document, and pointing at that shows its box.
 */
export function readFieldProps(state: ReadState | null, key: string, setActive: (k: string | null) => void): Partial<FormItemProps> {
  if (!state) return {};
  const m = key.match(/^line-(\d+)-(.+)$/);
  const field = m ? state.result.lines[Number(m[1])]?.[m[2]] : state.result.fields[key];
  if (!field || field.value === null) return {};
  const tag = <ReadSource kind={state.result.kind} page={field.page} onActive={(on) => setActive(on ? key : null)} />;
  return field.confidence === 'low'
    ? { validateStatus: 'warning', help: <span>Check this: {field.reason ?? 'hard to read'}. {tag}</span> }
    : { extra: tag };
}

/** "From the invoice, page 1": pointing at it or focusing it shows the value's box in the preview. */
export function ReadSource({ kind, page, onActive }: { kind: DocReadKind; page: number | null; onActive: (on: boolean) => void }) {
  return (
    <Button
      type="link"
      size="small"
      icon={<SparkleIcon />}
      style={{ padding: 0, height: 'auto', fontSize: 12 }}
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
