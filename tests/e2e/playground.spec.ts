import { test, expect } from '@playwright/test';
test('completes the mock call vertical slice', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '软电话', exact: true })).toBeVisible();
  await expect(page.getByText('Mock 演示模式')).toBeVisible();
  await page.getByRole('button', { name: '拨打电话' }).click();
  await expect(page.getByText('CRM 弹屏')).toBeVisible();
  await expect(page.getByText('示例客户 · 默认号码')).toBeVisible();
  await expect(page.getByText('ringing', { exact: true }).first()).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('active', { exact: true }).first()).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('通话中', { exact: true })).toBeVisible();
  await expect(page.getByText('质量 良好')).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: '录音' }).click();
  await expect(page.getByRole('button', { name: '停止录音' })).toBeVisible();
  await page.getByRole('button', { name: '挂断' }).click();
  await expect(page.getByText('ended', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('话后处理')).toBeVisible();
});
