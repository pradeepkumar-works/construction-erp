import { Prisma } from '@prisma/client';
import { TALLY_VOUCHER_TYPES, type TallyVoucherKind } from '@erp/shared';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

/** One line of a voucher: a debit or a credit to a ledger. */
export interface Line {
  ledgerKey: string;
  ledger: string;
  /** Positive = debit, negative = credit */
  amount: Prisma.Decimal;
  /** A party ledger: carries the bill reference */
  party?: boolean;
  /** An income or expense line: carries the project as cost centre */
  costCentre?: boolean;
}

export interface Voucher {
  kind: TallyVoucherKind;
  sourceId: string;
  date: Date;
  number: string;
  /** Supplier invoice, UTR or cheque */
  reference: string | null;
  party: string;
  projectCode: string;
  projectName: string;
  narration: string;
  /** Bill-wise reference on the party line: a new bill, or a payment against one */
  billRef: { name: string; type: 'New Ref' | 'Agst Ref' } | null;
  lines: Line[];
}

/** Resolves a ledger key to the Tally ledger name (the override, else the default). */
export type LedgerName = (key: string, fallback?: string) => string;

/** Builds the lines of a voucher, dropping zero amounts. */
export class Lines {
  readonly lines: Line[] = [];
  constructor(private name: LedgerName) {}
  dr(key: string, amount: Prisma.Decimal.Value, opts: { fallback?: string; party?: boolean; costCentre?: boolean } = {}) {
    return this.add(key, D(amount), opts);
  }
  cr(key: string, amount: Prisma.Decimal.Value, opts: { fallback?: string; party?: boolean; costCentre?: boolean } = {}) {
    return this.add(key, D(amount).neg(), opts);
  }
  private add(key: string, amount: Prisma.Decimal, opts: { fallback?: string; party?: boolean; costCentre?: boolean }) {
    if (amount.isZero()) return this;
    this.lines.push({ ledgerKey: key, ledger: this.name(key, opts.fallback), amount, party: opts.party, costCentre: opts.costCentre });
    return this;
  }
}

export const debits = (lines: Line[]) => lines.reduce((s, l) => (l.amount.gt(0) ? s.add(l.amount) : s), ZERO);
export const credits = (lines: Line[]) => lines.reduce((s, l) => (l.amount.lt(0) ? s.sub(l.amount) : s), ZERO);
/** Debits equal credits to the paisa (Tally refuses anything else). */
export const balanced = (lines: Line[]) => lines.length >= 2 && debits(lines).eq(credits(lines));

/** GST split: half CGST and half SGST within the state (the odd paisa to SGST), else all IGST. */
export function gstLines(l: Lines, side: 'dr' | 'cr', prefix: 'INPUT' | 'OUTPUT', gst: Prisma.Decimal, interState: boolean) {
  if (gst.isZero()) return;
  const put = (key: string, v: Prisma.Decimal) => (side === 'dr' ? l.dr(key, v) : l.cr(key, v));
  if (interState) return put(`${prefix}_IGST`, gst);
  const cgst = gst.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  put(`${prefix}_CGST`, cgst);
  put(`${prefix}_SGST`, gst.sub(cgst));
}

/** Inter-state only when both GST state codes are known and differ. */
export const isInterState = (ours: string | null | undefined, theirs: string | null | undefined) => !!ours && !!theirs && ours !== theirs;

/** The ledger for money in or out: cash, else the bank (bank transfer, UPI, card). */
export const moneyLedger = (mode: string) => (mode === 'CASH' ? 'CASH' : 'BANK');

// ----- XML -----

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
/** Tally keeps debits negative and credits positive in AMOUNT, with ISDEEMEDPOSITIVE Yes on debits. */
const amt = (v: Prisma.Decimal) => v.neg().toFixed(2);
const tallyDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
export const costCentreName = (code: string, name: string) => `${code} - ${name}`.slice(0, 120);

function envelope(report: 'Vouchers' | 'All Masters', company: string | null, messages: string[]) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ENVELOPE>',
    ' <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>',
    ' <BODY>',
    '  <IMPORTDATA>',
    '   <REQUESTDESC>',
    `    <REPORTNAME>${report}</REPORTNAME>`,
    company ? `    <STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` : null,
    '   </REQUESTDESC>',
    '   <REQUESTDATA>',
    ...messages.map((m) => `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n${m}\n    </TALLYMESSAGE>`),
    '   </REQUESTDATA>',
    '  </IMPORTDATA>',
    ' </BODY>',
    '</ENVELOPE>',
    '',
  ]
    .filter((x) => x !== null)
    .join('\n');
}

