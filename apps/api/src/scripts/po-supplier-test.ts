/**
 * Purchase orders to the supplier: the reason asked when an order is not from the lowest complete quotation, and the
 * order as the vendor's email shows it, with no database. CI runs it after the build:
 *
 *   node dist/scripts/po-supplier-test.js
 */
import assert from 'node:assert/strict';
import { poEmail, selectionProblem, type PoEmailInput } from '../purchasing/po-supplier-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const lowest = { id: 'q-utkal', vendorName: 'Utkal Cement Traders', total: '118000.00' };

test('an order from the lowest quotation needs no reason', () => {
  assert.equal(selectionProblem(lowest, { quotationId: 'q-utkal', vendorName: 'Utkal Cement Traders' }, null), null);
});

test('with no complete quotation on the request there is nothing to explain', () => {
  assert.equal(selectionProblem(null, { quotationId: null, vendorName: 'Odisha Steel & Cement Depot' }, null), null);
});

test('an order from a dearer quotation names the lowest and asks why', () => {
  const p = selectionProblem(lowest, { quotationId: 'q-odisha', vendorName: 'Odisha Steel & Cement Depot' }, '  ');
  assert.ok(p);
  assert.match(p!, /Utkal Cement Traders quoted lowest \(₹1,18,000\.00\)/);
  assert.match(p!, /goes to Odisha Steel & Cement Depot/);
});

test('an order without a quotation, while one prices every line, also asks why', () => {
  assert.ok(selectionProblem(lowest, { quotationId: null, vendorName: 'Utkal Cement Traders' }, null));
});

test('a word is not a reason; a sentence is', () => {
  const order = { quotationId: 'q-odisha', vendorName: 'Odisha Steel & Cement Depot' };
  assert.ok(selectionProblem(lowest, order, 'urgent'));
  assert.equal(selectionProblem(lowest, order, 'Utkal cannot deliver before the 30th; the slab is on the 26th.'), null);
});

const order: PoEmailInput = {
  orgName: 'Demo Constructions',
  poNo: 'PO-2026-0007',
  poDate: '2026-10-24',
  vendorName: 'Odisha Steel & Cement Depot',
  contactPerson: 'N. Mishra',
  projectName: 'District Hospital Block B (G+3)',
  requestNo: 'MR-2026-0003',
  deliveryBy: '2026-10-30',
  deliveryAddress: null,
  paymentTerms: null,
  paymentDays: 30,
  remarks: 'Unloading <by the supplier>',
  subtotal: '100000.00',
  gstAmount: '18000.00',
  freight: '2500.00',
  total: '120500.00',
  lines: [{ itemName: 'OPC 53 cement', specification: 'IS 12269', make: 'UltraTech', unit: 'bag', quantity: '250', rate: '400.00', gstRate: '18', amount: '100000.00' }],
  buyer: { name: 'Arun Sharma', email: 'procurement@demo.com', phone: '9800000009' },
  portalUrl: null,
};

test('the email is the order: number, items, totals, delivery and payment', () => {
  const m = poEmail(order);
  assert.equal(m.subject, '[Demo Constructions] Purchase order PO-2026-0007');
  for (const s of ['PO-2026-0007', 'OPC 53 cement', 'Make: UltraTech', '250 bag', '₹400.00', '₹1,00,000.00', '₹2,500.00', '₹1,20,500.00', '30 days from invoice', 'Material request MR-2026-0003', '30 Oct 2026'])
    assert.ok(m.html.includes(s), `html has ${s}`);
  assert.match(m.text, /OPC 53 cement \(make UltraTech\): 250 bag @ ₹400\.00 \+ 18% GST = ₹1,00,000\.00/);
  assert.match(m.text, /order total ₹1,20,500\.00/);
});

test('remarks and names are escaped in the HTML', () => {
  const m = poEmail(order);
  assert.ok(m.html.includes('Unloading &lt;by the supplier&gt;'));
  assert.ok(!m.html.includes('<by the supplier>'));
  assert.ok(m.html.includes('Odisha Steel &amp; Cement Depot'));
});

test('without a portal login the vendor confirms with the buyer; with one, the button opens the portal', () => {
  const plain = poEmail(order);
  assert.match(plain.text, /Please confirm it with Arun Sharma, procurement@demo\.com, 9800000009\./);
  assert.ok(!plain.html.includes('Accept on the supplier portal'));
  const portal = poEmail({ ...order, portalUrl: 'https://erp.example.com/supplier/orders' });
  assert.ok(portal.html.includes('Accept on the supplier portal'));
  assert.ok(portal.html.includes('https://erp.example.com/supplier/orders'));
  assert.match(portal.text, /accept it on the supplier portal/);
});

test('no freight line when there is none, and the project stands in for a missing delivery address', () => {
  const m = poEmail({ ...order, freight: '0.00' });
  assert.ok(!m.html.includes('>Freight<'));
  assert.ok(!m.text.includes('freight'));
  assert.match(m.text, /Deliver to: District Hospital Block B \(G\+3\)/);
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
