import { defineConfig } from '@playwright/test';
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
export default defineConfig({
  testDir: './tests/production',
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview apps/playground --outDir dist-production --host 127.0.0.1 --port 41784 --strictPort',
    url: 'http://127.0.0.1:41784',
    reuseExistingServer: false,
  },
  use: { baseURL: 'http://127.0.0.1:41784' },
});
