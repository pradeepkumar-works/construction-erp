import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import {
  RETURN_CHALLAN_HEADER,
  RETURN_DEDUCTEE_HEADER_26Q,
  depositDue,
  quarterOf,
  type BookVoucherDto,
  type PayrollRunDto,
  type PayslipDto,
  type TdsChallanDetailDto,
  type TdsQuarterDto,
  type TdsReturnForm,
  type TdsSuggestDto,
  type VendorPaymentDto,
} from '../../packages/shared/src';
import { api, apiToken, axeViolations, chooseOption, formPanel, localToday, measureTargets, pageOverflow, setAppearance, settle, signIn } from './helpers';

type Page_<T> = { items: T[] };
type Vendor = { id: string; name: string; pan: string | null };
type Project = { id: string; code: string; name: string };
type Bill = { id: string; billNo: string; status: string; total: string };
type Wo = { id: string; woNo: string; status: string; tdsPct: string; lines: { id: string }[] };
type SubBill = { id: string; label: string; status: string; grossAmount: string; gstAmount: string; totalDeductions: string; netPayable: string; deductions: { key: string; amount: string }[] };

/** A picture of the page for the review: into TDS_SHOTS when set, else the test's output. */
const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: process.env.TDS_SHOTS ? join(process.env.TDS_SHOTS, name) : test.info().outputPath(name), fullPage });
const n = (v: string | null | undefined) => Number(v ?? 0);
/** dd/mm/yyyy, which the date fields read. */
const typed = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
/** The day `months` months before `ymd`, on day `day`. */
const monthsBack = (ymd: string, months: number, day: number) => {
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1 - months, day));
  return d.toISOString().slice(0, 10);
};
/** A PAN no other vendor has: its fourth letter says who holds it (C company, F firm, P person). */
const newPan = (holder: string) => {
  const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${L()}${L()}${L()}${holder}${L()}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}${L()}`;
};
const serial = () => String(10000 + Math.floor(Math.random() * 89999));

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 1100 }, contextOptions: { reducedMotion: 'reduce' } });

const stamp = String(Date.now()).slice(-7);
const today = localToday();
// Last month's payments, so lane 4's challan goes in on its due day (the 7th) or today if that is earlier.
const lastMonth = monthsBack(today, 1, 15);
const onTime = depositDue(lastMonth) < today ? depositDue(lastMonth) : today;
// Lane 9's payment two months back: due on the 7th of the month after it, so a deposit today is always late.
const longAgo = monthsBack(today, 2, 15);
const q = quarterOf(lastMonth);
const qLate = quarterOf(longAgo);

let accounts: string;
let md: string;
let pm: string;
let road: Project;
let professional: Vendor;
let noPan: Vendor;
let tan: string;

const quarter = (form: TdsReturnForm, from: string) => api<TdsQuarterDto>(accounts, `/tds/quarter?form=${form}&periodFrom=${from}`);
const quarterUrl = (form: '26Q' | '24Q', from: string, tab: string) => `/tds?form=${form}&q=${from}&tab=${tab}`;

/** A bill for a professional or contractor's service, without a PO: 1 lump sum before 18% GST, approved by management. */
async function serviceBill(vendor: Vendor, rate: string, invoiceDate: string): Promise<Bill> {
  const bill = await api<Bill>(accounts, '/vendor-bills', {
    method: 'POST',
    body: { kind: 'OTHER', projectId: road.id, vendorId: vendor.id, expenseCategory: 'OTHER', invoiceNo: `E2E-TDS-${stamp}-${Math.floor(Math.random() * 1000)}`, invoiceDate, lines: [{ description: 'Design review (e2e TDS)', unit: 'LS', quantity: '1', rate, gstRate: '18' }], submit: true },
  });
  await api(md, `/approvals/vendor_bill/${bill.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  return bill;
}

/**
 * Pay a bill from its drawer, picking the TDS section and taking the TDS the form offers: the amount paid comes down by
 * it, so what the payment settles stays the bill's total. Returns the form for the picture before it is saved.
 */
