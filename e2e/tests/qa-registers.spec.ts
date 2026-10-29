import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn } from './helpers';

type Lab = { id: string; name: string; kind: string; accreditation: string; active: boolean };
type Instrument = { id: string; name: string; state: string; dueOn: string | null; projectId: string | null };
type Register = { items: Instrument[]; overdue: number; dueSoon: number; outOfUse: number };
type Test = { id: string; testNo: string; labId: string | null; labName: string | null; instrumentId: string | null; outOfCalibration: boolean };
type Samples = { items: { testId: string; state: string; late: boolean }[]; total: number; atLab: number; late: number };

/**
 * QA/QC part 2 (item 137): the demo NABL lab's accreditation runs out next month, the site lab's scale is overdue; QA/QC
 * adds an instrument and calibrates it, records a test sent to the NABL lab and run on it, and the sample waits at the lab;
 * a site engineer cannot change the labs; the registers' pages open.
 */
test('labs, samples at them and the calibration register follow their rules', async ({ page }) => {
  const qa = await apiToken('qaqc@demo.com');
  const labs = await api<Lab[]>(qa, '/qa/labs');
  const nabl = labs.find((l) => l.kind === 'NABL');
  expect(nabl?.accreditation).toBe('EXPIRING');

  const register = await api<Register>(qa, '/qa/instruments');
  expect(register.overdue).toBeGreaterThan(0);
  const projectId = register.items.find((i) => i.projectId)?.projectId;
  expect(projectId).toBeTruthy();

  const name = `E2E slump cone ${Date.now()}`;
  const inst = await api<Instrument>(qa, '/qa/instruments', { method: 'POST', body: { name, kind: 'slump-cone', projectId } });
  expect(inst.state).toBe('NEVER');
  const today = localToday();
  const calibrated = await api<Instrument>(qa, `/qa/instruments/${inst.id}/calibrations`, { method: 'POST', body: { calibratedOn: today, certificateNo: 'E2E/CAL/1', agency: 'E2E lab', result: 'OK' } });
  expect(calibrated.state).toBe('OK');
  expect(calibrated.dueOn && calibrated.dueOn > today).toBeTruthy();

  const test = await api<Test>(qa, '/quality/tests', {
    method: 'POST',
    body: { projectId, kind: 'AGGREGATE', title: `E2E sieve analysis ${Date.now()}`, sampledOn: today, labId: nabl!.id, sentOn: today, instrumentId: inst.id, labCharge: '450.00' },
  });
  expect(test).toMatchObject({ labId: nabl!.id, instrumentId: inst.id, outOfCalibration: false });

  const samples = await api<Samples>(qa, `/qa/samples?labId=${nabl!.id}&state=AT_LAB&pageSize=100`);
  expect(samples.items.find((s) => s.testId === test.id)).toMatchObject({ state: 'AT_LAB', late: false });
  // The demo steel sample has waited past the usual ten days.
  expect(samples.late).toBeGreaterThan(0);

  // A report before the day sent is refused.
  await expect(api(qa, `/quality/tests/${test.id}`, { method: 'PATCH', body: { labId: nabl!.id, sentOn: today, reportOn: '2020-01-01' } })).rejects.toThrow(/400/);

  // The labs and the register are QA/QC's and the managers'.
  const engineer = await apiToken('engineer@demo.com');
  await expect(api(engineer, '/qa/labs', { method: 'POST', body: { name: 'E2E lab', kind: 'OUTSIDE' } })).rejects.toThrow(/403/);

  await signIn(page, 'qaqc@demo.com');
  await page.goto('/calibration');
  await expect(page.getByRole('heading', { name: 'Calibration register', level: 1 })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();
  await page.goto(`/lab-samples?labId=${nabl!.id}`);
  await expect(page.getByRole('heading', { name: 'Samples at labs', level: 1 })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: test.testNo })).toBeVisible();
  await page.goto('/test-certificates');
  await expect(page.getByRole('heading', { name: 'Test certificates', level: 1 })).toBeVisible();
  await page.goto('/qa-labs');
  await expect(page.getByRole('heading', { name: 'Labs', level: 1 })).toBeVisible();

  await api(qa, `/qa/instruments/${inst.id}`, { method: 'DELETE' }).catch(() => undefined);
});
