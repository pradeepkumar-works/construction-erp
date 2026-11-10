/**
 * TDS: every section's rate, the rate without a PAN and with a lower deduction certificate, the 194C, 194J, 194I and
 * 194Q thresholds over a year, quarters and due dates, the 234E late fee and 201(1A) interest, what blocks a return, the
 * totals by section and the return file's rows, all with golden numbers. CI runs it after the build:
 *
 *   node dist/scripts/tds-test.js
 */
import assert from 'node:assert/strict';
import {
  RETURN_CHALLAN_HEADER,
  RETURN_DEDUCTEE_HEADER_24Q,
  RETURN_DEDUCTEE_HEADER_26Q,
  TDS_SECTIONS,
  TDS_SECTION_KEYS,
  TALLY_FIXED_LEDGERS,
  TALLY_VOUCHER_KINDS,
  BOOK_SOURCES,
  deductionLedgerKey,
  gstShareOf,
  challanInterest,
  challanLabel,
  challanProblem,
  depositDue,
  dueDates,
  interest201,
  lateFee234E,
  quarterIn,
  quarterOf,
  quarterStep,
  rateMilliOf,
  rateText,
  returnDue,
  returnFileName,
  returnProblems,
  returnRows,
  tanProblem,
  tdsDeductionState,
  tdsLedgerKey,
  tdsOn,
  tdsPaise,
  tdsQuarterState,
  tdsRate,
  tdsSectionsOf,
  thresholdReached,
  totalsBySection,
  type LowerTdsCertificate,
  type TdsReturnChallan,
  type TdsReturnDeduction,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const INDIVIDUAL = 'ABCPK1234F';
const HUF = 'ABCHK1234F';
const COMPANY = 'AABCS1234F';
const FIRM = 'AAAFS1234F';
const rate = (section: Parameters<typeof tdsRate>[0], pan: string | null, cert: LowerTdsCertificate | null = null, on = '2026-10-15', amount = '100000') => tdsRate(section, { pan, certificate: cert }, on, amount);

test('money is worked in paise from the string, never a float', () => {
  assert.equal(tdsPaise('1250.5'), 125050n);
  assert.equal(tdsPaise('0.07'), 7n);
  assert.equal(tdsPaise('12,500'), null);
  assert.equal(rateText(100), '0.1');
  assert.equal(rateText(1000), '1');
  assert.equal(rateText(1500), '1.5');
  assert.equal(rateText(20000), '20');
  assert.equal(rateMilliOf('0.1'), 100);
  assert.equal(rateMilliOf('10'), 10000);
  assert.equal(rateMilliOf('ten'), null);
});

test('every section has its rate with a PAN', () => {
  const expected: Record<string, [number, number]> = {
    '192': [0, 0],
    '194A': [10000, 10000],
    '194C': [1000, 2000],
    '194H': [2000, 2000],
    '194I_A': [2000, 2000],
    '194I_B': [10000, 10000],
    '194J_A': [2000, 2000],
    '194J_B': [10000, 10000],
    '194Q': [100, 100],
  };
  assert.deepEqual([...TDS_SECTION_KEYS].sort(), Object.keys(expected).sort(), 'the registry holds the sections the return takes');
  for (const s of TDS_SECTION_KEYS) {
    assert.equal(rate(s, INDIVIDUAL).rate, expected[s][0], `${s} for an individual`);
    assert.equal(rate(s, COMPANY).rate, expected[s][1], `${s} for a company`);
  }
  assert.equal(rate('194C', HUF).rate, 1000, '194C for an HUF is 1%');
  assert.equal(rate('194C', FIRM).rate, 2000, '194C for a firm is 2%');
  assert.equal(rate('194J_B', COMPANY).reason, null);
  assert.deepEqual(tdsSectionsOf('FORM_24Q'), ['192']);
  assert.ok(!tdsSectionsOf('FORM_26Q').includes('192'));
  assert.equal(TDS_SECTIONS['194C'].code, '94C');
  assert.equal(TDS_SECTIONS['194J_B'].code, '4JB');
  assert.equal(TDS_SECTIONS['192'].code, '92B');
});

test('without a PAN the rate is 20% under 206AA, 5% under 194Q', () => {
  for (const s of ['194A', '194C', '194H', '194I_A', '194I_B', '194J_A', '194J_B'] as const) {
    const r = rate(s, null);
    assert.equal(r.rate, 20000, s);
    assert.equal(r.reason, 'C', s);
  }
  assert.equal(rate('194Q', null).rate, 5000);
  assert.equal(rate('194C', 'NOTAPAN').rate, 20000, 'a malformed PAN is no PAN');
  assert.equal(rate('194C', 'abcpk1234f').rate, 1000, 'a PAN in small letters still counts');
});

test('a lower deduction certificate applies while valid and within its limit', () => {
  const cert: LowerTdsCertificate = { certificateNo: 'LDC2627000123', section: '194C', rate: '0.5', validFrom: '2026-04-01', validTo: '2027-03-31', limit: '1000000', used: '900000' };
  const r = rate('194C', COMPANY, cert, '2026-10-15', '100000');
  assert.deepEqual([r.rate, r.reason, r.certificateNo], [500, 'A', 'LDC2627000123']);
  assert.equal(rate('194C', COMPANY, cert, '2026-10-15', '100000.01').rate, 2000, 'past the limit the normal rate');
  assert.equal(rate('194C', COMPANY, cert, '2027-04-01', '1000').rate, 2000, 'after it expires the normal rate');
  assert.equal(rate('194J_B', COMPANY, cert, '2026-10-15', '1000').rate, 10000, 'only for its own section');
  assert.equal(rate('194C', null, cert, '2026-10-15', '1000').rate, 20000, 'no PAN wins over a certificate');
});

test('TDS is rounded to the rupee', () => {
  assert.equal(tdsOn('125000', 1000), '1250.00');
  assert.equal(tdsOn('33333.33', 2000), '667.00');
  assert.equal(tdsOn('45678.90', 10000), '4568.00');
  assert.equal(tdsOn('49.50', 1000), '0.00');
  assert.equal(tdsOn('50', 1000), '1.00', 'half a rupee rounds up');
  assert.equal(tdsOn('500000', 100), '500.00', '194Q at 0.1%');
  assert.equal(tdsOn('987654321.99', 20000), '197530864.00', 'large amounts stay exact');
  assert.equal(tdsOn('0', 1000), '0.00');
});

test('194C: more than 30,000 on one bill or 1,00,000 in the year', () => {
  assert.equal(thresholdReached('194C', { amount: '30000', yearBefore: '0' }).due, false, '30,000 on the dot is not more than');
  assert.equal(thresholdReached('194C', { amount: '30000.01', yearBefore: '0' }).due, true);
  const crossing = thresholdReached('194C', { amount: '25000', yearBefore: '80000' });
  assert.deepEqual([crossing.due, crossing.base, crossing.catchUp], [true, '25000.00', '80000.00'], 'crossing the year brings the earlier payments in');
  assert.deepEqual(thresholdReached('194C', { amount: '25000', yearBefore: '110000' }).catchUp, '0.00', 'already past the year: nothing to catch up');
  assert.equal(thresholdReached('194C', { amount: '20000', yearBefore: '80000' }).due, false, 'exactly 1,00,000 in the year is not more than');
  assert.equal(thresholdReached('194C', { amount: '40000', yearBefore: '0' }).catchUp, '0.00', 'a single bill over 30,000 catches nothing up');
});

test('194J, 194H, 194A and 194I thresholds', () => {
  assert.equal(thresholdReached('194J_B', { amount: '50000', yearBefore: '0' }).due, false);
  assert.equal(thresholdReached('194J_B', { amount: '50001', yearBefore: '0' }).due, true);
  assert.equal(thresholdReached('194H', { amount: '15000', yearBefore: '5001' }).due, true);
  assert.equal(thresholdReached('194A', { amount: '10000', yearBefore: '0' }).due, false);
  assert.equal(thresholdReached('194I_A', { amount: '25000', yearBefore: '400000', monthBefore: '30000' }).due, true, 'rent over 50,000 in the month');
  assert.equal(thresholdReached('194I_A', { amount: '25000', yearBefore: '400000', monthBefore: '20000' }).due, false);
  assert.equal(thresholdReached('192', { amount: '1', yearBefore: '0' }).due, true, 'salary has no threshold');
});

test('194Q: TDS only on the part above 50 lakh in the year', () => {
  const crossing = thresholdReached('194Q', { amount: '1000000', yearBefore: '4500000' });
  assert.deepEqual([crossing.due, crossing.base], [true, '500000.00']);
  assert.equal(tdsOn(crossing.base, rate('194Q', COMPANY).rate), '500.00');
  assert.equal(thresholdReached('194Q', { amount: '1000000', yearBefore: '6000000' }).base, '1000000.00', 'past 50 lakh: the whole payment');
  assert.deepEqual([thresholdReached('194Q', { amount: '400000', yearBefore: '4000000' }).due, thresholdReached('194Q', { amount: '400000', yearBefore: '4000000' }).base], [false, '0.00']);
});

test('quarters run April to March', () => {
  assert.deepEqual(quarterOf('2026-04-01'), { fy: '2026-27', quarter: 1, from: '2026-04-01', to: '2026-06-30', label: 'Q1 2026-27' });
  assert.deepEqual(quarterOf('2026-11-10'), { fy: '2026-27', quarter: 3, from: '2026-10-01', to: '2026-12-31', label: 'Q3 2026-27' });
  assert.deepEqual(quarterOf('2027-02-15'), { fy: '2026-27', quarter: 4, from: '2027-01-01', to: '2027-03-31', label: 'Q4 2026-27' });
  assert.equal(quarterOf('2026-03-31').label, 'Q4 2025-26');
  assert.equal(quarterOf('2026-09-30').label, 'Q2 2026-27');
  assert.equal(quarterStep(quarterIn(2026, 4), 1).label, 'Q1 2027-28');
  assert.equal(quarterStep(quarterIn(2026, 1), -1).label, 'Q4 2025-26');
  assert.equal(quarterOf('2028-02-29').to, '2028-03-31');
});

test('deposits by the 7th, March by 30 April; returns by 31 July, October, January and May', () => {
  assert.equal(depositDue('2026-10-15'), '2026-11-07');
  assert.equal(depositDue('2026-12-31'), '2027-01-07');
  assert.equal(depositDue('2027-03-31'), '2027-04-30');
  assert.deepEqual([1, 2, 3, 4].map((q) => returnDue(quarterIn(2026, q as 1))), ['2026-07-31', '2026-10-31', '2027-01-31', '2027-05-31']);
  assert.deepEqual(dueDates(quarterIn(2026, 3)), {
    deposits: [
      { month: '2026-10', due: '2026-11-07' },
      { month: '2026-11', due: '2026-12-07' },
      { month: '2026-12', due: '2027-01-07' },
    ],
    returnDue: '2027-01-31',
  });
  assert.deepEqual(dueDates(quarterIn(2026, 4)).deposits.map((d) => d.due), ['2027-02-07', '2027-03-07', '2027-04-30']);
});

test('234E: ₹200 a day late, never more than the TDS', () => {
  assert.deepEqual(lateFee234E({ due: '2026-10-31', filedOn: '2026-11-10', tds: '50000' }), { days: 10, fee: '2000.00', capped: false });
  assert.deepEqual(lateFee234E({ due: '2026-10-31', filedOn: '2026-11-10', tds: '1500' }), { days: 10, fee: '1500.00', capped: true });
  assert.deepEqual(lateFee234E({ due: '2026-10-31', filedOn: '2026-10-31', tds: '1500' }), { days: 0, fee: '0.00', capped: false });
  assert.equal(lateFee234E({ due: '2027-05-31', filedOn: '2027-06-01', tds: '9999' }).fee, '200.00');
});

test('201(1A): 1.5% a month or part from the month of deduction to the month of deposit', () => {
  assert.deepEqual(interest201({ deductedOn: '2026-10-15', depositedOn: '2026-11-07', tds: '10000' }), { months: 0, interest: '0.00' }, 'on time');
  assert.deepEqual(interest201({ deductedOn: '2026-10-15', depositedOn: '2026-11-08', tds: '10000' }), { months: 2, interest: '300.00' }, 'a day late is two months: October and November');
  assert.deepEqual(interest201({ deductedOn: '2026-10-31', depositedOn: '2026-12-01', tds: '2500' }), { months: 3, interest: '113.00' }, '112.50 rounds to 113');
  assert.equal(interest201({ deductedOn: '2027-03-20', depositedOn: '2027-04-30', tds: '10000' }).months, 0, 'March by 30 April');
  assert.deepEqual(interest201({ deductedOn: '2027-03-20', depositedOn: '2027-05-01', tds: '10000' }), { months: 3, interest: '450.00' });
  assert.deepEqual(
    challanInterest('2026-12-10', [
      { paidOn: '2026-10-05', tdsAmount: '10000' },
      { paidOn: '2026-11-20', tdsAmount: '4000' },
    ]),
    { interest: '570.00', months: 3 },
    'each deduction from its own month: 10,000 × 4.5% + 4,000 × 3%',
  );
});

test('TAN and challan details are checked with words that say what to do', () => {
  assert.equal(tanProblem('BBNA01234F'), null);
  assert.equal(tanProblem(''), null);
  assert.match(tanProblem('BBNA1234F') ?? '', /10 characters/);
  assert.equal(challanProblem({ bsrCode: '0510308', challanSerial: '12', depositedOn: '2026-11-05' }, '2026-11-10'), null);
  assert.match(challanProblem({ bsrCode: '51030', challanSerial: '12', depositedOn: '2026-11-05' }, '2026-11-10') ?? '', /7 digits/);
  assert.match(challanProblem({ bsrCode: '0510308', challanSerial: '123456', depositedOn: '2026-11-05' }, '2026-11-10') ?? '', /5 digits/);
  assert.match(challanProblem({ bsrCode: '0510308', challanSerial: '1', depositedOn: '2026-11-11' }, '2026-11-10') ?? '', /future/);
  assert.equal(challanLabel({ bsrCode: '0510308', challanSerial: '12', depositedOn: '2026-11-05' }), '0510308 · 05/11/2026 · 00012');
});

const ded = (over: Partial<TdsReturnDeduction>): TdsReturnDeduction => ({
  id: 'd1',
  section: '194C',
  deducteeName: 'Mahanadi Builders',
  deducteePan: FIRM,
  deducteeRef: null,
  paidOn: '2026-10-10',
  amountPaid: '250000',
  rate: '2',
  tdsAmount: '5000',
  reason: null,
  certificateNo: null,
  challanId: 'c1',
  ...over,
});
const challan = (over: Partial<TdsReturnChallan>): TdsReturnChallan => ({ id: 'c1', bsrCode: '0510308', challanSerial: '12', depositedOn: '2026-11-05', tax: '5000', interest: '0', fee: '0', other: '0', minorHead: '200', ...over });

test('what blocks a return, and what only warns', () => {
  const clean = returnProblems({ tan: 'BBNA01234F', deductions: [ded({})], challans: [challan({})] });
  assert.deepEqual(clean, []);
  const p = returnProblems({
    tan: null,
    deductions: [
      ded({ id: 'a', section: null, challanId: null }),
      ded({ id: 'b', deducteePan: null, rate: '20', tdsAmount: '50000', amountPaid: '250000', challanId: 'c1' }),
      ded({ id: 'c', deducteePan: null, rate: '2', tdsAmount: '5000', challanId: 'c1' }),
      ded({ id: 'd', tdsAmount: '4000', challanId: 'c1' }),
    ],
    challans: [challan({ tax: '60000' })],
  });
  const kinds = p.map((x) => `${x.kind}:${x.deductionId ?? x.challanId ?? ''}:${x.blocks ? 'blocks' : 'warns'}`);
  assert.deepEqual(kinds, ['NO_TAN::blocks', 'TO_CONFIRM:a:blocks', 'NOT_DEPOSITED:a:blocks', 'PAN_MISSING:b:warns', 'PAN_MISSING_LOW:c:blocks', 'SHORT:d:warns', 'CHALLAN_MISMATCH:c1:blocks']);
  assert.match(p[6].text, /tax ₹60000 but its deductions this quarter come to ₹59000.00/);
  assert.equal(returnProblems({ tan: 'BBNA01234F', deductions: [ded({ section: '192', rate: '8.123', deducteePan: null })], challans: [challan({})] })[0].kind, 'PAN_MISSING', 'salary without a PAN warns');
});

test('totals by section, a section to confirm last', () => {
  const t = totalsBySection([
    ded({ id: 'a', section: '194J_B', amountPaid: '100000', tdsAmount: '10000', challanId: null }),
    ded({ id: 'b', section: '194C', amountPaid: '250000', tdsAmount: '5000' }),
    ded({ id: 'c', section: '194C', amountPaid: '50000.50', tdsAmount: '1000' }),
    ded({ id: 'd', section: null, amountPaid: '30000', tdsAmount: '600', challanId: null }),
  ]);
  assert.deepEqual(t, [
    { section: '194C', name: '194C', deductions: 2, paid: '300000.50', tds: '6000.00', deposited: '6000.00' },
    { section: '194J_B', name: '194J(b)', deductions: 1, paid: '100000.00', tds: '10000.00', deposited: '0.00' },
    { section: null, name: 'Section to confirm', deductions: 1, paid: '30000.00', tds: '600.00', deposited: '0.00' },
  ]);
});

test('26Q file: the utility’s challan and deductee columns, rows under their challans', () => {
  const challans = [
    challan({ id: 'late', bsrCode: '6390009', challanSerial: '7', depositedOn: '2026-12-10', tax: '10000', interest: '450', fee: '0' }),
    challan({ id: 'c1', tax: '6000' }),
  ];
  const deductions = [
    ded({ id: 'x', challanId: 'c1', paidOn: '2026-10-20', deducteeName: 'Odisha Earthmovers', deducteePan: COMPANY, section: '194I_A', amountPaid: '50000', tdsAmount: '1000' }),
    ded({ id: 'y', challanId: 'c1' }),
    ded({ id: 'z', challanId: 'late', section: '194J_B', deducteeName: 'Kalinga Consultants', deducteePan: null, paidOn: '2026-10-05', amountPaid: '50000', rate: '20', tdsAmount: '10000', reason: 'C' }),
  ];
  const f = returnRows('FORM_26Q', challans, deductions);
  assert.deepEqual(f.challans.header, [...RETURN_CHALLAN_HEADER]);
  assert.deepEqual(f.challans.rows, [
    ['1', '', '6000.00', '0.00', '0.00', '0.00', '0.00', '0.00', '6000.00', '', '0510308', '05/11/2026', '00012', '200', 'No', '0.00', '0.00'],
    ['2', '4JB', '10000.00', '0.00', '0.00', '450.00', '0.00', '0.00', '10450.00', '', '6390009', '10/12/2026', '00007', '200', 'No', '0.00', '0.00'],
  ]);
  assert.equal(f.deductees.name, 'Deductees');
  assert.deepEqual(f.deductees.header, [...RETURN_DEDUCTEE_HEADER_26Q]);
  assert.deepEqual(f.deductees.rows, [
    ['1', '1', '', '02', FIRM, 'Mahanadi Builders', '94C', '10/10/2026', '250000.00', '5000.00', '0.00', '0.00', '5000.00', '5000.00', '10/10/2026', '2', '', ''],
    ['1', '2', '', '01', COMPANY, 'Odisha Earthmovers', '4IA', '20/10/2026', '50000.00', '1000.00', '0.00', '0.00', '1000.00', '1000.00', '20/10/2026', '2', '', ''],
    ['2', '3', '', '02', 'PANNOTAVBL', 'Kalinga Consultants', '4JB', '05/10/2026', '50000.00', '10000.00', '0.00', '0.00', '10000.00', '10000.00', '05/10/2026', '20', 'C', ''],
  ]);
  assert.equal(f.deductees.rows.every((r) => r.length === RETURN_DEDUCTEE_HEADER_26Q.length), true, 'each row fills every column');
  assert.equal(returnFileName('BBNA01234F', 'FORM_26Q', quarterIn(2026, 3)), 'BBNA01234F_26Q_Q3_2026-27.xlsx');
});

test('24Q file: employees with their codes, section 92B', () => {
  const f = returnRows('FORM_24Q', [challan({ tax: '8200' })], [ded({ section: '192', deducteeName: 'Ravi Sahu', deducteePan: INDIVIDUAL, deducteeRef: 'EMP-014', paidOn: '2026-10-31', amountPaid: '85000', rate: '9.647', tdsAmount: '8200' })]);
  assert.equal(f.deductees.name, 'Employees');
  assert.deepEqual(f.deductees.header, [...RETURN_DEDUCTEE_HEADER_24Q]);
  assert.deepEqual(f.deductees.rows, [['1', '1', 'EMP-014', INDIVIDUAL, 'Ravi Sahu', '92B', '31/10/2026', '85000.00', '8200.00', '0.00', '0.00', '8200.00', '8200.00', '31/10/2026', '', '']]);
  assert.equal(f.challans.rows[0][1], '92B');
});

test('states and ledgers', () => {
  assert.equal(tdsDeductionState({ section: null, challanId: 'c' }), 'TO_CONFIRM');
  assert.equal(tdsDeductionState({ section: '194C', challanId: null }), 'NOT_DEPOSITED');
  assert.equal(tdsDeductionState({ section: '194C', challanId: 'c' }), 'DEPOSITED');
  const q = quarterIn(2026, 2);
  assert.equal(tdsQuarterState(q, null, '2026-09-30'), 'RUNNING');
  assert.equal(tdsQuarterState(q, null, '2026-10-31'), 'DUE');
  assert.equal(tdsQuarterState(q, null, '2026-11-01'), 'LATE');
  assert.equal(tdsQuarterState(q, 'FILED', '2026-11-01'), 'FILED');
  assert.equal(tdsLedgerKey('192'), 'SALARY_TDS_PAYABLE');
  assert.equal(tdsLedgerKey('194C'), 'TDS_PAYABLE_194C');
  assert.equal(tdsLedgerKey(null), 'TDS_PAYABLE', 'a deduction made before sections keeps the old ledger');
});

test('every ledger a deduction or a challan posts to is a fixed ledger, and a backfilled one keeps the old one', () => {
  const fixed = new Set(TALLY_FIXED_LEDGERS.map((l) => l.key));
  for (const k of TDS_SECTION_KEYS) {
    assert.ok(fixed.has(tdsLedgerKey(k)), `${k} posts to ${tdsLedgerKey(k)}, which is no fixed ledger`);
    assert.ok(fixed.has(deductionLedgerKey({ section: k, backfilled: true })), k);
  }
  for (const k of ['TDS_PAYABLE', 'TDS_INTEREST', 'TDS_LATE_FEE']) assert.ok(fixed.has(k), k);
  assert.equal(deductionLedgerKey({ section: '194C', backfilled: false }), 'TDS_PAYABLE_194C');
  assert.equal(deductionLedgerKey({ section: '194C', backfilled: true }), 'TDS_PAYABLE', 'an old bill’s voucher credited TDS Payable');
  assert.equal(deductionLedgerKey({ section: null, backfilled: true }), 'TDS_PAYABLE');
  assert.equal(deductionLedgerKey({ section: '192', backfilled: true }), 'SALARY_TDS_PAYABLE', 'salary TDS was always on its own ledger');
  assert.ok((TALLY_VOUCHER_KINDS as readonly string[]).includes('TDS_CHALLAN') && (BOOK_SOURCES as readonly string[]).includes('TDS_CHALLAN'));
});

test('the GST share of a part payment comes off the TDS base, to the paise', () => {
  // A bill of 1,00,000 + 18,000 GST paid in full: TDS on 1,00,000.
  assert.equal(gstShareOf('118000', '18000', '118000'), '18000.00');
  // Half of it paid: half the GST.
  assert.equal(gstShareOf('59000', '18000', '118000'), '9000.00');
  // 10,000 of a 1,18,000 bill: 1,525.4237… rounds to 1,525.42.
  assert.equal(gstShareOf('10000', '18000', '118000'), '1525.42');
  // Worked in paise, so 59 paise of a 118 bill carry exactly 9 paise of GST.
  assert.equal(gstShareOf('0.59', '18', '118'), '0.09');
  assert.equal(gstShareOf('1000', '0', '1000'), '0.00', 'a bill without GST');
  assert.equal(gstShareOf('1000', '10', '0'), '0.00', 'a bill with no total takes nothing off');
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`not ok - ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed} of ${cases.length} passed`);
if (failed) process.exit(1);
