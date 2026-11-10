/**
 * E-invoices and e-way bills, with no database and no network: NIC's INV-01 JSON for an intra-state RA bill and an
 * inter-state ready-mix bill against golden copies, a bill to an unregistered client left out, the QR's claims, the
 * e-way bill JSON for a stock transfer and its validity, the payload hash that makes a request once, the readers of the
 * IRP's answers (its duplicate answer taken as made), and the windows to cancel and extend. CI runs it after the build:
 *
 *   node dist/scripts/einvoice-test.js
 */
import assert from 'node:assert/strict';
import {
  cancelWindowProblem,
  einvoiceNeeded,
  einvoicePayload,
  einvoiceProblems,
  ewayExtendProblem,
  ewayNeeded,
  ewayPayload,
  ewayProblems,
  ewayTransportProblems,
  ewayValidUntil,
  hsnProblem,
  qrText,
  readGstAddress,
  readGstDateTime,
  splitGst,
  type EinvoiceSource,
  type EwaySource,
  type GstParty,
} from '@erp/shared';
import { canonicalJson, ewbDateTime, fakeAckNo, fakeEwbNo, financialYear, irnOf, payloadHash, readEwbAnswer, readGspConfig, readGspCredential, readIrnAnswer, readIrnCancel, readQrClaims } from '../gst/einvoice-rules';
import { FakeGstProvider } from '../gst/providers/fake-gst.provider';

const cases: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => cases.push([name, fn]);

const company: GstParty = { gstin: '21AABCS1234F1Z5', legalName: 'Sai Ram Constructions Pvt Ltd', address: 'Plot 12, Saheed Nagar, Bhubaneswar, Odisha 751007', who: 'the company', fixAt: 'on Company settings' };
const roads: GstParty = { gstin: '21AAAGR0123K1ZQ', legalName: 'Roads Division, Khordha', address: 'Office of the Executive Engineer, Roads Division, Khordha 752055', who: 'Roads Division, Khordha', fixAt: 'in Clients' };
const kolkata: GstParty = { gstin: '19AABCU9603R1ZX', legalName: 'Urban Infra Kolkata', address: '12 Park Street, Kolkata 700016', who: 'Urban Infra Kolkata', fixAt: 'in Clients' };

/** RA bill 3: work 10,00,000.00 and price variation 2,500.50, GST 18% as the bill stored it (1,80,450.09), within Odisha. */
const raBill: EinvoiceSource = {
  docNo: 'RA/NH55/3',
  docDate: '2026-10-14',
  seller: company,
  buyer: roads,
  placeOfSupply: '21',
  lines: [{ description: 'Works contract: RA bill 3, NH55 widening', hsn: '995421', isService: true, quantity: null, unit: null, unitPrice: null, taxable: '1002500.50', gstRate: '18' }],
  igst: '0.00',
  cgst: '90225.04',
  sgst: '90225.05',
  hsnFixAt: 'on Company settings',
};

const RA_GOLDEN = {
  Version: '1.1',
  TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
  DocDtls: { Typ: 'INV', No: 'RA/NH55/3', Dt: '14/10/2026' },
  SellerDtls: { Gstin: '21AABCS1234F1Z5', LglNm: 'Sai Ram Constructions Pvt Ltd', Addr1: 'Plot 12, Saheed Nagar', Loc: 'Bhubaneswar', Pin: 751007, Stcd: '21' },
  BuyerDtls: { Gstin: '21AAAGR0123K1ZQ', LglNm: 'Roads Division, Khordha', Addr1: 'Office of the Executive Engineer, Roads Division', Loc: 'Khordha', Pin: 752055, Stcd: '21', Pos: '21' },
  ItemList: [
    {
      SlNo: '1',
      PrdDesc: 'Works contract: RA bill 3, NH55 widening',
      IsServc: 'Y',
      HsnCd: '995421',
      Qty: 1,
      Unit: 'OTH',
      UnitPrice: 1002500.5,
      TotAmt: 1002500.5,
      Discount: 0,
      AssAmt: 1002500.5,
      GstRt: 18,
      IgstAmt: 0,
      CgstAmt: 90225.04,
      SgstAmt: 90225.05,
      TotItemVal: 1182950.59,
    },
  ],
  ValDtls: { AssVal: 1002500.5, CgstVal: 90225.04, SgstVal: 90225.05, IgstVal: 0, RndOffAmt: 0, TotInvVal: 1182950.59 },
};

