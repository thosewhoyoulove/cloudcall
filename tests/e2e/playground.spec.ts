import { test, expect } from '@playwright/test';
test('completes the mock call vertical slice', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('CloudCall Console')).toBeVisible();
  await page.getByRole('button', { name: '拨打电话' }).click();
  await expect(page.getByText('ringing', { exact: true }).first()).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('active', { exact: true }).first()).toBeVisible({ timeout: 3000 });
  await page.getByRole('button', { name: '挂断' }).click();
  await expect(page.getByText('ended', { exact: true }).first()).toBeVisible();
});