async function payWithTds(page: Page, bill: Bill, section: string, paidOn: string, picture: string) {
  await page.goto(`/vendor-bills?id=${bill.id}`);
  const drawer = page.locator('.ant-drawer').filter({ hasText: 'Invoice total' });
  await drawer.getByRole('button', { name: 'Record payment' }).click();
  const modal = formPanel(page, /^Pay /);
  await modal.getByLabel('Paid on').fill(typed(paidOn));
  await modal.getByLabel('Paid on').press('Enter');
  await chooseOption(modal.getByLabel('TDS section'), section);
  const deduct = modal.getByRole('button', { name: /^Deduct ₹/ });
  await expect(deduct).toBeVisible();
  await deduct.click();
  await modal.getByLabel('UTR / cheque / voucher no.').fill(`E2E-TDS-${stamp}`);
  // The form as it is about to be saved: the window, not the list under it.
  await shot(page, picture, false);
  await modal.getByRole('button', { name: 'Record payment' }).click();
  await expect(modal).toBeHidden();
  return (await api<Page_<VendorPaymentDto>>(accounts, `/vendor-payments?vendorBillId=${bill.id}&pageSize=10`)).items[0];
}

/** Tick deductions by deductee on the quarter's Deductions tab and record their challan from the bulk bar. */
async function recordChallanFor(page: Page, names: string[], depositedOn: string, check?: (form: ReturnType<typeof formPanel>) => Promise<void>) {
  for (const name of names) await page.locator('tr').filter({ hasText: name }).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Record their challan' }).click();
  const form = formPanel(page, /Record challan · /);
  await form.getByLabel('Deposited on').fill(typed(depositedOn));
  await form.getByLabel('Deposited on').press('Enter');
  await form.getByLabel('BSR code').fill('0510308');
  await form.getByLabel('Challan serial no.').fill(serial());
  if (check) await check(form);
  await form.getByRole('button', { name: 'Record challan' }).click();
  await expect(form).toBeHidden();
}