/** A ready-mix bill to Kolkata: 7.5 m³ at ₹4,850 and pumping ₹2,625, IGST 18% as the invoice stored it. */
const rmcBill: EinvoiceSource = {
  docNo: 'RINV-2026-0007',
  docDate: '2026-11-09',
  seller: company,
  buyer: kolkata,
  placeOfSupply: '19',
  lines: [
    { description: 'Ready-mix concrete, M25', hsn: '38245010', isService: false, quantity: '7.500', unit: 'cum', unitPrice: '4850.00', taxable: '36375.00', gstRate: '18' },
    { description: 'Pumping the concrete', hsn: '995421', isService: true, quantity: null, unit: null, unitPrice: null, taxable: '2625.00', gstRate: '18' },
  ],
  igst: '7020.00',
  cgst: '0.00',
  sgst: '0.00',
  hsnFixAt: 'on Company settings',
};

const RMC_GOLDEN = {
  Version: '1.1',
  TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
  DocDtls: { Typ: 'INV', No: 'RINV-2026-0007', Dt: '09/11/2026' },
  SellerDtls: { Gstin: '21AABCS1234F1Z5', LglNm: 'Sai Ram Constructions Pvt Ltd', Addr1: 'Plot 12, Saheed Nagar', Loc: 'Bhubaneswar', Pin: 751007, Stcd: '21' },
  BuyerDtls: { Gstin: '19AABCU9603R1ZX', LglNm: 'Urban Infra Kolkata', Addr1: '12 Park Street', Loc: 'Kolkata', Pin: 700016, Stcd: '19', Pos: '19' },
  ItemList: [
    { SlNo: '1', PrdDesc: 'Ready-mix concrete, M25', IsServc: 'N', HsnCd: '38245010', Qty: 7.5, Unit: 'CBM', UnitPrice: 4850, TotAmt: 36375, Discount: 0, AssAmt: 36375, GstRt: 18, IgstAmt: 6547.5, CgstAmt: 0, SgstAmt: 0, TotItemVal: 42922.5 },
    { SlNo: '2', PrdDesc: 'Pumping the concrete', IsServc: 'Y', HsnCd: '995421', Qty: 1, Unit: 'OTH', UnitPrice: 2625, TotAmt: 2625, Discount: 0, AssAmt: 2625, GstRt: 18, IgstAmt: 472.5, CgstAmt: 0, SgstAmt: 0, TotItemVal: 3097.5 },
  ],
  ValDtls: { AssVal: 39000, CgstVal: 0, SgstVal: 0, IgstVal: 7020, RndOffAmt: 0, TotInvVal: 46020 },
};

test('an intra-state RA bill is INV-01 v1.1 with CGST and SGST as the bill stored them', () => {
  assert.deepEqual(einvoiceProblems(raBill), []);
  assert.deepEqual(einvoicePayload(raBill), RA_GOLDEN);
});

test('an inter-state ready-mix bill reports IGST on each line, concrete in cubic metres under its HSN', () => {
  assert.deepEqual(einvoiceProblems(rmcBill), []);
  assert.deepEqual(einvoicePayload(rmcBill), RMC_GOLDEN);
});

test("lines' taxes are allocated so they add up to the totals the bill stored, the last line taking the paisa left", () => {
  const tiny: EinvoiceSource = { ...raBill, lines: [0, 1, 2].map((i) => ({ ...raBill.lines[0], description: `Line ${i}`, taxable: '0.05' })), igst: '0.00', cgst: '0.01', sgst: '0.02' };
  const p = einvoicePayload(tiny);
  assert.deepEqual(p.ItemList.map((l) => [l.CgstAmt, l.SgstAmt]), [[0, 0.01], [0, 0.01], [0.01, 0]]);
  assert.equal(p.ValDtls.CgstVal, 0.01);
  assert.equal(p.ValDtls.SgstVal, 0.02);
  assert.deepEqual(splitGst(18045009, false), { igst: 0, cgst: 9022504, sgst: 9022505 });
});

