import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, formPanel, signIn } from './helpers';

/**
 * WhatsApp entries (AI item 120). The API runs with AI_PROVIDER=fake and WATI_WEBHOOK_SECRET=e2e-wati, so a message
 * posted to WATI's webhook address is read as whoever switched entries on for that number, drafted by the test model,
 * and shown on the page. Save saves it in their name; Open form opens the list's own form, and saving there marks the
 * message changed.
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } });

type Message = { id: string; state: string; outcome: string | null; text: string | null; record: { id: string } | null };
type List = { items: Message[]; total: number };
const SECRET = process.env.E2E_WATI_WEBHOOK_SECRET ?? 'e2e-wati';

async function send(text: string) {
  const res = await fetch(`${API_URL}/whatsapp/inbound/wati/${SECRET}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventType: 'message', owner: false, waId: '919800000006', whatsappMessageId: `e2e-${Date.now()}-${Math.random()}`, type: 'text', text }),
  });
  expect(res.ok).toBe(true);
}

test('a WhatsApp message becomes a draft the sender saves from the page, or changes in its form', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  await api(engineer, '/whatsapp/setup', { method: 'PUT', body: { enabled: false } });
  try {
    await signIn(page, 'engineer@demo.com');
    await page.goto('/whatsapp-capture');
    await expect(page.getByRole('heading', { name: 'WhatsApp entries', level: 1 })).toBeVisible();
    await page.getByRole('switch', { name: 'Read my WhatsApp messages as me' }).click();
    await expect(page.getByText('WhatsApp entries are on for your number')).toBeVisible();

    // Saved as drafted, in the engineer's name.
    const text = `Raise MR for 40 bags of OPC 53 cement for RD-2026-01 by 2099-03-0${Math.floor(Math.random() * 9) + 1}`;
    await send(text);
    await page.reload();
    const card = page.locator('[data-message-id]').filter({ hasText: text });
    await expect(card.getByText('Material request, not saved', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/^Saved and sent for approval/)).toBeVisible();
    await expect(card.getByText('Saved as drafted')).toBeVisible();
    await expect(card.getByRole('link', { name: 'open the material request' })).toBeVisible();
    const saved = (await api<List>(engineer, '/whatsapp/messages')).items.find((m) => m.text === text);
    expect(saved?.outcome).toBe('SAVED');
    const mr = await api<{ status: string; submittedBy: { id: string } | null; items: { itemName: string; quantity: string }[] }>(engineer, `/material-requests/${saved!.record!.id}`);
    expect(mr.status).toBe('SUBMITTED');
    expect(mr.items.map((i) => [i.itemName, Number(i.quantity)])).toEqual([['OPC 53 Grade Cement', 40]]);

    // Changed in the form and saved there.
    const second = `Raise MR for 15 bags of OPC 53 cement for RD-2026-01 by 2099-04-0${Math.floor(Math.random() * 9) + 1}`;
    await send(second);
    await page.reload();
    const other = page.locator('[data-message-id]').filter({ hasText: second });
    await other.getByRole('button', { name: 'Open form' }).click();
    await expect(page).toHaveURL(/\/material-requests/);
    const form = formPanel(page, 'New material request');
    await expect(form.getByLabel('Quantity of line 1')).toHaveValue('15');
    await form.getByLabel('Quantity of line 1').fill('18');
    await form.getByRole('button', { name: 'Submit request' }).click();
    await expect(page.getByText('Material request submitted for approval')).toBeVisible();
    await expect.poll(async () => (await api<List>(engineer, '/whatsapp/messages')).items.find((m) => m.text === second)?.outcome).toBe('CHANGED');
  } finally {
    await api(engineer, '/whatsapp/setup', { method: 'PUT', body: { enabled: false } });
  }
});

test('a number nobody switched on is not kept, and a wrong webhook address is refused', async () => {
  const before = (await api<List>(await apiToken('admin@demo.com'), '/whatsapp/messages?scope=company')).total;
  const res = await fetch(`${API_URL}/whatsapp/inbound/wati/${SECRET}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventType: 'message', waId: '919811122233', whatsappMessageId: `e2e-x-${Date.now()}`, type: 'text', text: 'raise mr 5 bags cement' }),
  });
  expect(res.ok).toBe(true);
  expect((await api<List>(await apiToken('admin@demo.com'), '/whatsapp/messages?scope=company')).total).toBe(before);
  expect((await fetch(`${API_URL}/whatsapp/inbound/wati/wrong`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(403);
});
