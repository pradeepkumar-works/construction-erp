import { expect, test } from '@playwright/test';
import { chooseOption, signIn } from './helpers';

test('the progress report preview carries the organisation and the Nirmaan footer', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/reports');
  await chooseOption(page.locator('.ant-card').first().getByRole('combobox').first(), 'RD-2026-01');
  await page.getByText('Monthly', { exact: true }).click();
  const report = page.frameLocator('iframe[title="Report preview"]');
  await expect(report.getByRole('heading', { name: 'Monthly Progress Report' })).toBeVisible();
  await expect(report.locator('.head .brand')).toHaveText('Demo Infra Projects Pvt Ltd');
  await expect(report.locator('.nirmaan-foot .wm')).toHaveText('NIRMAAN');
  await expect(page.getByRole('button', { name: /Print \/ Save as PDF/ })).toBeEnabled();
});