test('a bill to an unregistered client is left out, and so is one from a company not under e-invoicing', () => {
  const b2c = einvoiceNeeded({ buyerGstin: null, docDate: '2026-10-14', einvoiceFrom: '2026-04-01' });
  assert.equal(b2c.needed, false);
  assert.match(b2c.reason, /no GSTIN/);
  assert.equal(einvoiceNeeded({ buyerGstin: roads.gstin, docDate: '2026-10-14', einvoiceFrom: null }).needed, false);
  assert.equal(einvoiceNeeded({ buyerGstin: roads.gstin, docDate: '2026-03-31', einvoiceFrom: '2026-04-01' }).needed, false);
  assert.equal(einvoiceNeeded({ buyerGstin: roads.gstin, docDate: '2026-04-01', einvoiceFrom: '2026-04-01' }).needed, true);
});

test('the record says what to fill: the SAC, its six digits, the PIN code, and a split that disagrees with the place of supply', () => {
  const none = einvoiceProblems({ ...raBill, lines: [{ ...raBill.lines[0], hsn: null }] });
  assert.deepEqual(none, ['Set the SAC code of "Works contract: RA bill 3, NH55 widening" on Company settings']);
  assert.match(einvoiceProblems({ ...raBill, lines: [{ ...raBill.lines[0], hsn: '9954' }] })[0], /needs 6 or 8 digits/);
  assert.deepEqual(einvoiceProblems({ ...raBill, buyer: { ...roads, address: 'Roads Division, Khordha' } }), ['Add the PIN code to the address of Roads Division, Khordha in Clients']);
  assert.match(einvoiceProblems({ ...raBill, igst: '180450.09', cgst: '0', sgst: '0' })[0], /charges IGST but is supplied within Odisha/);
  assert.match(einvoiceProblems({ ...raBill, docNo: '0RA/1' })[0], /not one GST takes/);
  assert.equal(hsnProblem('99542'), 'An HSN or SAC code is 4, 6 or 8 digits');
  assert.equal(hsnProblem('995421'), null);
});

test('an address is read into lines, place and PIN, the state name left out', () => {
  assert.deepEqual(readGstAddress('Plot 12, Saheed Nagar, Bhubaneswar, Odisha 751007'), { addr1: 'Plot 12, Saheed Nagar', addr2: null, place: 'Bhubaneswar', pin: 751007 });
  assert.deepEqual(readGstAddress('NH55 camp\nKhordha - 752 055'), { addr1: 'NH55 camp', addr2: null, place: 'Khordha', pin: 752055 });
  assert.equal(readGstAddress('Saheed Nagar, Bhubaneswar'), null);
});

test("the QR carries NIC's claims: both GSTINs, number, type, date, value, line count, main HSN, the IRN and its date", () => {
  const p = einvoicePayload(rmcBill);
  const at = new Date('2026-11-10T08:35:00Z');
  assert.deepEqual(JSON.parse(qrText(p, 'abc', at)), {
    SellerGstin: '21AABCS1234F1Z5',
    BuyerGstin: '19AABCU9603R1ZX',
    DocNo: 'RINV-2026-0007',
    DocTyp: 'INV',
    DocDt: '09/11/2026',
    TotInvVal: 46020,
    ItemCnt: 2,
    MainHsnCode: '38245010',
    Irn: 'abc',
    IrnDt: '2026-11-10 14:05:00',
  });
});

