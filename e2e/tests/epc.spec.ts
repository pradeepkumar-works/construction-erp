import { expect, test } from '@playwright/test';
import type { BillingBreakupDto, EpcDto, ProjectContractDto, RaBillDto, ReceiptDto } from '../../packages/shared/src';
import { api, apiToken, axeViolations, signIn } from './helpers';

/**
 * EPC (item 130) on the island sewerage scheme, an EPC contract in US dollars kept in rupees at ₹ 83.25: the seed gives
 * it 24 design deliverables, ten equipment packages (the air blowers at sea, late for erection), five client inputs (the
 * 11 kV supply overdue) and three milestone bills, two paid at the day's rate. Everything a test adds is removed again.
 */

type Project = { id: string; code: string };
const CODE = 'EPC-2026-07';

test('deliverables, packages and client inputs drive the milestone payments of an EPC contract in dollars', async ({ page }) => {
  const pm = await apiToken('pm2@demo.com');
  const qs = await apiToken('qs@demo.com');
  const buyer = await apiToken('procurement@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  const epc = (await api<{ items: Project[] }>(pm, '/projects?pageSize=100')).items.find((p) => p.code === CODE)!;
  const base = `/projects/${epc.id}/epc`;

  // What the tab reads: the late blowers, the overdue power supply, and the payment stages each deliverable releases.
  const data = await api<EpcDto>(pm, base);
  expect(data.currency).toBe('USD');
  expect(data.summary.deliverables).toBe(24);
  expect(data.summary.disciplines.map((d) => d.discipline)).toEqual(['PROCESS', 'CIVIL', 'MECHANICAL', 'ELECTRICAL', 'INSTRUMENTATION']);
  const blowers = data.packages.find((p) => p.code === 'PKG-03')!;
  expect(blowers.forecastFrom).toBe('ETA');
  expect(blowers.lateDays).toBeGreaterThan(3);
  expect(data.clientInputs.find((m) => m.name.startsWith('11 kV'))!.overdueDays).toBeGreaterThan(0);
  expect(data.deliverables.find((d) => d.code === 'CIV-004')!.releases.length).toBeGreaterThan(0);

  // Who changes what: document control the deliverables, purchase the packages; an engineer reads only.
  expect(data.canEditDeliverables && data.canEditPackages).toBe(true);
  expect((await api<EpcDto>(engineer, base)).canEditDeliverables).toBe(false);
  await expect(api(engineer, `${base}/deliverables`, { method: 'PUT', body: { discipline: 'CIVIL', code: 'E2E-1', title: 'x' } })).rejects.toThrow(/403/);
  await expect(api(qs, `${base}/packages`, { method: 'PUT', body: { code: 'E2E-1', name: 'x', discipline: 'MECHANICAL' } })).rejects.toThrow(/403/);

  // A deliverable sent back with code C cannot carry an approval date; with code B it needs one.
  const stamp = Date.now().toString().slice(-6);
  const code = `E2E-${stamp}`;
  await expect(api(qs, `${base}/deliverables`, { method: 'PUT', body: { discipline: 'CIVIL', code, title: 'Outfall diffuser drawings', submittedOn: '2026-09-01', approvalCode: 'C', approvedOn: '2026-09-10' } })).rejects.toThrow(/400/);
  let after = await api<EpcDto>(qs, `${base}/deliverables`, { method: 'PUT', body: { discipline: 'CIVIL', code, title: 'Outfall diffuser drawings', submittedOn: '2026-09-01', approvalCode: 'C' } });
  const mine = after.deliverables.find((d) => d.code === code)!;
  expect(mine.status).toBe('COMMENTS');
  await expect(api(qs, `${base}/deliverables`, { method: 'PUT', body: { discipline: 'CIVIL', code, title: 'Duplicate' } })).rejects.toThrow(/409/);
  after = await api<EpcDto>(qs, `${base}/deliverables/${mine.id}`, { method: 'DELETE' });
  expect(after.deliverables.some((d) => d.code === code)).toBe(false);

  // A package's stages: actual dates out of order show as a problem, and the plan moves its forecast.
  after = await api<EpcDto>(buyer, `${base}/packages`, {
    method: 'PUT',
    body: {
      code, name: 'Outfall diffuser valves', discipline: 'MECHANICAL', neededOn: '2027-03-01',
      stages: [{ stage: 'ORDERED', actualOn: '2026-09-10' }, { stage: 'DRAWINGS_APPROVED', plannedOn: '2026-09-01', actualOn: '2026-09-05' }, { stage: 'DELIVERED', plannedOn: '2027-01-15' }],
    },
  });
  const pkg = after.packages.find((p) => p.code === code)!;
  expect(pkg.problems.length).toBe(1);
  expect(pkg.currentStage).toBe('DRAWINGS_APPROVED');
  expect(pkg.forecastFrom).toBe('PLAN');
  await expect(api(buyer, `${base}/packages`, { method: 'PUT', body: { code: `${code}-F`, name: 'x', discipline: 'MECHANICAL', stages: [{ stage: 'ORDERED', actualOn: '2099-01-01' }] } })).rejects.toThrow(/400/);
  await api(buyer, `${base}/packages/${pkg.id}`, { method: 'DELETE' });

  // A package a payment stage reads cannot be removed.
  const breakup = await api<BillingBreakupDto>(qs, `/projects/${epc.id}/billing-breakup`);
  expect(breakup.currency).toBe('USD');
  const supply = breakup.components.flatMap((c) => c.stages).find((s) => s.packageIds.length > 0)!;
  expect(supply.trigger).toBe('SUPPLY');
  await expect(api(buyer, `${base}/packages/${supply.packageIds[0]}`, { method: 'DELETE' })).rejects.toThrow(/409/);
  expect(breakup.components.flatMap((c) => c.stages).some((s) => s.deliverableIds.length > 0 && s.evidencePct === 100)).toBe(true);

  // The overdue power supply becomes a delay the client answers for; removing the delay frees it again.
  const power = data.clientInputs.find((m) => m.name.startsWith('11 kV'))!;
  const recorded = await api<EpcDto>(pm, `${base}/client-inputs/${power.id}/delay`, { method: 'POST' });
  const delay = recorded.clientInputs.find((m) => m.id === power.id)!;
  expect(delay.delayNo).toMatch(/^RISK-/);
  await expect(api(pm, `${base}/client-inputs/${power.id}/delay`, { method: 'POST' })).rejects.toThrow(/409/);
  await api(pm, `/risks/${delay.delayId}`, { method: 'DELETE' });

  // The contract's currency cannot move once bills are kept at its rate; a paid bill shows what the bank credited.
  const contract = await api<ProjectContractDto>(pm, `/projects/${epc.id}/contract`);
  expect(contract.currency).toBe('USD');
  expect(Number(contract.exchangeRate)).toBe(83.25);
  await expect(api(pm, `/projects/${epc.id}/contract`, { method: 'PUT', body: { currency: 'EUR', exchangeRate: '90' } })).rejects.toThrow(/409/);
  const receipts = (await api<{ items: ReceiptDto[] }>(pm, `/receipts?projectId=${epc.id}&pageSize=10`)).items;
  expect(receipts.length).toBe(2);
  expect(receipts.every((r) => r.currency === 'USD' && r.exchangeRate !== null && r.bankCredit !== r.amount)).toBe(true);
  const first = (await api<{ items: RaBillDto[] }>(pm, `/ra-bills?projectId=${epc.id}&pageSize=10`)).items.find((b) => b.billNo === 1)!;

  // On screen: the tab in dollars, the late package, and the bill in the contract's currency.
  await signIn(page, 'pm2@demo.com');
  await page.goto(`/projects/${epc.id}?tab=epc`);
  await expect(page.getByText('Engineering approved')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByText(/^Packages \(/).click();
  await expect(page.getByText(/days late for site/).first()).toBeVisible();
  await expect(page.getByText(/reach(es)? site after it is needed/)).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByText(/^Client inputs \(/).click();
  await expect(page.getByRole('button', { name: 'Record delay' })).toBeVisible();
  await page.goto(`/bills/${first.id}`);
  await expect(page.getByText(/^US\$/).first()).toBeVisible();
  await expect(page.getByText('Contract rate')).toBeVisible();
});
