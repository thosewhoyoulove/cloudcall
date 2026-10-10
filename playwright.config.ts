import { defineConfig } from '@playwright/test';
// Some enterprise shells inject a global proxy without a localhost bypass.
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview apps/playground --host 127.0.0.1 --port 41783 --strictPort',
    url: 'http://127.0.0.1:41783',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: { baseURL: 'http://127.0.0.1:41783' },
});
