/**
 * Bank files: each layout's columns and their order, NEFT below two lakh and RTGS from it, payees without an account or
 * IFSC left out with why, amounts in rupees with two decimals from the string, the salary run's file through the same
 * rows, and the bank's UTRs read back from a response file or a pasted list. CI runs it after the build:
 *
 *   node dist/scripts/bank-file-test.js
 */
import assert from 'node:assert/strict';
import {
  BANK_FILE_FORMATS,
  BANK_FILE_FORMAT_KEYS,
  bankFileProblem,
  bankFileRows,
  bankFileText,
  isBankFileFormat,
  paymentMode,
  readUtrResponse,
  rupees,
  type BankPayee,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const ctx = { debitAccount: '50200012345678', valueDate: '2026-11-10' };
const payee = (over: Partial<BankPayee> = {}): BankPayee => ({
  name: 'Shree Cement Traders',
  accountNo: '1234567890',
  ifsc: 'HDFC0001234',
  amount: '100000',
  narration: 'PR-2026-0001 INV-77',
  reference: 'PR-2026-0001',
  email: 'accounts@shree.example',
  ...over,
});

test('amounts are rupees with two decimals, from the string', () => {
  assert.equal(rupees('100000'), '100000.00');
  assert.equal(rupees('125000.5'), '125000.50');
  assert.equal(rupees('0.07'), '0.07');
  assert.equal(rupees('19999999.99'), '19999999.99');
  assert.throws(() => rupees('12.345'));
  assert.throws(() => rupees('-5'));
  // 0.1 + 0.2 in floats is 0.30000000000000004; a string never passes through one.
  assert.equal(rupees('0.30'), '0.30');
});

test('RTGS from two lakh, NEFT below', () => {
  assert.equal(paymentMode('100000'), 'NEFT');
  assert.equal(paymentMode('199999.99'), 'NEFT');
  assert.equal(paymentMode('200000'), 'RTGS');
  assert.equal(paymentMode('200000.00'), 'RTGS');
  assert.equal(paymentMode('300000'), 'RTGS');
});

test('a payee without an account number or IFSC is refused with why', () => {
  assert.equal(bankFileProblem(payee()), null);
  assert.equal(bankFileProblem(payee({ ifsc: null })), 'No IFSC');
  assert.equal(bankFileProblem(payee({ accountNo: '' })), 'No bank account number');
  assert.equal(bankFileProblem(payee({ accountNo: null, ifsc: ' ' })), 'No bank account or IFSC');
  assert.match(bankFileProblem(payee({ ifsc: 'HDFC1234' }))!, /not 11 characters/);
  assert.match(bankFileProblem(payee({ ifsc: 'HDFC1001234' }))!, /not 11 characters/, 'the fifth character is a zero');
  assert.equal(bankFileProblem(payee({ ifsc: 'hdfc0001234' })), null, 'case does not matter');
  assert.equal(bankFileProblem(payee({ accountNo: '1234 5678 90' })), null, 'spaces in the number are dropped');
  assert.equal(bankFileProblem(payee({ amount: '0' })), 'Nothing to pay');
});

test('the generic file: header, one row per payee in column order, the missing listed and left out', () => {
  const out = bankFileRows('GENERIC', ctx, [
    payee(),
    payee({ name: 'No IFSC Pvt Ltd', ifsc: '', reference: 'PR-2026-0002' }),
    payee({ amount: '300000', reference: 'PR-2026-0003', narration: 'PR-2026-0003' }),
  ]);
  assert.deepEqual(out.rows[0], ['Payment type', 'Debit account', 'Beneficiary name', 'Beneficiary account', 'IFSC', 'Amount', 'Narration', 'Reference']);
  assert.equal(out.rows.length, 3, 'a header and two rows');
  assert.deepEqual(out.rows[1], ['NEFT', '50200012345678', 'Shree Cement Traders', '1234567890', 'HDFC0001234', '100000.00', 'PR-2026-0001 INV-77', 'PR-2026-0001']);
  assert.deepEqual(out.rows[2].slice(0, 1).concat(out.rows[2].slice(5, 6)), ['RTGS', '300000.00']);
  assert.deepEqual(out.missing, [{ reference: 'PR-2026-0002', name: 'No IFSC Pvt Ltd', problem: 'No IFSC' }]);
  assert.deepEqual(out.paid, [{ reference: 'PR-2026-0001', mode: 'NEFT' }, { reference: 'PR-2026-0003', mode: 'RTGS' }]);
});

test('HDFC: no header, 28 columns, N or R first, amount fourth, IFSC twenty-fifth, date as DD/MM/YYYY', () => {
  const out = bankFileRows('HDFC', ctx, [payee(), payee({ amount: '250000', reference: 'PR-2026-0009' })]);
  assert.equal(out.rows.length, 2, 'no header row');
  for (const r of out.rows) assert.equal(r.length, 28);
  const [a, b] = out.rows;
  assert.equal(a[0], 'N');
  assert.equal(b[0], 'R');
  assert.equal(a[2], '1234567890');
  assert.equal(a[3], '100000.00');
  assert.equal(a[4], 'Shree Cement Traders');
  assert.equal(a[13], 'PR-2026-0001');
  assert.equal(a[22], '10/11/2026');
  assert.equal(a[24], 'HDFC0001234');
  assert.equal(a[27], 'accounts@shree.example');
});

test('ICICI: its header names in order, the product code and mode, date as DD-MM-YYYY', () => {
  const out = bankFileRows('ICICI', ctx, [payee()]);
  assert.deepEqual(out.rows[0], ['PYMT_PROD_TYPE_CODE', 'PYMT_MODE', 'DEBIT_ACC_NO', 'BNF_NAME', 'BENE_ACC_NO', 'BENE_IFSC', 'AMOUNT', 'DEBIT_NARR', 'CREDIT_NARR', 'MOBILE_NUM', 'EMAIL_ID', 'REMARK', 'PYMT_DATE', 'REF_NO']);
  assert.deepEqual(out.rows[1].slice(0, 7), ['PAB_VENDOR', 'NEFT', '50200012345678', 'Shree Cement Traders', '1234567890', 'HDFC0001234', '100000.00']);
  assert.equal(out.rows[1][12], '10-11-2026');
  assert.equal(out.rows[1][13], 'PR-2026-0001');
});

test('SBI: its header in order, mode sixth, value date seventh', () => {
  const out = bankFileRows('SBI', ctx, [payee({ amount: '200000' })]);
  assert.deepEqual(out.rows[0], ['Debit account number', 'Beneficiary account number', 'IFSC code', 'Beneficiary name', 'Amount', 'Payment mode', 'Value date', 'Transaction reference', 'Remarks']);
  assert.deepEqual(out.rows[1], ['50200012345678', '1234567890', 'HDFC0001234', 'Shree Cement Traders', '200000.00', 'RTGS', '10/11/2026', 'PR-2026-0001', 'PR-2026-0001 INV-77']);
});

test('every layout writes every row as wide as its columns, and is a known key', () => {
  for (const k of BANK_FILE_FORMAT_KEYS) {
    const out = bankFileRows(k, ctx, [payee(), payee({ amount: '999999.99' })]);
    const width = BANK_FILE_FORMATS[k].columns.length;
    for (const r of out.rows) assert.equal(r.length, width, `${k} rows are ${width} wide`);
    assert.ok(isBankFileFormat(k));
  }
  assert.equal(isBankFileFormat('AXIS'), false);
  assert.equal(isBankFileFormat('toString'), false);
});

test('names and narrations lose what banks refuse; CSV quotes only what needs it', () => {
  const out = bankFileRows('GENERIC', ctx, [payee({ name: 'Ram, Shyam & Sons "Infra"', narration: 'Bill #12; site/2' })]);
  assert.equal(out.rows[1][2], 'Ram Shyam & Sons Infra');
  assert.equal(out.rows[1][6], 'Bill 12 site/2');
  const text = bankFileText([['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  assert.equal(text, 'a,"b,c","d""e"\r\n1,2,3\r\n');
  assert.equal(bankFileText([]), '');
});

test("the salary run's file: same columns, an employee without a bank account listed by name", () => {
  const out = bankFileRows('GENERIC', ctx, [
    { name: 'Priya Nair', accountNo: '00112233', ifsc: 'SBIN0004321', amount: '48250.00', narration: 'Salary 2026-10', reference: 'EMP-0007' },
    { name: 'Ravi Kumar', accountNo: null, ifsc: null, amount: '30000.00', narration: 'Salary 2026-10', reference: 'EMP-0009' },
  ]);
  assert.equal(out.rows[1][7], 'EMP-0007');
  assert.equal(out.rows[1][6], 'Salary 2026-10');
  assert.deepEqual(out.missing.map((m) => `${m.name} (${m.reference})`), ['Ravi Kumar (EMP-0009)']);
});

const refs = ['PR-2026-0001', 'PR-2026-0002', 'PR-2026-0003'];

test("a bank's response file: UTR under its heading, matched by our reference in any cell, rejected rows reported", () => {
  const read = readUtrResponse(
    [
      ['Bulk payment status report'],
      ['Sr', 'Beneficiary', 'Amount', 'Customer Ref No', 'Status', 'UTR No.'],
      ['1', 'Shree Cement Traders', '100000.00', 'PR-2026-0001', 'Paid', 'HDFCN52026111012345'],
      ['2', 'Kaveri Steel', '300000.00', 'pr-2026-0003', 'Processed', 'HDFCR52026111000000123'],
      ['3', 'Bad Account Co', '5000.00', 'PR-2026-0002', 'Rejected - invalid account', ''],
      ['', 'Total', '405000.00', '', '', ''],
    ],
    refs,
  );
  assert.deepEqual(read.found, [
    { reference: 'PR-2026-0001', utr: 'HDFCN52026111012345' },
    { reference: 'PR-2026-0003', utr: 'HDFCR52026111000000123' },
  ]);
  assert.deepEqual(read.rejected, [{ reference: 'PR-2026-0002', status: 'Rejected - invalid account' }]);
  assert.deepEqual(read.problems, []);
});

test('a pasted list: one request and its UTR a line, an account number never taken for the UTR', () => {
  const read = readUtrResponse(
    [['PR-2026-0001 HDFCN52026111012345'], ['PR-2026-0002, 1234567890, SBINN52026111099999'], ['PR-2026-0003\t998877665544'], ['nothing here']],
    refs,
  );
  assert.deepEqual(read.found, [
    { reference: 'PR-2026-0001', utr: 'HDFCN52026111012345' },
    { reference: 'PR-2026-0002', utr: 'SBINN52026111099999' },
    { reference: 'PR-2026-0003', utr: '998877665544' },
  ]);
  assert.deepEqual(read.problems, []);
});

test('a row of someone else, a request without a UTR, two UTRs for one request and one UTR for two are problems', () => {
  const read = readUtrResponse(
    [['PR-2026-0099 HDFCN52026111000001'], ['PR-2026-0001'], ['PR-2026-0002 AAAAN1111111111111'], ['PR-2026-0002 BBBBN2222222222222'], ['PR-2026-0003 CCCCN3333333333333'], ['PR-2026-0001 CCCCN3333333333333']],
    refs,
  );
  assert.deepEqual(read.found, []);
  assert.deepEqual(read.problems, [
    'Row 1: no request number of this batch',
    'Row 2: no UTR for PR-2026-0001',
    'PR-2026-0002 has two different UTRs; import it again with one',
    'UTR CCCCN3333333333333 is given for PR-2026-0003 and PR-2026-0001; a UTR belongs to one payment',
  ]);
  // The same UTR read twice for the same request is one.
  assert.deepEqual(readUtrResponse([['PR-2026-0001 HDFCN52026111012345'], ['PR-2026-0001 HDFCN52026111012345']], refs).found, [{ reference: 'PR-2026-0001', utr: 'HDFCN52026111012345' }]);
});

let failed = 0;
for (const [n, fn] of cases) {
  try {
    fn();
    console.log(`ok   ${n}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${n}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed} of ${cases.length} passed`);
if (failed) process.exit(1);
