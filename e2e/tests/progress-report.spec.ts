import { expect, test } from '@playwright/test';
import { chooseOption, signIn } from './helpers';

test('the weekly report previews in the company design, downloads as PDF and is issued to the client', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/reports?report=weekly');
  await chooseOption(page.locator('.ant-card').first().getByRole('combobox').first(), 'RD-2026-01');
  const report = page.frameLocator('iframe[title="Weekly progress report preview"]');
  await expect(report.getByRole('heading', { name: 'Weekly progress report' })).toBeVisible();
  await expect(report.locator('.head .brand')).toHaveText('Demo Infra Projects Pvt Ltd');
  await expect(report.locator('.nirmaan-foot .wm')).toHaveText('NIRMAAN');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download PDF$/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^RD-2026-01-WPR-\d{3}(-R\d+)?-\d{4}-\d{2}-\d{2}\.pdf$/);

  await page.getByRole('button', { name: /Issue (to client|again)$/ }).click();
  await page.getByLabel('Note for the register (optional)').fill('Sent to the PIU by email');
  await page.getByRole('button', { name: /^Issue as Rev \d+$/ }).click();
  await expect(page.getByRole('list', { name: 'Issued copies' }).getByText('Sent to the PIU by email').first()).toBeVisible();
});

test('the monthly report (MPR) opens with its cover and contents', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/reports');
  await chooseOption(page.locator('.ant-card').first().getByRole('combobox').first(), 'RD-2026-01');
  await page.getByText('Monthly (MPR)', { exact: true }).click();
  const report = page.frameLocator('iframe[title="Monthly progress report preview"]');
  await expect(report.getByText('Contents', { exact: true })).toBeVisible();
  await expect(report.getByRole('heading', { name: /Executive summary$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Word$/ })).toBeEnabled();
});
