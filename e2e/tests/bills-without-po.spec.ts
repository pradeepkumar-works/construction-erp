import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, formPanel, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Machine = { id: string; code: string; projectId: string | null };
type Preview = { hireQuantity: string; existingBill: { billNo: string } | null; logs: { id: string }[] };
type Bill = { id: string; billNo: string; kind: string; status: string; total: string; payable: string; debitNoteAmount: string; lines: { sortOrder: number }[]; sources?: { id: string }[] };
type Note = { id: string; noteNo: string; total: string; cancelledAt: string | null };

/** This month and the one before, as the API takes them (a hire bill usually comes after the month). */
const months = () => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return [ym(now), ym(prev)];
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Bills without a PO (v5 item 91): accounts records a hired machine's month from its approved logs, with a
 * mobilisation charge; a second bill for the same machine and month is refused. Once approved, a debit note raised from
 * the bill comes off what is payable, and cancelling it puts it back.
 */
test('record a hire bill from the logs, then raise a debit note on it', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  const md = await apiToken('md@demo.com');
  // A hired machine with approved logs in a month not yet billed (the seed bills GRD-01's).
  const machines = (await api<Page<Machine>>(accounts, '/equipment?ownership=HIRED&pageSize=50')).items.filter((m) => m.projectId);
  let pick: { machine: Machine; month: string; preview: Preview } | null = null;
  for (const machine of machines)
    for (const month of months()) {
      const preview = await api<Preview>(accounts, `/vendor-bills/hire-preview?equipmentId=${machine.id}&projectId=${machine.projectId}&month=${month}`);
      if (!pick && !preview.existingBill && Number(preview.hireQuantity) > 0) pick = { machine, month, preview };
    }
  expect(pick, 'a hired machine with approved logs not yet billed').not.toBeNull();
  const { machine, month, preview } = pick!;
  const project = await api<{ code: string }>(accounts, `/projects/${machine.projectId}`);
  const invoiceNo = `E2E-HIRE-${Date.now()}`;

  await signIn(page, 'accounts@demo.com');
  await page.goto('/vendor-bills');
  await page.getByRole('button', { name: 'Record vendor bill' }).first().click();
  await page.getByRole('menuitem', { name: /Machine hire/ }).click();
  const form = formPanel(page, 'Record vendor bill · Machine hire');
  await chooseOption(form.getByLabel('Project'), project.code);
  await chooseOption(form.getByLabel('Hired machine'), machine.code);
  const [y, m] = month.split('-');
  await form.getByLabel('Month billed').fill(`${MONTH_NAMES[Number(m) - 1]} ${y}`);
  await form.getByLabel('Month billed').press('Enter');
  await expect(form.getByText(`${preview.logs.length} approved log`)).toBeVisible();
  await form.getByLabel("Vendor's invoice no.").fill(invoiceNo);
  await form.getByRole('button', { name: 'Add a charge' }).click();
  await form.getByLabel('Description of line 1').fill('Mobilisation and demobilisation');
  await form.getByLabel('Quantity of line 1').fill('1');
  await form.getByLabel('Rate of line 1').fill('5000');
  await form.getByRole('button', { name: 'Save and submit' }).click();
  await expect(page.getByText(/VB-\d{4}-\d{4} submitted for approval/)).toBeVisible();

  const listed = (await api<Page<Bill>>(accounts, `/vendor-bills?q=${invoiceNo}`)).items[0];
  const bill = await api<Bill>(accounts, `/vendor-bills/${listed.id}`);
  expect(bill.kind).toBe('HIRE');
  expect(bill.status).toBe('SUBMITTED');
  expect(bill.lines.some((l) => l.sortOrder === 0)).toBe(true);
  expect(bill.lines.some((l) => l.sortOrder >= 10)).toBe(true);
  expect(bill.sources?.length).toBe(preview.logs.length);

  // The same machine and month cannot be billed twice.
  const twice = await fetch(`${API_URL}/vendor-bills`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accounts}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'HIRE', projectId: machine.projectId, equipmentId: machine.id, hireMonth: month, invoiceNo: `${invoiceNo}-2`, invoiceDate: new Date().toISOString().slice(0, 10), lines: [] }),
  });
  expect(twice.status).toBe(409);

  await api(md, `/approvals/vendor_bill/${bill.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  // A rate difference of 1,000 plus GST, raised from the bill's own page.
  await page.goto(`/vendor-bills/${bill.id}`);
  await page.getByRole('button', { name: 'New debit note' }).click();
  const note = formPanel(page, `New debit note · ${bill.billNo}`);
  await chooseOption(note.getByLabel('Reason'), 'Rate difference');
  await note.getByLabel('What line 1 is for').fill('Hire rate agreed at a lower figure');
  await note.getByLabel('Lump sum of line 1').fill('1000');
  await note.getByRole('button', { name: 'Save debit note' }).click();
  await expect(page.getByText(/DN-\d{4}-\d{4} raised/)).toBeVisible();

  const after = await api<Bill>(accounts, `/vendor-bills/${bill.id}`);
  expect(Number(after.debitNoteAmount)).toBe(1180);
  expect(Number(after.payable)).toBeCloseTo(Number(bill.payable) - 1180, 2);

  // Cancelling the note puts the bill back to what it was.
  const raised = (await api<Page<Note>>(accounts, `/debit-notes?vendorBillId=${bill.id}`)).items[0];
  await api(accounts, `/debit-notes/${raised.id}/cancel`, { method: 'POST', body: { note: 'Raised in a test' } });
  const restored = await api<Bill>(accounts, `/vendor-bills/${bill.id}`);
  expect(Number(restored.debitNoteAmount)).toBe(0);
  expect(restored.payable).toBe(bill.payable);
});