function voucherXml(v: Voucher, costCentres: boolean): string {
  const type = TALLY_VOUCHER_TYPES[v.kind];
  const cc = costCentreName(v.projectCode, v.projectName);
  const entries = v.lines.map((l) => {
    const debit = l.amount.gt(0);
    const a = amt(l.amount);
    return [
      '       <ALLLEDGERENTRIES.LIST>',
      `        <LEDGERNAME>${esc(l.ledger)}</LEDGERNAME>`,
      `        <ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`,
      `        <ISPARTYLEDGER>${l.party ? 'Yes' : 'No'}</ISPARTYLEDGER>`,
      `        <AMOUNT>${a}</AMOUNT>`,
      l.party && v.billRef
        ? `        <BILLALLOCATIONS.LIST><NAME>${esc(v.billRef.name)}</NAME><BILLTYPE>${v.billRef.type}</BILLTYPE><AMOUNT>${a}</AMOUNT></BILLALLOCATIONS.LIST>`
        : null,
      l.costCentre && costCentres
        ? `        <CATEGORYALLOCATIONS.LIST><CATEGORY>Primary Cost Category</CATEGORY><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><COSTCENTREALLOCATIONS.LIST><NAME>${esc(cc)}</NAME><AMOUNT>${a}</AMOUNT></COSTCENTREALLOCATIONS.LIST></CATEGORYALLOCATIONS.LIST>`
        : null,
      '       </ALLLEDGERENTRIES.LIST>',
    ]
      .filter((x) => x !== null)
      .join('\n');
  });
  return [
    `     <VOUCHER REMOTEID="nirmaan-${v.kind.toLowerCase()}-${v.sourceId}" VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `      <DATE>${tallyDate(v.date)}</DATE>`,
    `      <VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>`,
    `      <VOUCHERNUMBER>${esc(v.number)}</VOUCHERNUMBER>`,
    v.reference ? `      <REFERENCE>${esc(v.reference)}</REFERENCE>` : null,
    `      <PARTYLEDGERNAME>${esc(v.lines.find((l) => l.party)?.ledger ?? v.party)}</PARTYLEDGERNAME>`,
    `      <NARRATION>${esc(v.narration)}</NARRATION>`,
    '      <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>',
    '      <ISINVOICE>No</ISINVOICE>',
    ...entries,
    '     </VOUCHER>',
  ]
    .filter((x) => x !== null)
    .join('\n');
}

/** TallyPrime "Import Data" XML of vouchers. */
export const vouchersXml = (vouchers: Voucher[], company: string | null, costCentres: boolean) =>
  envelope(
    'Vouchers',
    company,
    vouchers.map((v) => voucherXml(v, costCentres)),
  );

export interface LedgerMaster {
  name: string;
  group: string;
  billWise?: boolean;
  costCentres?: boolean;
  gstHead?: 'Central Tax' | 'State Tax' | 'Integrated Tax';
  gstin?: string | null;
}

/** TallyPrime "Import Data" XML of the ledgers (and project cost centres) the vouchers use. */
export function mastersXml(ledgers: LedgerMaster[], costCentreNames: string[], company: string | null) {
  const ledgerMsgs = ledgers.map((l) =>
    [
      `     <LEDGER NAME="${esc(l.name)}" ACTION="Create">`,
      `      <NAME.LIST><NAME>${esc(l.name)}</NAME></NAME.LIST>`,
      `      <PARENT>${esc(l.group)}</PARENT>`,
      `      <ISBILLWISEON>${l.billWise ? 'Yes' : 'No'}</ISBILLWISEON>`,
      `      <ISCOSTCENTRESON>${l.costCentres ? 'Yes' : 'No'}</ISCOSTCENTRESON>`,
      l.gstHead ? `      <TAXTYPE>GST</TAXTYPE>\n      <GSTDUTYHEAD>${l.gstHead}</GSTDUTYHEAD>` : null,
      l.gstin ? `      <PARTYGSTIN>${esc(l.gstin)}</PARTYGSTIN>` : null,
      '     </LEDGER>',
    ]
      .filter((x) => x !== null)
      .join('\n'),
  );
  const ccMsgs = costCentreNames.map((n) =>
    [`     <COSTCENTRE NAME="${esc(n)}" ACTION="Create">`, `      <NAME.LIST><NAME>${esc(n)}</NAME></NAME.LIST>`, '      <CATEGORY>Primary Cost Category</CATEGORY>', '     </COSTCENTRE>'].join('\n'),
  );
  return envelope('All Masters', company, [...ledgerMsgs, ...ccMsgs]);
}
