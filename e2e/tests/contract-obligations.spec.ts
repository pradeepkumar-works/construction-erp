import { expect, test } from '@playwright/test';
import type { ContractObligationsDto, RaBillDto } from '../../packages/shared/src';
import { api, apiToken, signIn } from './helpers';

/**
 * Contract obligations and recoveries (item 167) on the town water scheme: the seed puts the standard obligations on its
 * contract before RA bills 1 to 4, so bill 1 withholds for the late programme and recovers for the staff deployed late,
 * and bill 2 gives the withholding back. The project manager adds an obligation, is refused a penalty on what the client
 * owes, marks it met and deletes it again, so nothing is left behind.
 */

type Project = { id: string; code: string };

test('obligations fall due from the contract, cost the bills what they say and give back what is met', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const qs = await apiToken('qs@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  const town = (await api<{ items: Project[] }>(pm, '/projects?pageSize=100')).items.find((p) => p.code === 'WS-2026-04')!;
  const base = `/projects/${town.id}/contract/obligations`;

  const list = await api<ContractObligationsDto>(qs, base);
  const byCode = (code: string) => list.obligations.find((o) => o.code === code)!;
  expect(list.canEdit).toBe(false);
  expect(list.standardMissing).toEqual([]);
  expect(byCode('PROGRAMME').state).toBe('MET_LATE');
  expect(Number(byCode('PROGRAMME').deducted)).toBe(0);
  expect(Number(byCode('TECHNICAL_STAFF').deducted)).toBe(60000);
  expect(byCode('FINAL_ACCOUNT').state).toBe('NO_DATE');
  expect(list.obligations.find((o) => o.anchor === 'DATE')!.state).toBe('DUE_SOON');
  await expect(api(engineer, base)).rejects.toThrow(/403/);
  await expect(api(qs, base, { method: 'POST', body: { title: 'Anything', anchor: 'START' } })).rejects.toThrow(/403/);

  // Bill 1 recovers 0.2% of the contract for the programme and three months of staff; bill 2 gives the 0.2% back.
  const bills = (await api<{ items: RaBillDto[] }>(qs, `/ra-bills?projectId=${town.id}&pageSize=10`)).items;
  const bill = async (n: number) => api<RaBillDto>(qs, `/ra-bills/${bills.find((b) => b.billNo === n)!.id}`);
  const first = await bill(1);
  expect(first.obligationLines.map((l) => [l.title, Number(l.amount)])).toEqual([
    ['Submit the construction programme', 768000],
    ['Deploy the technical staff the bid named', 60000],
  ]);
  expect(first.deductions.find((d) => d.key === 'obligations')!.label).toBe('Contract recoveries');
  const second = await bill(2);
  expect(Number(second.obligationRecovery)).toBe(-768000);
  expect(second.deductions.find((d) => d.key === 'obligations')!.label).toBe('Contract recoveries given back');

  // The project manager adds one; what the client owes carries no penalty; marking it met clears it.
  await expect(api(pm, base, { method: 'POST', body: { title: 'Release the land for the zone 3 tank', party: 'CLIENT', anchor: 'START', offsetMonths: 1, penalty: 'ONCE_AMOUNT', penaltyValue: '5000' } })).rejects.toThrow(/400/);
  const added = await api<ContractObligationsDto>(pm, base, { method: 'POST', body: { title: 'Submit the quality assurance plan', clause: 'GCC 17.1', anchor: 'START', offsetDays: 30, penalty: 'ONCE_AMOUNT', penaltyValue: '25000' } });
  const qap = added.obligations.find((o) => o.title === 'Submit the quality assurance plan')!;
  try {
    expect(qap.state).toBe('OVERDUE');
    expect(Number(qap.penaltyToDate)).toBe(25000);
    const met = await api<ContractObligationsDto>(pm, `${base}/${qap.id}`, { method: 'PATCH', body: { metOn: new Date().toISOString().slice(0, 10) } });
    expect(met.obligations.find((o) => o.id === qap.id)!.state).toBe('MET_LATE');
    // An obligation a bill deducted for stays on the record.
    await expect(api(pm, `${base}/${byCode('TECHNICAL_STAFF').id}`, { method: 'DELETE' })).rejects.toThrow(/409/);

    // On screen: the Contract tab lists them, and bill 1 shows its recoveries.
    await signIn(page, 'pm@demo.com');
    await page.goto(`/projects/${town.id}?tab=contract`);
    await expect(page.getByRole('heading', { name: 'Obligations and recoveries' })).toBeVisible();
    await expect(page.getByText('Submit the quality assurance plan')).toBeVisible();
    await page.goto(`/bills/${first.id}`);
    await expect(page.getByText(/This bill recovers/).first()).toBeVisible();
  } finally {
    await api(pm, `${base}/${qap.id}`, { method: 'DELETE' });
  }
});
