import { expect, test } from '@playwright/test';

test('production requires login and reports configuration failures instead of simulating calls', async ({
  page,
}) => {
  await page.route('**/api/session', (route) => route.fulfill({ status: 401, body: '{}' }));
  await page.route('**/api/login', (route) => route.fulfill({ status: 200, body: '{}' }));
  await page.route('**/api/telephony/config', (route) =>
    route.fulfill({ status: 403, body: '{}' }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CloudCall 登录' })).toBeVisible();
  await expect(page.getByRole('button', { name: '拨打电话', exact: true })).toHaveCount(0);
  await page.getByLabel('账号', { exact: true }).fill('agent1001');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText('SIP 信令 · WebRTC 音频', { exact: true })).toBeVisible();
  await expect(page.getByText('无法获取通话配置', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '拨打电话', exact: true })).toBeDisabled();
});

test('failed login keeps credentials out of the call screen', async ({ page }) => {
  await page.route('**/api/session', (route) => route.fulfill({ status: 401, body: '{}' }));
  await page.route('**/api/login', (route) => route.fulfill({ status: 401, body: '{}' }));
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill('unknown');
  await page.getByLabel('密码', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('登录失败');
  await expect(page.getByRole('heading', { name: 'CloudCall 登录' })).toBeVisible();
});
