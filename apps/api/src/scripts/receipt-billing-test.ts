/** Received, not billed: bills cover an order line's receipts oldest first. Run: node dist/scripts/receipt-billing-test.js */
import assert from 'node:assert/strict';
import { receiptsAwaitingBill, type ReceiptLineFact } from '../stock/receipt-billing';

const r = (entryId: string, order: string, line: string, accepted: number): ReceiptLineFact => ({ entryId, order, purchaseOrderLineId: line, accepted });
const waiting = (lines: ReceiptLineFact[], billed: [string, number][]) => [...receiptsAwaitingBill(lines, new Map(billed))].sort();

const cases: [string, () => void][] = [
  ['nothing billed: every receipt waits', () => assert.deepEqual(waiting([r('g1', '1', 'L', 10), r('g2', '2', 'L', 5)], []), ['g1', 'g2'])],
  ['one bill for the first delivery: the second still waits', () => assert.deepEqual(waiting([r('g1', '1', 'L', 10), r('g2', '2', 'L', 5)], [['L', 10]]), ['g2'])],
  ['a bill short of a delivery leaves it waiting', () => assert.deepEqual(waiting([r('g1', '1', 'L', 10)], [['L', 9]]), ['g1'])],
  ['billed in full: nothing waits', () => assert.deepEqual(waiting([r('g1', '1', 'L', 10), r('g2', '2', 'L', 5)], [['L', 15]]), [])],
  ['bills cover the oldest first, whatever the input order', () => assert.deepEqual(waiting([r('g2', '2', 'L', 5), r('g1', '1', 'L', 10)], [['L', 10]]), ['g2'])],
  ['a receipt waits while any of its lines is short', () => assert.deepEqual(waiting([r('g1', '1', 'A', 4), r('g1', '1', 'B', 6)], [['A', 4]]), ['g1'])],
  ['material rejected in full is not billed', () => assert.deepEqual(waiting([r('g1', '1', 'L', 0)], []), [])],
  ['one line billed does not cover another', () => assert.deepEqual(waiting([r('g1', '1', 'A', 4), r('g2', '2', 'B', 3)], [['A', 10]]), ['g2'])],
];

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`${cases.length - failed}/${cases.length} passed`);
if (failed) process.exit(1);