test('the same payload hashes the same whatever the order of its keys, and a moved figure changes the hash', () => {
  const p = einvoicePayload(raBill);
  const shuffled = JSON.parse(JSON.stringify({ ValDtls: p.ValDtls, ItemList: p.ItemList, DocDtls: p.DocDtls, Version: p.Version, TranDtls: p.TranDtls, BuyerDtls: p.BuyerDtls, SellerDtls: p.SellerDtls }));
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
  assert.equal(payloadHash(p), payloadHash(shuffled));
  assert.equal(payloadHash(p), payloadHash(einvoicePayload(raBill)));
  assert.notEqual(payloadHash(p), payloadHash(einvoicePayload({ ...raBill, lines: [{ ...raBill.lines[0], taxable: '1002500.51' }] })));
});

test('the fake makes the IRN as the IRP does, the same for the same invoice, with a 15 digit ack and an unsigned QR', async () => {
  assert.equal(financialYear('14/10/2026'), '2026-27');
  assert.equal(financialYear('15/03/2027'), '2026-27');
  const p = einvoicePayload(raBill);
  const fake = new FakeGstProvider(() => new Date('2026-11-10T08:35:00.400Z'));
  const a = await fake.generateIrn({ organizationId: 'o', gstin: company.gstin! }, p);
  const b = await fake.generateIrn({ organizationId: 'o', gstin: company.gstin! }, p);
  assert.ok(a.ok && b.ok);
  assert.match(a.value.irn, /^[0-9a-f]{64}$/);
  assert.equal(a.value.irn, b.value.irn);
  assert.equal(a.value.irn, irnOf(p));
  assert.notEqual(irnOf(einvoicePayload({ ...raBill, docNo: 'RA/NH55/4' })), a.value.irn);
  assert.match(a.value.ackNo, /^[1-9][0-9]{14}$/);
  assert.equal(a.value.ackNo, fakeAckNo(a.value.irn));
  assert.equal(a.value.ackAt.toISOString(), '2026-11-10T08:35:00.000Z');
  assert.deepEqual(readQrClaims(a.value.signedQr!), JSON.parse(qrText(p, a.value.irn, a.value.ackAt)));
  assert.match(fakeEwbNo(payloadHash(p)), /^[1-9][0-9]{11}$/);
});

test("the IRP's answer is read: Data as a string, the duplicate answer (2150) taken as made, and an error in words", () => {
  const ok = readIrnAnswer({ Status: 1, Data: JSON.stringify({ AckNo: 112010000000001, AckDt: '2026-11-10 14:05:00', Irn: 'f'.repeat(64), SignedQRCode: 'a.b.c' }) });
  assert.deepEqual(ok, { ok: true, value: { irn: 'f'.repeat(64), ackNo: '112010000000001', ackAt: new Date('2026-11-10T08:35:00Z'), signedQr: 'a.b.c', duplicate: false } });
  const dup = readIrnAnswer({ Status: 0, ErrorDetails: [{ ErrorCode: '2150', ErrorMessage: 'Duplicate IRN' }], InfoDtls: [{ InfCd: 'DUPIRN', Desc: { AckNo: 112010000000001, AckDt: '2026-11-10 14:05:00', Irn: 'e'.repeat(64) } }] });
  assert.ok(dup.ok && dup.value.duplicate && dup.value.irn === 'e'.repeat(64) && dup.value.ackNo === '112010000000001');
  assert.deepEqual(readIrnAnswer({ Status: 0, ErrorDetails: [{ ErrorCode: '2211', ErrorMessage: 'Invalid HSN code' }] }), { ok: false, error: '2211: Invalid HSN code' });
  assert.deepEqual(readIrnCancel({ Status: 1, Data: { Irn: 'x', CancelDate: '2026-11-10 15:00:00' } }), { ok: true, value: { cancelledAt: new Date('2026-11-10T09:30:00Z') } });
  assert.equal(readGstDateTime('10/11/2026 02:05:00 PM')?.toISOString(), '2026-11-10T08:35:00.000Z');
  assert.equal(ewbDateTime(new Date('2026-11-10T08:35:00Z')), '10/11/2026 02:05:00 PM');
  assert.deepEqual(readEwbAnswer({ status: '1', data: { ewayBillNo: 331000123456, ewayBillDate: '10/11/2026 02:05:00 PM', validUpto: '11/11/2026 11:59:00 PM' } }), {
    ok: true,
    value: { ewbNo: '331000123456', madeAt: new Date('2026-11-10T08:35:00Z'), validUntil: new Date('2026-11-11T18:29:00Z') },
  });
});

