/**
 * The supplier portal's tests (v6 item 105): the statement's running balance, what a bill is worth to the supplier,
 * what is left to send on an order, dispatch notes against it, where an invoice stands, and profile changes, with no
 * database. CI runs it after the build:
 *
 *   node dist/scripts/supplier-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { dispatchProblem, dueSplit, invoiceStage, maskAccount, paymentDebit, profileChanges, statement, subBillCredit, toSend, touchesBank, vendorBillCredit, type ProfileValues } from '../supplier/supplier-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const s = (v: Prisma.Decimal) => v.toFixed(2);

test('the statement runs bills, notes and payments by date, a bill before the money paid the same day', () => {
  const r = statement([
    { date: '2026-10-10', kind: 'PAYMENT', ref: 'UTR1', description: 'paid', debit: '50000', credit: 0 },
    { date: '2026-10-01', kind: 'ADVANCE', ref: 'UTR0', description: 'advance', debit: '20000', credit: 0 },
    { date: '2026-10-10', kind: 'BILL', ref: 'VB-1', description: 'bill', debit: 0, credit: '118000' },
    { date: '2026-10-12', kind: 'DEBIT_NOTE', ref: 'DN-1', description: 'short', debit: '3000', credit: 0 },
  ]);
  assert.deepEqual(
    r.rows.map((x) => [x.ref, s(x.balance)]),
    [
      ['UTR0', '-20000.00'],
      ['VB-1', '98000.00'],
      ['UTR1', '48000.00'],
      ['DN-1', '45000.00'],
    ],
  );
  assert.equal(s(r.billed), '118000.00');
  assert.equal(s(r.paid), '73000.00');
  assert.equal(s(r.balance), '45000.00');
  assert.equal(r.opening, null);
});

test('lines before the from date are carried in the opening balance', () => {
  const r = statement(
    [
      { date: '2026-03-20', kind: 'BILL', ref: 'VB-0', description: 'old bill', debit: 0, credit: '10000' },
      { date: '2026-03-25', kind: 'PAYMENT', ref: 'U0', description: 'part', debit: '4000', credit: 0 },
      { date: '2026-04-05', kind: 'PAYMENT', ref: 'U1', description: 'rest', debit: '6000', credit: 0 },
    ],
    '2026-04-01',
  );
  assert.equal(s(r.opening!), '6000.00');
  assert.deepEqual(r.rows.map((x) => [x.ref, s(x.balance)]), [['U1', '0.00']]);
  assert.equal(s(r.billed), '0.00');
  assert.equal(s(r.paid), '6000.00');
});

test('a vendor bill counts its total less diesel recovered; a subcontract bill its net plus the advance it recovers', () => {
  assert.equal(s(vendorBillCredit({ total: '118000', fuelRecovery: '4500' })), '113500.00');
  // Gross 100000 + GST 18000 − retention 5000 − advance 10000 − TDS 1000 = 102000 net; the advance was debited when paid.
  assert.equal(s(subBillCredit({ netPayable: '102000', advanceRecoveryAmount: '10000' })), '112000.00');
  assert.equal(s(paymentDebit({ amount: '98000', tdsAmount: '2000', otherDeduction: '500' })), '100500.00');
});

test('what is due is split into overdue by the due date; settled bills are left out', () => {
  const r = dueSplit(
    [
      { due: '30000', dueDate: '2026-10-01' },
      { due: '20000', dueDate: '2026-11-15' },
      { due: '0', dueDate: '2026-09-01' },
    ],
    '2026-10-22',
  );
  assert.equal(s(r.due), '50000.00');
  assert.equal(s(r.overdue), '30000.00');
});

test('left to send is ordered less received less on the way, never below zero', () => {
  assert.equal(toSend('300', '100', '50').toString(), '150');
  assert.equal(toSend('300', '280', '50').toString(), '0');
});

test('a dispatch note may send only what is left on its own order’s lines, each line once', () => {
  const lines = [
    { id: 'a', itemName: 'Aggregate 20mm', unit: 'Cum', toSend: '150' },
    { id: 'b', itemName: 'Bitumen VG-30', unit: 'MT', toSend: '0' },
  ];
  assert.equal(dispatchProblem([{ lineId: 'a', quantity: 150 }], lines), null);
  assert.equal(dispatchProblem([{ lineId: 'a', quantity: 151 }], lines), 'Only 150 Cum of Aggregate 20mm is left to send');
  assert.equal(dispatchProblem([{ lineId: 'b', quantity: 1 }], lines), 'Bitumen VG-30 has nothing left to send on this order');
  assert.equal(dispatchProblem([{ lineId: 'a', quantity: 1 }, { lineId: 'a', quantity: 1 }], lines), 'Aggregate 20mm is on the note twice');
  assert.equal(dispatchProblem([{ lineId: 'x', quantity: 1 }], lines), 'A line is not on this order. Reload the page and try again.');
  assert.equal(dispatchProblem([], lines), 'Enter the quantity sent on at least one line');
});

test('an invoice is with accounts until a bill is made from it, then billed, then paid; returned stays returned', () => {
  assert.equal(invoiceStage('SUBMITTED', null), 'SUBMITTED');
  assert.equal(invoiceStage('SUBMITTED', { status: 'REJECTED', payable: '100', paid: '0' }), 'SUBMITTED');
  assert.equal(invoiceStage('SUBMITTED', { status: 'SUBMITTED', payable: '100', paid: '0' }), 'BILLED');
  assert.equal(invoiceStage('SUBMITTED', { status: 'APPROVED', payable: '100', paid: '60' }), 'BILLED');
  assert.equal(invoiceStage('SUBMITTED', { status: 'APPROVED', payable: '100', paid: '100' }), 'PAID');
  assert.equal(invoiceStage('RETURNED', null), 'RETURNED');
  assert.equal(invoiceStage('WITHDRAWN', null), 'WITHDRAWN');
});

test('a profile change lists only what differs, tidied; a bank field makes it a bank change', () => {
  const current: ProfileValues = {
    contactPerson: 'R. K. Mohanty',
    email: 'kba@example.com',
    phone: '9437012345',
    address: 'Odisha',
    gstin: '21AAKFK4521B1Z0',
    pan: 'AAKFK4521B',
    msmeCategory: 'SMALL',
    udyamNo: null,
    bankAccountName: 'Kalinga Bitumen',
    bankAccountNo: '39281726354',
    bankIfsc: 'SBIN0001234',
    bankName: 'SBI Khordha',
  };
  const c = profileChanges(current, { email: ' KBA@example.com ', phone: '9437099999', address: '', bankIfsc: 'sbin0000052' });
  assert.deepEqual(c, [
    { field: 'phone', from: '9437012345', to: '9437099999' },
    { field: 'address', from: 'Odisha', to: null },
    { field: 'bankIfsc', from: 'SBIN0001234', to: 'SBIN0000052' },
  ]);
  assert.equal(touchesBank(c.map((x) => x.field)), true);
  assert.equal(touchesBank(['phone', 'address']), false);
  assert.equal(maskAccount('39281726354'), '•••• 6354');
  assert.equal(maskAccount(null), null);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
