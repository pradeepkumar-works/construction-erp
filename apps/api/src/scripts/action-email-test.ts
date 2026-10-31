/**
 * Emails for the actions that wait on someone: the RA bill the client's engineer
 * reads in their inbox, and the Monday summary of the money that came in. No database. CI runs it after the build:
 *
 *   node dist/scripts/action-email-test.js
 */
import assert from 'node:assert/strict';
import { BILL_EMAIL_ITEMS, billEmail, type BillEmailInput } from '../ra-bills/ra-bill-email';
import { receiptWeek, type WeekReceipt } from '../notifications/receipt-week';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const bill: BillEmailInput = {
  orgName: 'Demo Constructions',
  billLabel: 'RA bill 3',
  billDate: '2026-10-25',
  measuredUpTo: '2026-10-20',
  projectCode: 'BL-2026-02',
  projectName: 'District Hospital Block B (G+3)',
  clientName: 'Works Department',
  contactPerson: 'S. Nayak',
  agreementNo: 'AG/2026/114',
  grossAmount: '3672000.00',
  pvAmount: '0.00',
  gstRate: '18',
  gstAmount: '660960.00',
  grossUpto: '9120000.00',
  deductions: [
    { label: 'Retention', amount: '183600.00' },
    { label: 'Labour cess', amount: '36720.00' },
  ],
  netPayable: '4112640.00',
  items: [
    { itemNo: '2.1', description: 'PCC 1:4:8 in foundation', unit: 'Cum', thisQty: '148.5', rate: '5400.00', amount: '801900.00' },
    { itemNo: '3.2', description: 'RCC M25 in <columns>', unit: 'Cum', thisQty: '212.75', rate: '13500.00', amount: '2872125.00' },
  ],
  paymentDays: 45,
  portalUrl: null,
  preparedBy: { name: 'Meera Joshi', email: 'qs@demo.com', phone: '9800000004' },
};

test('the email is the bill: items, quantities, rates, deductions and the net', () => {
  const m = billEmail(bill);
  assert.equal(m.subject, 'RA bill 3 for District Hospital Block B (G+3): ₹41,12,640.00 to certify');
  for (const s of ['RA bill 3', '20 Oct 2026', 'AG/2026/114', '148.5 Cum', '₹5,400.00', '₹8,01,900.00', 'GST 18%', 'Less retention', 'Less labour cess', '₹41,12,640.00', '45 days from the certificate'])
    assert.ok(m.html.includes(s), `html has ${s}`);
  assert.match(m.text, /3\.2\. RCC M25 in <columns> — 212\.75 Cum @ ₹13,500\.00 = ₹28,72,125\.00/);
  assert.match(m.text, /Net payable: ₹41,12,640\.00/);
});

test('deductions are shown as money off, not added', () => {
  const m = billEmail(bill);
  assert.ok(m.html.includes('-₹1,83,600.00'));
  assert.match(m.text, /Less retention: -₹1,83,600\.00/);
});

test('item descriptions and names are escaped in the HTML', () => {
  const m = billEmail(bill);
  assert.ok(m.html.includes('RCC M25 in &lt;columns&gt;'));
  assert.ok(!m.html.includes('RCC M25 in <columns>'));
});

test('no price variation line when there is none; one when the indices moved', () => {
  assert.ok(!billEmail(bill).html.includes('Price variation'));
  const moved = billEmail({ ...bill, pvAmount: '45000.00' });
  assert.ok(moved.html.includes('Price variation'));
  assert.match(moved.text, /Price variation: ₹45,000\.00/);
});

test('without a portal login the engineer replies to the QS; with one, the button opens the bill', () => {
  const plain = billEmail(bill);
  assert.match(plain.text, /reply to Meera Joshi, qs@demo\.com, 9800000004 with your certificate/);
  assert.ok(!plain.html.includes('Open the bill'));
  const portal = billEmail({ ...bill, portalUrl: 'https://erp.example.com/portal/p1?open=b3' });
  assert.ok(portal.html.includes('https://erp.example.com/portal/p1?open=b3'));
  assert.ok(portal.html.includes('Open the bill'));
  assert.match(portal.text, /record your certificate/);
});

test('a long bill prints the first items and leaves the rest to the portal', () => {
  const many = Array.from({ length: BILL_EMAIL_ITEMS + 7 }, (_, n) => ({ itemNo: `${n + 1}`, description: `Item ${n + 1}`, unit: 'Cum', thisQty: '1', rate: '100.00', amount: '100.00' }));
  const m = billEmail({ ...bill, items: many });
  assert.ok(m.html.includes(`Item ${BILL_EMAIL_ITEMS}`));
  assert.ok(!m.html.includes(`Item ${BILL_EMAIL_ITEMS + 1}<`));
  assert.ok(m.html.includes('and 7 more items, in the bill on the portal'));
});

const receipts: WeekReceipt[] = [
  { projectId: 'p1', projectCode: 'BL-2026-02', projectName: 'District Hospital Block B (G+3)', amount: '2500000.00', date: '2026-10-20', billLabel: 'RA bill 2' },
  { projectId: 'p1', projectCode: 'BL-2026-02', projectName: 'District Hospital Block B (G+3)', amount: '1200000.00', date: '2026-10-23', billLabel: 'RA bill 3' },
  { projectId: 'p2', projectCode: 'RD-2026-01', projectName: 'Approach road to the new bridge', amount: '800000.00', date: '2026-10-21', billLabel: null },
];

test('the week adds up per project, most money first', () => {
  const s = receiptWeek('2026-10-19', '2026-10-25', receipts);
  assert.ok(s);
  assert.equal(s!.total, '4500000.00');
  assert.equal(s!.count, 3);
  assert.deepEqual(
    s!.projects.map((p) => [p.projectCode, p.total, p.count]),
    [
      ['BL-2026-02', '3700000.00', 2],
      ['RD-2026-01', '800000.00', 1],
    ],
  );
  assert.equal(s!.title, '₹45,00,000.00 received from clients last week');
  assert.match(s!.body, /3 receipts on 2 projects/);
  assert.match(s!.body, /District Hospital Block B \(G\+3\): ₹37,00,000\.00 in 2 receipts/);
  assert.match(s!.body, /Approach road to the new bridge: ₹8,00,000\.00\./);
});

test('receipts outside the week are left out', () => {
  const s = receiptWeek('2026-10-19', '2026-10-25', [...receipts, { ...receipts[2], projectId: 'p3', projectCode: 'RD-2026-09', date: '2026-10-26' }]);
  assert.equal(s!.projects.length, 2);
  assert.equal(s!.total, '4500000.00');
});

test('a week with no money in sends nothing', () => {
  assert.equal(receiptWeek('2026-10-26', '2026-11-01', receipts), null);
});

test('beyond four projects the summary names the first four and counts the rest', () => {
  const six = Array.from({ length: 6 }, (_, n) => ({ projectId: `p${n}`, projectCode: `RD-2026-0${n}`, projectName: `Project ${n}`, amount: `${(6 - n) * 100000}.00`, date: '2026-10-20', billLabel: null }));
  const s = receiptWeek('2026-10-19', '2026-10-25', six);
  assert.match(s!.body, /Project 0: ₹6,00,000\.00; Project 1/);
  assert.match(s!.body, /; and 2 more\./);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed) process.exit(1);
