import { expect, test } from '@playwright/test';
import { api, apiToken, formPanel, signIn } from './helpers';

/**
 * Hindrance register to notice. The DPRs' remarks come up on Delays and risks for the project manager
 * to record as delays (which start a notice clock), add to the open delay they belong to, or dismiss; Draft notice on
 * a delay opens the letter form filled in from the delay and the contract (nothing is saved); the watch list warns as
 * the notice falls due; and the delay register prints for an extension-of-time claim.
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } });

type Suggestion = { id: string; dprId: string; remark: string; category: string; party: string | null; openDelay: { id: string; riskNo: string } | null };
type Clock = { running: boolean; due: string; daysLeft: number; noticeDays: number };
type Risks = { items: { id: string; riskNo: string; projectId: string }[] };

test('the road site’s DPR remarks come up to record; recording one starts its notice clock', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const projects = await api<{ items: { id: string; code: string }[] }>(pm, '/projects?pageSize=50');
  const road = projects.items.find((p) => p.code === 'RD-2026-01')!;
  const list = await api<Suggestion[]>(pm, `/hindrances/suggestions?projectId=${road.id}`);
  // A site engineer does not see them.
  await expect(api(await apiToken('engineer@demo.com'), '/hindrances/suggestions')).rejects.toThrow(/403/);

  await signIn(page, 'pm@demo.com');
  await page.goto(`/risks?projectId=${road.id}`);
  await expect(page.getByRole('heading', { name: 'Delays and risks', level: 1 })).toBeVisible();
  const fresh = list.find((s) => s.openDelay === null && s.party === 'THIRD_PARTY');
  if (!fresh) {
    // An earlier run recorded them all.
    await expect(page.getByRole('heading', { name: /hindrances? from the DPRs to record/ })).toHaveCount(list.length ? 1 : 0);
    return;
  }
  await expect(page.getByRole('heading', { name: /hindrances? from the DPRs to record/ })).toBeVisible();
  const row = page.locator(`[data-hindrance="${fresh.id}"]`);
  await expect(row.getByText(fresh.remark, { exact: false })).toBeVisible();
  await expect(row.getByRole('link', { name: /DPR of/ })).toHaveAttribute('href', `/dpr/${fresh.dprId}`);
  await row.getByRole('button', { name: 'Record delay' }).click();
  await expect(page.getByText(/RISK-\d{4}-\d{4} recorded/)).toBeVisible();
  const drawer = page.locator('.ant-drawer-content-wrapper').filter({ hasText: 'Held up since' });
  await expect(drawer.getByText(/^Hindrance notice due /)).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Draft notice' })).toBeVisible();
  await expect(row).toHaveCount(0);

  // Take the delay out again, so the register stays as the seed left it.
  const made = (await api<Risks>(pm, `/risks?projectId=${road.id}&kind=DELAY&pageSize=50&sortBy=createdAt&sortOrder=desc`)).items[0];
  await api(pm, `/risks/${made.id}`, { method: 'DELETE' });
});

test('Draft notice on a delay opens a letter under the contract’s clause, linked to the delay; nothing is saved', async ({ page }) => {
  const pm2 = await apiToken('pm2@demo.com');
  const delay = (await api<Risks>(pm2, '/risks?q=RISK-2026-0001&pageSize=5')).items.find((r) => r.riskNo === 'RISK-2026-0001')!;
  const clock = await api<Clock>(pm2, `/hindrances/notice/${delay.id}`);
  const period = await api<{ found: { clause: string; docNo: string; page: number; days: number } | null }>(pm2, `/hindrances/notice-period/${delay.projectId}`);
  expect(period.found).toMatchObject({ clause: '5.1', docNo: 'HB-AGR-01', days: 14 });
  // The watch list warns from 7 days before the notice is due.
  const watch = await api<{ open: { key: string; kind: string }[]; dismissed: { key: string; kind: string }[] }>(pm2, '/warnings');
  const warned = [...watch.open, ...watch.dismissed].some((w) => w.kind === 'NOTICE_DUE' && w.key.startsWith(`notice:${delay.id}:`));
  expect(warned).toBe(clock.running && clock.daysLeft <= 7);
  if (!clock.running) return;

  const letters = (await api<{ total: number }>(pm2, '/letters?pageSize=1')).total;
  await signIn(page, 'pm2@demo.com');
  await page.goto(`/risks?id=${delay.id}`);
  const drawer = page.locator('.ant-drawer-content-wrapper').filter({ hasText: 'RISK-2026-0001' });
  await expect(drawer.getByText(/^Hindrance notice due /)).toBeVisible();
  await drawer.getByRole('button', { name: 'Draft notice' }).click();
  await expect(page).toHaveURL(/\/correspondence\/outward/);
  const form = formPanel(page, 'New letter');
  await expect(form.getByText(/Drafted from RISK-2026-0001, its DPR entries and clause 5\.1 of HB-AGR-01, page 2/)).toBeVisible();
  await expect(form.getByLabel('Subject')).toHaveValue('Notice of hindrance: GF slab reinforcement drawings revised by the architect');
  await expect(form.getByLabel('Letter text')).toHaveValue(/^Under Clause 5\.1 of the agreement/);
  await expect(form.getByText(/RISK-2026-0001 Delay: GF slab reinforcement/)).toBeVisible();
  await form.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog', { name: 'Close this form?' }).getByRole('button', { name: 'Close' }).click();
  expect((await api<{ total: number }>(pm2, '/letters?pageSize=1')).total).toBe(letters);
});

test('a DPR’s own page offers its hindrance, and the delay register prints', async ({ page }) => {
  const pm2 = await apiToken('pm2@demo.com');
  const projects = await api<{ items: { id: string; code: string }[] }>(pm2, '/projects?pageSize=50');
  const building = projects.items.find((p) => p.code === 'BL-2026-02')!;
  const list = await api<Suggestion[]>(pm2, `/hindrances/suggestions?projectId=${building.id}`);
  const drawings = list.find((s) => s.category === 'DESIGN');

  await signIn(page, 'pm2@demo.com');
  if (drawings) {
    // The building's open design delay: the demo's, or a later one another test recorded.
    const riskNo = drawings.openDelay?.riskNo;
    expect(riskNo).toMatch(/^RISK-\d{4}-\d{4}$/);
    await page.goto(`/dpr/${drawings.dprId}`);
    await expect(page.getByText('This reads as a hindrance to record in the delay register:')).toBeVisible();
    const row = page.locator(`[data-hindrance="${drawings.id}"]`);
    await expect(row.getByRole('button', { name: `Add to ${riskNo}` })).toBeVisible();
    await row.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText('Dismissed')).toBeVisible();
    await expect(row).toHaveCount(0);
  }

  await page.goto(`/risks?projectId=${building.id}`);
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Delay register' }).click();
  const sheet = await popup;
  await expect(sheet.getByRole('heading', { name: 'Delay register' })).toBeVisible();
  await expect(sheet.getByText('RISK-2026-0001', { exact: true })).toBeVisible();
  await sheet.close();
});