const transfer: EwaySource = {
  purpose: 'OWN_USE',
  docNo: 'TRO-2026-0042',
  docDate: '2026-11-10',
  from: company,
  to: company,
  dispatchFrom: { ...company, address: 'Central store, Rasulgarh, Bhubaneswar 751010', who: 'the project Central store', fixAt: "in the project's details" },
  shipTo: { ...company, address: 'NH55 camp, Khordha 752055', who: 'the project NH55', fixAt: "in the project's details" },
  lines: [
    { name: 'Cement OPC 53', hsn: '25232930', quantity: '100.000', unit: 'bag', taxable: '38000.00', gstRate: '0' },
    { name: 'TMT bar Fe550D', hsn: '72142090', quantity: '2.500', unit: 'MT', taxable: '145000.00', gstRate: '0' },
  ],
  igst: '0.00',
  cgst: '0.00',
  sgst: '0.00',
  hsnFixAt: 'in Items',
};

test('a stock transfer travels as own use on a delivery challan, at its value, with the vehicle and distance', () => {
  const t = { mode: '1' as const, vehicleNo: 'od 02 ab-1234', vehicleType: 'R' as const, distanceKm: 42 };
  assert.deepEqual(ewayProblems(transfer), []);
  assert.deepEqual(ewayTransportProblems(t), []);
  assert.equal(ewayNeeded('183000.00').needed, true);
  assert.equal(ewayNeeded('50000.00').needed, false);
  assert.deepEqual(ewayPayload(transfer, t), {
    supplyType: 'O',
    subSupplyType: '5',
    subSupplyDesc: '',
    docType: 'CHL',
    docNo: 'TRO-2026-0042',
    docDate: '10/11/2026',
    fromGstin: '21AABCS1234F1Z5',
    fromTrdName: 'Sai Ram Constructions Pvt Ltd',
    fromAddr1: 'Central store, Rasulgarh',
    fromAddr2: '',
    fromPlace: 'Bhubaneswar',
    fromPincode: 751010,
    actFromStateCode: 21,
    fromStateCode: 21,
    toGstin: '21AABCS1234F1Z5',
    toTrdName: 'Sai Ram Constructions Pvt Ltd',
    toAddr1: 'NH55 camp',
    toAddr2: '',
    toPlace: 'Khordha',
    toPincode: 752055,
    actToStateCode: 21,
    toStateCode: 21,
    transactionType: 1,
    otherValue: 0,
    totalValue: 183000,
    cgstValue: 0,
    sgstValue: 0,
    igstValue: 0,
    cessValue: 0,
    cessNonAdvolValue: 0,
    totInvValue: 183000,
    transMode: '1',
    transDistance: '42',
    transporterId: '',
    transporterName: '',
    transDocNo: '',
    transDocDate: '',
    vehicleNo: 'OD02AB1234',
    vehicleType: 'R',
    itemList: [
      { productName: 'Cement OPC 53', productDesc: 'Cement OPC 53', hsnCode: 25232930, quantity: 100, qtyUnit: 'BAG', cgstRate: 0, sgstRate: 0, igstRate: 0, cessRate: 0, cessNonadvol: 0, taxableAmount: 38000 },
      { productName: 'TMT bar Fe550D', productDesc: 'TMT bar Fe550D', hsnCode: 72142090, quantity: 2.5, qtyUnit: 'MTS', cgstRate: 0, sgstRate: 0, igstRate: 0, cessRate: 0, cessNonadvol: 0, taxableAmount: 145000 },
    ],
  });
});

