import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, formPanel, localToday, signIn } from './helpers';

type Punch = { pin: string; time: string; result: string; note: string | null; personName: string | null };
type Me = { today: { checkIn: string | null; checkOut: string | null; status: string } | null };
type Ingest = { received: number; added: number; duplicates: number; applied: number; unmatched: number; notMarked: number; errors: string[] };

const ORIGIN = API_URL.replace(/\/api\/?$/, '');
/** The seeded gate terminal (ADMS) and head office face reader (webhook), from `seedBiometric`. */
const GATE_SN = 'ZKDEMO0001';
const HO_KEY = 'bio_demo_demo_headoffice';

/**
 * Biometric attendance: a ZKTeco-style device hands its punches over ADMS and they mark the staff member
 * enrolled under that number; the same upload again adds nothing; an unknown device or key is refused; a worker punching
 * on a device with no site is not marked; HR imports a punch file, matches an unknown number on the page and its punches
 * mark attendance.
 */
test('device punches mark attendance, and HR matches the numbers it does not know', async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  const qaqc = await apiToken('qaqc@demo.com');
  const today = localToday();

  // ADMS: the handshake, then the ATTLOG table (EMP-011 is enrolled as 11).
  const hello = await fetch(`${ORIGIN}/iclock/cdata?SN=${GATE_SN}&options=all&pushver=2.4.1`);
  expect(hello.status).toBe(200);
  expect(await hello.text()).toContain(`GET OPTION FROM: ${GATE_SN}`);
  expect((await fetch(`${ORIGIN}/iclock/cdata?SN=NOTREGISTERED1`)).status).toBe(401);
  const attlog = `00011\t${today} 09:02:00\t0\t1\t0\n11\t${today} 17:30:00\t1\t1\t0\n4242\t${today} 08:30:00\t0\t1\t0\n`;
  const post = () => fetch(`${ORIGIN}/iclock/cdata?SN=${GATE_SN}&table=ATTLOG&Stamp=1`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: attlog });
  expect(await (await post()).text()).toBe('OK: 3');
  expect(await (await post()).text()).toBe('OK: 3');
  const elevens = await api<Punch[]>(hr, `/biometric/punches?date=${today}&pin=11`);
  expect(elevens.map((p) => p.time).sort()).toEqual(['09:02', '17:30']);
  expect(elevens.every((p) => p.result === 'APPLIED' && p.personName === 'Sneha Iyer')).toBe(true);
  const me = await api<Me>(qaqc, '/staff/me');
  expect(me.today?.checkIn).toBe(`${today}T03:32:00.000Z`);
  expect(me.today?.checkOut).toBe(`${today}T12:00:00.000Z`);
  expect(me.today?.status).toBe('PRESENT');
  await expect(api(qaqc, '/biometric/punches')).rejects.toThrow(/403/);

  // Webhook: the face reader at head office has no site, so a worker punching there is not marked.
  const hook = (key: string, body: unknown) => fetch(`${API_URL}/biometric/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-key': key }, body: JSON.stringify(body) });
  expect((await hook('wrong-key', { punches: [] })).status).toBe(401);
  const r = (await (await hook(HO_KEY, { punches: [{ pin: 1001, time: `${today}T08:10:00+05:30` }, { pin: '1001', time: 'yesterday' }] })).json()) as Ingest;
  expect(r).toMatchObject({ received: 1, notMarked: 1 });
  expect(r.errors[0]).toMatch(/does not read/);
  const skipped = (await api<Punch[]>(hr, `/biometric/punches?date=${today}&pin=1001`)).find((p) => p.time === '08:10')!;
  expect(skipped.result).toBe('SKIPPED');
  expect(skipped.note).toMatch(/no site/);

  // On the page: import a punch file from the yard terminal, then match 4242 to Rina Sahu.
  await signIn(page, 'hr@demo.com');
  await page.getByRole('link', { name: 'Biometric devices', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Biometric devices' })).toBeVisible();
  await page.getByRole('button', { name: 'Import punch file' }).click();
  const imp = formPanel(page, 'Import a punch file');
  await chooseOption(imp.getByLabel('From device'), 'Yard terminal');
  await imp.locator('input[type=file]').setInputFiles({ name: 'yard.csv', mimeType: 'text/csv', buffer: Buffer.from(`User ID,Date,Time\r\n4242,${today},12:10\r\n4242,bad date,12:00\r\n`) });
  await expect(imp.getByText('yard.csv')).toBeVisible();
  await imp.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText(/^1 punch read: [01] new .* 1 line could not be read: Line 3/)).toBeVisible();
  await expect(page.getByRole('row', { name: /4242.*Not matched/ }).first()).toBeVisible();

  await page.getByRole('tab', { name: 'People on devices' }).click();
  await page.getByRole('button', { name: 'Match user number 4242' }).click();
  const match = formPanel(page, 'Who is user number 4242?');
  await chooseOption(match.getByLabel('Employee', { exact: true }), 'Rina Sahu');
  await match.getByRole('button', { name: 'Match' }).click();
  await expect(page.getByText('User number 4242 matched; 1 day of punches marked')).toBeVisible();
  const rina = await api<Punch[]>(hr, `/biometric/punches?date=${today}&pin=4242`);
  expect(rina.map((p) => [p.time, p.result])).toEqual([
    ['12:10', 'APPLIED'],
    ['08:30', 'APPLIED'],
  ]);
  await api(hr, '/biometric/users/4242', { method: 'PUT', body: { employeeId: null, workerId: null } });

  // The gate terminal's setup shows what to enter on the device.
  await page.getByRole('tab', { name: 'Devices', exact: true }).click();
  await page.getByRole('button', { name: 'Set up Gate terminal' }).click();
  await expect(page.getByRole('dialog', { name: 'Set up Gate terminal' }).getByText(GATE_SN)).toBeVisible();
});

type Command = { kind: string; pin: string | null; status: string; note: string | null };
type BioUser = { pin: string; onDevices: number; commandsWaiting: number };

/**
 * Biometric device commands: HR puts a person on the gate terminal from the page and takes them off; the
 * terminal is handed each command when it asks, and its answer closes it, done or refused. Only HR and the like may.
 */
test('HR puts a person on the gate terminal and takes them off, and the terminal answers each command', async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  const ask = async () => (await (await fetch(`${ORIGIN}/iclock/getrequest?SN=${GATE_SN}`)).text()).split('\n').filter((l) => l.startsWith('C:'));
  const answer = (lines: string[], code = 0) =>
    fetch(`${ORIGIN}/iclock/devicecmd?SN=${GATE_SN}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: lines.map((l) => `ID=${l.split(':')[1]}&Return=${code}&CMD=DATA`).join('\n') });
  // Whatever already waits (its clock, set once a day when it says hello) is done first.
  await answer(await ask());

  // On the page: Deepak Kumar (EMP-010, user number 10) goes on the devices under his name.
  await signIn(page, 'hr@demo.com');
  await page.goto('/biometric?tab=users');
  await page.getByRole('button', { name: 'More for user number 10', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Put on the devices' }).click();
  const put = formPanel(page, 'Put Deepak Kumar on the devices');
  await expect(put.getByLabel('Name on the device')).toHaveValue('Deepak Kumar');
  await put.getByRole('button', { name: 'Put on the devices' }).click();
  await expect(page.getByText('User number 10 goes on 1 device when it next calls')).toBeVisible();

  const handed = await ask();
  expect(handed).toEqual([expect.stringMatching(/^C:\d+:DATA UPDATE USERINFO PIN=10\tName=Deepak Kumar\tPri=0$/)]);
  expect(await ask()).toEqual([]); // handed once, not again before it answers
  expect(await (await answer(handed)).text()).toBe('OK');
  const ten = (await api<BioUser[]>(hr, '/biometric/users')).find((u) => u.pin === '10')!;
  expect(ten.onDevices).toBeGreaterThanOrEqual(1);
  expect(ten.commandsWaiting).toBe(0);

  // Taken off: the terminal refuses, and the command says so.
  await api(hr, '/biometric/users/10/remove-from-devices', { method: 'POST', body: {} });
  const off = await ask();
  expect(off).toEqual([expect.stringMatching(/^C:\d+:DATA DELETE USERINFO PIN=10$/)]);
  await answer(off, -1);
  const [last] = await api<Command[]>(hr, '/biometric/commands');
  expect(last).toMatchObject({ kind: 'REMOVE_USER', pin: '10', status: 'FAILED' });
  expect(last.note).toMatch(/refused it \(code -1\)/);

  await expect(api(hr, '/biometric/users/W7/add-to-devices', { method: 'POST', body: {} })).rejects.toThrow(/up to 9 digits/);
  await expect(api(engineer, '/biometric/commands')).rejects.toThrow(/403/);
  expect((await fetch(`${ORIGIN}/iclock/getrequest?SN=NOTREGISTERED1`)).status).toBe(401);
});
