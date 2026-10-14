import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Prefs = { phone: string | null; sendTo: string | null; whatsapp: boolean; sms: boolean; whatsappReady: boolean };
type Pending = { type: string; id: string; submittedByName: string };
type Message = { userName: string | null; template: string; channel: string; status: string; body: string };

/**
 * WhatsApp and SMS (v3 item 31): a site engineer switches WhatsApp alerts on and sends herself a test; when her project
 * manager sends one of her expenses back, the send-back goes to her phone too; management sees it in the message log.
 * CI has no WhatsApp account, so messages are logged as "Not set up" with the text that would have gone.
 */
test('an engineer turns on WhatsApp alerts and a send-back reaches the message log', async ({ page, browser }) => {
  const se = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const before = await api<Prefs>(se, '/messaging/me');
  try {
    await api(se, '/messaging/me', { method: 'PUT', body: { whatsapp: false, sms: false } });
    await signIn(page, 'engineer@demo.com');
    await page.goto('/notifications');
    await page.getByRole('button', { name: 'WhatsApp & SMS' }).click();
    const modal = page.locator('.ant-modal').filter({ hasText: 'WhatsApp and SMS alerts' });
    await expect(modal.getByLabel('Mobile number')).toHaveValue(before.phone ?? '');
    await modal.getByLabel('Mobile number').fill('98000 00006');
    await expect(modal.getByText('Messages go to +91 98000 00006')).toBeVisible();
    await modal.getByLabel('Send my alerts on WhatsApp').check();
    await modal.getByRole('button', { name: 'Send a test on WhatsApp' }).click();
    await expect(modal.getByText(/Test sent on WhatsApp|Test WhatsApp not sent/)).toBeVisible();
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Alerts on WhatsApp saved')).toBeVisible();
    const prefs = await api<Prefs>(se, '/messaging/me');
    expect(prefs.whatsapp).toBe(true);
    expect(prefs.sendTo).toBe('919800000006');

    // Her project manager sends one of her expenses back, then she resubmits it as it was.
    const expense = (await api<Pending[]>(pm, '/approvals/pending')).find((p) => p.type === 'EXPENSE' && p.submittedByName === 'Priya Mohanty');
    expect(expense, 'a pending expense by Priya in the demo data').toBeTruthy();
    await api(pm, `/approvals/EXPENSE/${expense!.id}/review`, { method: 'POST', body: { decision: 'REQUEST_CHANGES', note: 'E2E: attach the bill' } });
    await api(se, `/expenses/${expense!.id}/submit`, { method: 'POST' });

    const admin = await apiToken('admin@demo.com');
    const log = (await api<{ items: Message[] }>(admin, '/messaging/log?pageSize=10')).items;
    const sentBack = log.find((m) => m.template === 'SENT_BACK' && m.userName === 'Priya Mohanty');
    expect(sentBack?.channel).toBe('WHATSAPP');
    expect(sentBack?.body).toContain('was sent back for changes by Suresh Nair. Note: E2E: attach the bill.');

    const mgmt = await (await browser.newContext()).newPage();
    await signIn(mgmt, 'admin@demo.com');
    await mgmt.goto('/notifications?tab=messages');
    const row = mgmt.getByRole('row').filter({ hasText: 'E2E: attach the bill' }).first();
    await expect(row).toContainText('Priya Mohanty');
    await expect(row).toContainText('Sent back');
    await expect(row).toContainText(/Sent|Not set up|Failed/);
    // A site engineer cannot read the company's log.
    await expect(api(se, '/messaging/log')).rejects.toThrow(/403/);
  } finally {
    await api(se, '/messaging/me', { method: 'PUT', body: { phone: before.phone, whatsapp: before.whatsapp, sms: before.sms } });
  }
});
