import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, formPanel, signIn } from './helpers';

type Connection = { id: string; name: string; health: string; devices: number };
type Secret = { connection: Connection; hookPath: string | null };
type PairCode = { agent: { id: string; state: string }; code: string };
type Device = { id: string; externalId: string; label: string | null; equipmentName: string | null };
type Event = { summary: string; status: string; connectionName: string | null };

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

/**
 * Connections (item 139): an admin makes a web address for a service on the page, the address is shown once, a message
 * posted to it lands in the log once however often it is sent, and its device is matched to a machine. A Connector pairs
 * with its code (once), gets its settings, and a batch of readings sent twice is counted once. Others are refused.
 */
test('a web address takes messages in once, and a paired Connector sends readings', async ({ page }) => {
  const admin = await apiToken('admin@demo.com');
  const name = `Trackers ${Date.now()}`;

  await signIn(page, 'admin@demo.com');
  await page.goto('/connections');
  await expect(page.getByRole('heading', { level: 1, name: 'Connections' })).toBeVisible();
  await page.getByRole('button', { name: 'New connection' }).click();
  const form = formPanel(page, 'New connection');
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Connect' }).click();
  const shown = page.getByRole('dialog', { name: `Web address for ${name}` });
  await expect(shown.getByText('it is shown only this once')).toBeVisible();
  const url = (await shown.getByText(`${API_URL}/hooks/generic-webhook/`).textContent())!.trim();
  await shown.getByRole('button', { name: 'Done' }).click();

  const path = url.slice(API_URL.length);
  const message = { id: `evt-${Date.now()}`, deviceId: `IMEI${Date.now()}`, deviceName: 'Test excavator tracker', engineHours: 4200.5 };
  expect(await (await post(path, message)).json()).toEqual({ status: 'OK', summary: 'From Test excavator tracker: 4 fields (id, deviceId, deviceName, engineHours)' });
  expect(await (await post(path, message)).json()).toMatchObject({ status: 'IGNORED', summary: 'Already taken in' });
  expect((await post('/hooks/generic-webhook/not-the-secret-not-the-secret-not-the-secret', message)).status).toBe(401);
  const events = await api<Event[]>(admin, '/integrations/events?limit=50');
  expect(events.filter((e) => e.connectionName === name)).toHaveLength(1);

  // The log on the page, then the device matched to a machine.
  await page.getByRole('tab', { name: 'Log' }).click();
  await expect(page.getByRole('row', { name: new RegExp(`${name}.*Taken in.*Test excavator tracker`) })).toBeVisible();
  await page.getByRole('tab', { name: 'Devices' }).click();
  await chooseOption(page.getByLabel('Machine for Test excavator tracker'), 'EXC-01');
  await expect(page.getByText('Matched to the machine')).toBeVisible();
  const device = (await api<Device[]>(admin, '/integrations/devices')).find((d) => d.externalId === message.deviceId)!;
  expect(device.equipmentName).toMatch(/^EXC-01 /);

  // A Connector: paired once with its code, typed in lower case; then its settings and readings.
  const pc = await api<PairCode>(admin, '/integrations/agents', { method: 'POST', body: { name: `Test PC ${Date.now()}` } });
  const check = await api<Secret>(admin, '/integrations/connections', { method: 'POST', body: { kind: 'CONNECTOR_CHECK', name: `${name} check`, agentId: pc.agent.id } });
  const paired = (await (await post('/connector/pair', { code: pc.code.toLowerCase(), hostname: 'E2E-PC', version: '0.1.0' })).json()) as { token: string };
  expect(paired.token).toMatch(/^nct_/);
  expect((await post('/connector/pair', { code: pc.code })).status).toBe(401);
  const auth = { authorization: `Bearer ${paired.token}` };
  const config = (await (await fetch(`${API_URL}/connector/config`, { headers: auth })).json()) as { connections: { id: string }[] };
  expect(config.connections.map((c) => c.id)).toEqual([check.connection.id]);
  const batch = { readings: [{ id: `r-${Date.now()}`, connectionId: check.connection.id, at: new Date().toISOString(), payload: { deviceId: 'E2E-PC' } }] };
  expect(await (await post('/connector/readings', batch, auth)).json()).toMatchObject({ accepted: 1, duplicates: 0, failed: 0 });
  expect(await (await post('/connector/readings', batch, auth)).json()).toMatchObject({ accepted: 0, duplicates: 1, failed: 0 });
  expect((await api<{ id: string; state: string }[]>(admin, '/integrations/agents')).find((a) => a.id === pc.agent.id)?.state).toBe('ONLINE');

  // Removed, it is refused; and only an admin or management see any of it.
  await api(admin, `/integrations/agents/${pc.agent.id}`, { method: 'DELETE' });
  expect((await fetch(`${API_URL}/connector/config`, { headers: auth })).status).toBe(401);
  const engineer = await apiToken('engineer@demo.com');
  await expect(api(engineer, '/integrations/connections')).rejects.toThrow(/403/);
});