test.beforeAll(async () => {
  accounts = await apiToken('accounts@demo.com');
  md = await apiToken('md@demo.com');
  pm = await apiToken('pm@demo.com');
  road = (await api<Page_<Project>>(pm, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  expect(road).toBeTruthy();
  professional = await api<Vendor>(md, '/vendors', { method: 'POST', body: { name: `Kalinga Design Consultants ${stamp}`, kinds: ['SERVICE'], pan: newPan('C') } });
  noPan = await api<Vendor>(md, '/vendors', { method: 'POST', body: { name: `Biju Earthmovers ${stamp}`, kinds: ['SERVICE'] } });
  tan = (await quarter('FORM_26Q', q.from)).tan!;
  expect(tan).toMatch(/^[A-Z]{4}\d{5}[A-Z]$/);
});

test('lane 1: approving a subcontractor bill writes its 194C deduction, its net payable and voucher as before', async ({ page }) => {
  const qs = await apiToken('qs@demo.com');
  const sub = await api<Vendor>(md, '/vendors', { method: 'POST', body: { name: `Mahanadi Builders ${stamp}`, kinds: ['SUBCONTRACTOR'], pan: newPan('F') } });
  const wo = await api<Wo>(pm, '/work-orders', {
    method: 'POST',
    body: { projectId: road.id, vendorId: sub.id, title: `Kerb stones, Km 12 (e2e TDS ${stamp})`, lines: [{ description: 'Kerb stones, laid', unit: 'LS', quantity: '1', rate: '100000' }], submit: true },
  });
  // A firm's PAN (fourth letter F) takes 2% under 194C.
  expect(wo.tdsPct).toBe('2');
  await api(md, `/approvals/work_order/${wo.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  const bill = await api<SubBill>(qs, '/subcontract-bills', { method: 'POST', body: { workOrderId: wo.id, billDate: today, quantities: [{ workOrderLineId: wo.lines[0].id, quantity: '1' }], invoiceNo: `MB/${stamp}`, submit: true } });
  await api(pm, `/approvals/subcontract_bill/${bill.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  // The bill's arithmetic is the bill's own: TDS 2% of the work, net payable the work and GST less what it deducts.
  const approved = await api<SubBill>(qs, `/subcontract-bills/${bill.id}`);
  expect(approved.status).toBe('APPROVED');
  expect(approved.grossAmount).toBe('100000.00');
  const tds = n(approved.deductions.find((d) => d.key === 'tds')?.amount);
  expect(tds).toBe(2000);
  expect(n(approved.netPayable)).toBeCloseTo(n(approved.grossAmount) + n(approved.gstAmount) - n(approved.totalDeductions), 2);

  // Its deduction: 194C at 2% on the work, dated the bill's day, waiting for its challan.
  const ded = (await quarter('FORM_26Q', quarterOf(today).from)).deductions.find((d) => d.sourceHref === `/subcontract-bills/${bill.id}`)!;
  expect(ded).toBeTruthy();
  expect([ded.section, n(ded.rate), n(ded.amountPaid), n(ded.tdsAmount), ded.paidOn, ded.state]).toEqual(['194C', 2, 100000, 2000, today, 'NOT_DEPOSITED']);

  // The voucher still balances to the bill, its TDS now credited to the 194C ledger.
  await api(accounts, '/books/post', { method: 'POST' });
  const book = await api<Page_<BookVoucherDto>>(accounts, `/books/day-book?source=SUBCONTRACT&from=${today}&to=${today}&pageSize=200`);
  const v = book.items.find((x) => x.sourceId === bill.id)!;
  expect(v).toBeTruthy();
  const dr = v.lines.reduce((t, l) => t + n(l.debit), 0);
  const cr = v.lines.reduce((t, l) => t + n(l.credit), 0);
  expect(dr).toBeCloseTo(cr, 2);
  expect(dr).toBeCloseTo(n(approved.grossAmount) + n(approved.gstAmount), 2);
  expect(n(v.lines.find((l) => l.accountName === 'TDS Payable 194C')?.credit)).toBe(2000);
  expect(n(v.lines.find((l) => l.accountName === sub.name)?.credit)).toBeCloseTo(n(approved.netPayable), 2);

  await signIn(page, 'accounts@demo.com');
  await page.goto(`/subcontract-bills/${bill.id}`);
  await expect(page.getByRole('heading', { name: new RegExp(`^${approved.label} · `) })).toBeVisible();
  await shot(page, 'tds-subbill.png');
});

test('lanes 2 and 3: a professional paid under 194J(b) at 10%, a vendor with no PAN at 20%', async ({ page }) => {
  await signIn(page, 'accounts@demo.com');

  const fees = await serviceBill(professional, '60000', monthsBack(today, 1, 10));
  const paid = await payWithTds(page, fees, '194J(b)', lastMonth, 'tds-194j.png');
  // TDS on the fee before GST: 10% of 60,000, the bill's 70,800 settled by 64,800 paid and 6,000 deducted.
  expect([paid.amount, paid.tdsAmount, paid.tds?.section, n(paid.tds?.rate)]).toEqual(['64800.00', '6000.00', '194J_B', 10]);

  const hire = await serviceBill(noPan, '50000', monthsBack(today, 1, 10));
  const suggested = await api<TdsSuggestDto>(accounts, `/tds/suggest?vendorId=${noPan.id}&section=194C&amount=59000&vendorBillId=${hire.id}&on=${lastMonth}`);
  expect([suggested.rate, suggested.reason, suggested.base, suggested.tds]).toEqual(['20', 'C', '50000.00', '10000.00']);
  const unpanned = await payWithTds(page, hire, '194C', lastMonth, 'tds-nopan.png');
  expect([unpanned.tdsAmount, unpanned.tds?.section, n(unpanned.tds?.rate)]).toEqual(['10000.00', '194C', 20]);

  // The payments list says the section and that the TDS is not deposited yet (a column of its own, from the chooser
  // where the table is narrower than all its columns).
  await page.goto('/payables?tab=payments');
  await page.getByPlaceholder(/^Search reference/).fill(professional.name);
  await page.getByPlaceholder(/^Search reference/).press('Enter');
  if (!(await page.locator('.ant-table-thead th').filter({ hasText: /^TDS$/ }).count())) {
    await page.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('checkbox', { name: 'TDS section and challan' }).check();
    await page.keyboard.press('Escape');
  }
  const row = page.locator('tr').filter({ hasText: professional.name });
  await expect(row.getByText('194J(b)')).toBeVisible();
  await expect(row.getByText('Not deposited')).toBeVisible();
});

test("lane 4: one challan for last month's deductions, each showing it", async ({ page }) => {
  await signIn(page, 'accounts@demo.com');
  await page.goto(quarterUrl('26Q', q.from, 'deductions'));
  await recordChallanFor(page, [professional.name, noPan.name], onTime);

  const after = await quarter('FORM_26Q', q.from);
  const mine = after.deductions.filter((d) => d.vendorId === professional.id || d.vendorId === noPan.id);
  expect(mine).toHaveLength(2);
  const challanId = mine[0].challanId!;
  expect(challanId).toBeTruthy();
  expect(mine.every((d) => d.challanId === challanId && d.state === 'DEPOSITED' && n(d.interest) === 0)).toBe(true);
  const challan = after.challans.find((c) => c.id === challanId)!;
  expect([n(challan.tax), challan.late, challan.depositedOn]).toEqual([16000, false, onTime]);

  // Each row shows the challan it went in by.
  for (const name of [professional.name, noPan.name]) await expect(page.locator('tr').filter({ hasText: name }).getByRole('link', { name: challan.label })).toBeVisible();
  await page.locator('tr').filter({ hasText: professional.name }).getByRole('link', { name: challan.label }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`^Challan · ${challan.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })).toBeVisible();
  await expect(page.locator('main').getByText(professional.name)).toBeVisible();
  await expect(page.locator('main').getByText(noPan.name)).toBeVisible();
  await shot(page, 'tds-challan.png');

  // The challan's payment is in the books: TDS by section out of the bank.
  await api(accounts, '/books/post', { method: 'POST' });
  const book = await api<Page_<BookVoucherDto>>(accounts, `/books/day-book?source=TDS_CHALLAN&from=${onTime}&to=${onTime}&pageSize=200`);
  const v = book.items.find((x) => x.sourceId === challanId)!;
  expect(n(v.lines.find((l) => l.accountName === 'TDS Payable 194J(b)')?.debit)).toBe(6000);
  expect(n(v.lines.find((l) => l.accountName === 'TDS Payable 194C')?.debit)).toBe(10000);
});

test("lane 5: the quarter's 26Q, its totals by section the deductions' and what blocks filing listed", async ({ page }) => {
  const r = await quarter('FORM_26Q', q.from);
  const sum = (xs: { tdsAmount: string }[]) => Math.round(xs.reduce((t, d) => t + n(d.tdsAmount), 0) * 100) / 100;
  expect(n(r.totals.tds)).toBeCloseTo(sum(r.deductions), 2);
  expect(r.bySection.reduce((t, s) => t + s.deductions, 0)).toBe(r.deductions.length);
  for (const s of r.bySection) {
    const of = r.deductions.filter((d) => d.section === s.section);
    expect([s.deductions, n(s.tds)], `section ${s.name}`).toEqual([of.length, sum(of)]);
  }
  // The vendor with no PAN goes as PANNOTAVBL, at the 20% that allows; it warns but does not block.
  const unpanned = r.deductions.find((d) => d.vendorId === noPan.id)!;
  expect(r.problems.find((p) => p.deductionId === unpanned.id)).toMatchObject({ kind: 'PAN_MISSING', blocks: false });

  await signIn(page, 'accounts@demo.com');
  await page.goto(quarterUrl('26Q', q.from, 'fix'));
  await expect(page.getByRole('heading', { level: 1, name: 'TDS returns' })).toBeVisible();
  await expect(page.getByText('TDS deducted', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`${noPan.name} has no PAN: the row goes as PANNOTAVBL. Add their PAN`)).toBeVisible();
  const blocking = r.problems.filter((p) => p.blocks);
  if (blocking.length) await expect(page.getByText(blocking[0].text)).toBeVisible();
  await shot(page, 'tds-26q.png');

  await page.getByRole('tab', { name: 'By section' }).click();
  await expect(page.locator('tr').filter({ hasText: '194J(b)' }).first()).toBeVisible();
});

test("lane 9: a deposit after the 7th owes interest under 201(1A), by the month", async ({ page }) => {
  // Above the 50,000 a year 194J(b) lets go untaxed on its own, since it is the vendor's first payment of the year.
  const bill = await serviceBill(professional, '60000', monthsBack(today, 2, 10));
  const s = await api<TdsSuggestDto>(accounts, `/tds/suggest?vendorId=${professional.id}&section=194J_B&amount=70800&vendorBillId=${bill.id}&on=${longAgo}`);
  expect(s.tds).toBe('6000.00');
  await api(accounts, '/vendor-payments', { method: 'POST', body: { vendorBillId: bill.id, paymentDate: longAgo, amount: '64800', tdsAmount: s.tds, tdsSection: '194J_B', mode: 'BANK', reference: `E2E-TDS-LATE-${stamp}` } });
  // Deducted two months back, deposited today: that month, the next and this one, at 1.5% each.
  const months = 3;
  const interest = Math.round(6000 * 0.015 * months);

  await signIn(page, 'accounts@demo.com');
  await page.goto(quarterUrl('26Q', qLate.from, 'deductions'));
  const row = page.locator('tr').filter({ hasText: professional.name }).filter({ hasText: 'Not deposited' });
  await expect(row).toHaveCount(1);
  await recordChallanFor(page, [professional.name], today, async (form) => {
    await expect(form.getByText(new RegExp(`₹\\s?${interest}\\.00 by the dates, ${months} months at most`))).toBeVisible();
  });

  const r = await quarter('FORM_26Q', qLate.from);
  const d = r.deductions.find((x) => x.vendorId === professional.id && x.paidOn === longAgo)!;
  expect([d.state, d.interestMonths, n(d.interest)]).toEqual(['DEPOSITED', months, interest]);
  const challan = await api<TdsChallanDetailDto>(accounts, `/tds/challans/${d.challanId}`);
  expect([challan.late, challan.interestMonths, n(challan.interest), n(challan.interestDue)]).toEqual([true, months, interest, interest]);

  await page.goto(`/tds/challans/${challan.id}`);
  await expect(page.getByText(`Deposited late: ${months} months at 1.5%`)).toBeVisible();
  await expect(page.getByText('Interest on late TDS').first()).toBeVisible();
  await shot(page, 'tds-late.png');
});

test("lane 6: the 26Q file in the utility's columns, a row for each deduction under its challan", async ({ page }) => {
  // Clear what blocks the quarter: confirm a section left to confirm and deposit what is left today.
  let r = await quarter('FORM_26Q', q.from);
  for (const d of r.deductions.filter((x) => x.state === 'TO_CONFIRM' && x.canConfirm)) await api(accounts, `/tds/deductions/${d.id}`, { method: 'PATCH', body: { section: '194C' } });
  r = await quarter('FORM_26Q', q.from);
  const waiting = r.deductions.filter((d) => d.state === 'NOT_DEPOSITED');
  if (waiting.length) await api(accounts, '/tds/challans', { method: 'POST', body: { form: 'FORM_26Q', bsrCode: '0510308', challanSerial: serial(), depositedOn: today, deductionIds: waiting.map((d) => d.id) } });
  r = await quarter('FORM_26Q', q.from);
  expect(r.problems.filter((p) => p.blocks)).toEqual([]);
  expect(r.can.exportFile).toBe(true);

  await signIn(page, 'accounts@demo.com');
  await page.goto(quarterUrl('26Q', q.from, 'deductions'));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Return file' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${tan}_26Q_Q${q.quarter}_${q.fy}.xlsx`);
  const book = XLSX.read(await readFile(await file.path()), { type: 'buffer' });
  const rows = (name: string) => XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], { header: 1, raw: false, defval: '' });
  expect(book.SheetNames).toHaveLength(2);
  const [challans, deductees] = book.SheetNames.map(rows);
  expect(challans[0]).toEqual([...RETURN_CHALLAN_HEADER]);
  expect(deductees[0]).toEqual([...RETURN_DEDUCTEE_HEADER_26Q]);
  expect(challans).toHaveLength(r.challans.length + 1);
  expect(deductees).toHaveLength(r.deductions.length + 1);

  // The professional's row: under its challan's number, company code 01, 194J(b) as the utility codes it, 10%.
  const col = (h: (typeof RETURN_DEDUCTEE_HEADER_26Q)[number]) => RETURN_DEDUCTEE_HEADER_26Q.indexOf(h);
  const row = deductees.find((x) => x[col('PAN of the deductee')] === professional.pan)!;
  expect(row).toBeTruthy();
  expect([row[col('Deductee code (01 Company, 02 Other than company)')], row[col('Section code')], row[col('Amount paid or credited')], row[col('TDS')], row[col('Total tax deposited')], row[col('Rate at which deducted')]]).toEqual(['01', '4JB', '60000.00', '6000.00', '6000.00', '10']);
  const challanRow = challans[Number(row[col('Challan Sr. No.')])];
  expect(challanRow[RETURN_CHALLAN_HEADER.indexOf('BSR code')]).toBe('0510308');
  // The vendor with no PAN goes as PANNOTAVBL with reason C (higher rate, no PAN).
  const unpanned = deductees.find((x) => x[col('Name of the deductee')] === noPan.name)!;
  expect([unpanned[col('PAN of the deductee')], unpanned[col('Reason for non-deduction, lower or higher deduction')]]).toEqual(['PANNOTAVBL', 'C']);

  // A picture of the file as the utility will read it.
  const table = (sheet: string[][]) =>
    `<table><thead><tr>${sheet[0].map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${sheet
      .slice(1)
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  await page.setContent(
    `<style>body{font:12px system-ui;margin:16px}table{border-collapse:collapse;margin-bottom:24px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f2f2f2;max-width:120px}</style><h1>${file.suggestedFilename()}</h1><h2>${book.SheetNames[0]}</h2>${table(challans)}<h2>${book.SheetNames[1]}</h2>${table(deductees)}`,
  );
  await shot(page, 'tds-26q-file.png');
});

test('lane 7: the 24Q after approved salary runs, each employee as their payslips', async ({ page }) => {
  const runs = await api<PayrollRunDto[] | Page_<PayrollRunDto>>(md, '/payroll/runs');
  const settled = (Array.isArray(runs) ? runs : runs.items).filter((r) => r.status === 'APPROVED' || r.status === 'PAID');
  expect(settled.length).toBeGreaterThan(0);
  const latest = settled.map((r) => r.month).sort().at(-1)!;
  const q24 = quarterOf(`${latest}-01`);
  const inQuarter = settled.filter((r) => `${r.month}-01` >= q24.from && `${r.month}-01` <= q24.to);
  const slips = (await Promise.all(inQuarter.map((r) => api<{ payslips: PayslipDto[] }>(md, `/payroll/runs/${r.id}`)))).flatMap((d) => d.payslips);
  const expected = new Map<string, number>();
  for (const s of slips) {
    const tds = s.lines.filter((l) => l.code === 'TDS').reduce((t, l) => t + n(l.amount), 0);
    if (tds > 0) expected.set(s.employeeId, (expected.get(s.employeeId) ?? 0) + tds);
  }
  expect(expected.size).toBeGreaterThan(0);

  const r = await quarter('FORM_24Q', q24.from);
  expect(r.deductions.every((d) => d.section === '192')).toBe(true);
  expect(new Map(r.deductees.map((d) => [d.employeeId!, n(d.tds)]))).toEqual(expected);

  await signIn(page, 'accounts@demo.com');
  await page.goto(quarterUrl('24Q', q24.from, 'deductees'));
  await expect(page.getByRole('heading', { level: 1, name: 'TDS returns' })).toBeVisible();
  const first = r.deductees[0];
  await expect(page.locator('tr').filter({ hasText: first.name })).toBeVisible();
  await shot(page, 'tds-24q.png');
});

test('lane 8: Form 16A for one vendor with the TAN, their PAN, each payment and the challans', async ({ page }) => {
  const r = await quarter('FORM_26Q', q.from);
  const theirs = r.deductions.filter((d) => d.vendorId === professional.id);
  const challans = r.challans.filter((c) => theirs.some((d) => d.challanId === c.id));
  expect(theirs.length).toBeGreaterThan(0);

  await signIn(page, 'accounts@demo.com');
  await page.goto(quarterUrl('26Q', q.from, 'deductees'));
  const popup = page.waitForEvent('popup');
  await page.locator('tr').filter({ hasText: professional.name }).getByRole('button', { name: 'Print 16A' }).click();
  const paper = await popup;
  await expect(paper.getByRole('heading', { name: 'Statement of TDS' })).toBeVisible();
  await expect(paper.getByText(tan, { exact: true })).toBeVisible();
  await expect(paper.getByText(professional.pan!, { exact: true })).toBeVisible();
  const rows = paper.locator('tbody tr');
  for (const d of theirs) await expect(rows.filter({ hasText: d.sourceLabel })).toHaveCount(1);
  for (const c of challans) {
    await expect(paper.getByText(c.challanSerial, { exact: true })).toBeVisible();
    await expect(rows.filter({ hasText: c.label }).first()).toBeVisible();
  }
  await expect(paper.getByText(/Form 16A, downloaded from TRACES/)).toBeVisible();
  await shot(paper, 'tds-16a.png');
  await paper.close();
});

/** Lane 10: the new pages on a phone in the dark theme: axe, one heading, 44 px targets, nothing scrolling sideways. */
async function phoneCheck(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await setAppearance(page, 'dark');
  await signIn(page, 'accounts@demo.com');
  const r = await quarter('FORM_26Q', q.from);
  const found: string[] = [];
  for (const url of [quarterUrl('26Q', q.from, 'fix'), quarterUrl('26Q', q.from, 'deductions'), quarterUrl('26Q', q.from, 'challans'), quarterUrl('24Q', q.from, 'deductees'), `/tds/challans/${r.challans[0].id}`]) {
    await settle(page, url);
    const h1 = await page.locator('h1').count();
    if (h1 !== 1) found.push(`${url} has ${h1} <h1>`);
    found.push(...(await axeViolations(page)).map((v) => `${url} axe ${v}`));
    const { targets, text } = await page.evaluate(measureTargets, 44);
    found.push(...targets.map((t) => `${url} target under 44 px: ${t.what} ${t.size}`), ...text.map((t) => `${url} text under 12 px: ${t.what} ${t.size}`));
    const over = await pageOverflow(page);
    if (over > 0) found.push(`${url} scrolls sideways by ${over} px`);
  }
  // Last: a full-page picture resizes the window, and the touch screen's sizes go with it.
  await settle(page, quarterUrl('26Q', q.from, 'deductions'));
  await shot(page, 'tds-walk-390-dark.png');
  await context.close();
  return found;
}

test('lane 10: TDS returns and a challan on a phone in the dark theme', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  expect(await phoneCheck(browser, baseURL)).toEqual([]);
});
