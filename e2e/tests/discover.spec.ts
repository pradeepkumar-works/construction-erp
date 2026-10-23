import { expect, test, type Page } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

/**
 * Discover and access requests (launcher phase 3): Home's Discover shows modules marked New or Featured, modules never
 * opened and, greyed, modules the role cannot open; asking for one reaches the admins in Admin › Home tiles, whose answer
 * comes back to the person.
 */

interface HomeTiles {
  flags: { nodeId: string }[];
  discoverLocked: boolean;
  requests: { id: string; nodeId: string; status: string; userName: string }[];
}
interface Notifications {
  items: { title: string; type: string }[];
}

/** Each test starts from the shipped marks, Discover showing locked modules, and no request waiting. */
async function reset() {
  const admin = await apiToken('admin@demo.com');
  const tiles = await api<HomeTiles>(admin, '/launcher/home-tiles');
  for (const f of tiles.flags) await api(admin, `/launcher/flags/${f.nodeId}`, { method: 'PUT', body: { isNew: null, newUntil: null, featured: null } });
  if (!tiles.discoverLocked) await api(admin, '/launcher/settings', { method: 'PATCH', body: { discoverLocked: true } });
  for (const r of tiles.requests.filter((r) => r.status === 'OPEN')) await api(admin, `/launcher/access-requests/${r.id}`, { method: 'PATCH', body: { status: 'DECLINED', reply: 'Cleared before a test' } });
  return admin;
}

const discover = (page: Page) => page.getByRole('group', { name: 'Discover' });

test('a site engineer asks for Client billing from Discover, and the admin declines it with a reason', async ({ page }) => {
  const admin = await reset();
  await signIn(page, 'engineer@demo.com');
  const billing = discover(page).getByRole('button', { name: 'Client billing', exact: true });
  await expect(billing).toHaveAccessibleDescription(/^Ask for access/);
  await billing.click();
  const drawer = page.getByRole('dialog', { name: 'Client billing' });
  // A rerun on the same data finds the last run's declined request, which can be asked again.
  await expect(drawer).toContainText(/Your role does not open it yet|You can ask again/);
  await expect(drawer.getByText('RA bills', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Request access' }).click();
  const ask = page.getByRole('dialog', { name: 'Request access to Client billing' });
  await ask.getByLabel('What do you need it for?').fill('To check what the client has been billed for my site');
  await ask.getByRole('button', { name: 'Send request' }).click();
  await expect(ask).toBeHidden();
  await expect(drawer.getByRole('button', { name: 'Requested' })).toBeDisabled();
  await expect(drawer).toContainText('Your admins have been told');
  await page.keyboard.press('Escape');
  await expect(billing).toHaveAccessibleDescription(/^Requested/);

  const told = await api<Notifications>(admin, '/notifications?limit=20&typesVersion=6');
  expect(told.items.some((n) => n.type === 'ACCESS_REQUEST' && /asks to open Client billing/.test(n.title))).toBe(true);

  await page.context().clearCookies();
  await signIn(page, 'admin@demo.com');
  await page.goto('/home-tiles');
  await expect(page.getByRole('heading', { level: 1, name: 'Home tiles' })).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: 'asks to open Client billing' }).filter({ has: page.getByRole('button', { name: 'Decline' }) });
  await expect(row).toContainText('To check what the client has been billed for my site');
  await row.getByRole('button', { name: 'Decline' }).click();
  const decline = page.getByRole('dialog', { name: /^Decline Client billing for / });
  await decline.getByRole('button', { name: 'Decline' }).click();
  await expect(decline).toContainText('Say why, so they know what to do');
  await decline.getByLabel('Why not').fill('Ask the project manager for the bill copies instead');
  await decline.getByRole('button', { name: 'Decline' }).click();
  await expect(decline).toBeHidden();

  const engineer = await apiToken('engineer@demo.com');
  const back = await api<Notifications>(engineer, '/notifications?limit=20&typesVersion=6');
  expect(back.items.some((n) => n.title === 'Your request to open Client billing was declined')).toBe(true);
  const launcher = await api<{ requests: { nodeId: string; status: string; reply: string | null }[] }>(engineer, '/launcher');
  expect(launcher.requests.find((r) => r.nodeId === 'billing')).toMatchObject({ status: 'DECLINED', reply: 'Ask the project manager for the bill copies instead' });
});

test('an admin features a module for everyone, and can keep locked modules out of Discover', async ({ page }) => {
  const admin = await reset();
  try {
    await signIn(page, 'admin@demo.com');
    await page.goto('/home-tiles');
    await page.getByRole('switch', { name: 'Documents Featured' }).click();
    await expect(page.getByRole('switch', { name: 'Documents Featured' })).toBeChecked();
    await expect(page.getByRole('button', { name: 'As shipped' })).toBeVisible();

    await page.context().clearCookies();
    await signIn(page, 'engineer@demo.com');
    await expect(discover(page).getByRole('button', { name: 'Documents', exact: true })).toHaveAccessibleDescription(/^Featured/);
    await expect(discover(page).getByRole('button', { name: 'Client billing', exact: true })).toBeVisible();
    await discover(page).getByRole('button', { name: 'Documents', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Documents' });
    await drawer.getByRole('link', { name: 'Open Documents' }).click();
    await expect(page).toHaveURL(/\/(modules\/documents|documents)(\?|$)/);

    await api(admin, '/launcher/settings', { method: 'PATCH', body: { discoverLocked: false } });
    await page.goto('/');
    await expect(discover(page).getByRole('button').first()).toBeVisible();
    await expect(discover(page).getByRole('button', { name: 'Client billing', exact: true })).toHaveCount(0);
    const engineer = await apiToken('engineer@demo.com');
    await expect(api(engineer, '/launcher/access-requests', { method: 'POST', body: { nodeId: 'billing' } })).rejects.toThrow(/cannot be asked for here/);
  } finally {
    await reset();
  }
});

test('nobody but an admin manages Home tiles, and a module the role opens cannot be asked for', async () => {
  const pm = await apiToken('pm@demo.com');
  await expect(api(pm, '/launcher/home-tiles')).rejects.toThrow(/403/);
  await expect(api(pm, '/launcher/flags/site', { method: 'PUT', body: { featured: true } })).rejects.toThrow(/403/);
  await expect(api(pm, '/launcher/access-requests', { method: 'POST', body: { nodeId: 'site' } })).rejects.toThrow(/already open Site/);
});