test('the e-way bill form and record say what to fill: the vehicle, the distance, an HSN and a rate', () => {
  assert.deepEqual(ewayTransportProblems({ mode: '1', vehicleNo: '', vehicleType: 'R', distanceKm: 42 }), ['Type the vehicle number, for example OD02AB1234']);
  assert.deepEqual(ewayTransportProblems({ mode: '2', vehicleNo: null, vehicleType: 'R', distanceKm: null }), ['Type the distance by road in whole kilometres, 1 to 4000']);
  assert.match(ewayTransportProblems({ mode: '1', vehicleNo: 'truck 7', vehicleType: 'R', distanceKm: 10 })[0], /not a vehicle number/);
  const bare = { ...transfer, lines: [{ ...transfer.lines[0], hsn: null, taxable: '0' }] };
  assert.deepEqual(ewayProblems(bare), ['Set the HSN code of Cement OPC 53 in Items', 'Cement OPC 53 has no value: set its rate in Items']);
});

test('an e-way bill runs to midnight in India: a day for each 200 km, 20 km for over-dimensional cargo', () => {
  const made = new Date('2026-11-10T04:30:00Z');
  assert.equal(ewayValidUntil(made, 42, 'R').toISOString(), '2026-11-11T18:29:59.000Z');
  assert.equal(ewayValidUntil(made, 201, 'R').toISOString(), '2026-11-12T18:29:59.000Z');
  assert.equal(ewayValidUntil(made, 42, 'O').toISOString(), '2026-11-13T18:29:59.000Z');
  assert.equal(ewayValidUntil(new Date('2026-11-10T19:00:00Z'), 42, 'R').toISOString(), '2026-11-12T18:29:59.000Z');
});

test('cancel within 24 hours, else a credit note; extend from 8 hours before running out to 8 after', () => {
  const made = new Date('2026-11-10T08:35:00Z');
  assert.equal(cancelWindowProblem('IRN', made, new Date('2026-11-11T08:35:00Z')), null);
  assert.match(cancelWindowProblem('IRN', made, new Date('2026-11-11T08:36:00Z'))!, /raise a credit note/);
  assert.match(cancelWindowProblem('EWB', made, new Date('2026-11-12T00:00:00Z'))!, /runs out on its own/);
  const until = new Date('2026-11-11T18:29:59Z');
  assert.match(ewayExtendProblem(until, new Date('2026-11-11T10:00:00Z'))!, /only in the 8 hours before/);
  assert.equal(ewayExtendProblem(until, new Date('2026-11-11T12:00:00Z')), null);
  assert.equal(ewayExtendProblem(until, new Date('2026-11-12T02:29:59Z')), null);
  assert.match(ewayExtendProblem(until, new Date('2026-11-12T02:31:00Z'))!, /make a new one/);
});

test("a GSP connection takes https addresses on the internet, the GSTIN, user and client id, and its key as secret:password", () => {
  assert.equal(readGspConfig({ url: 'http://10.0.0.5/api', gstin: company.gstin, userName: 'u', clientId: 'c' }, true).config, null);
  assert.match(readGspConfig({ url: 'https://gsp.example.com', gstin: 'X', userName: 'u', clientId: 'c' }, true).problem!, /GSTIN/);
  assert.deepEqual(readGspConfig({ url: ' https://gsp.example.com ', gstin: company.gstin!.toLowerCase(), userName: 'api_sai', clientId: 'AAA' }, true), {
    config: { url: 'https://gsp.example.com', gstin: '21AABCS1234F1Z5', userName: 'api_sai', clientId: 'AAA' },
    problem: null,
  });
  assert.match(readGspConfig({ url: 'https://gsp.example.com', gstin: company.gstin, userName: 'u', clientId: 'c' }, false).problem!, /client secret:password/);
  assert.deepEqual(readGspCredential('s3cr:et:pa'), { clientSecret: 's3cr', password: 'et:pa' });
  assert.equal(readGspCredential('nocolon'), null);
});

void (async () => {
  let failed = 0;
  for (const [name, fn] of cases) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (e) {
      failed++;
      console.log(`✗ ${name}\n  ${(e as Error).message.split('\n').join('\n  ')}`);
    }
  }
  console.log(`\nE-invoices and e-way bills: ${cases.length - failed} of ${cases.length} tests pass`);
  process.exit(failed ? 1 : 0);
})();
