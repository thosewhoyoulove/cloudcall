import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@cloudcall/core': `${root}packages/core/src/index.ts`,
      '@cloudcall/signaling': `${root}packages/signaling/src/index.ts`,
      '@cloudcall/webrtc': `${root}packages/webrtc/src/index.ts`,
      '@cloudcall/react': `${root}packages/react/src/index.tsx`,
      '@cloudcall/ui': `${root}packages/ui/src/index.tsx`,
      '@cloudcall/vue': `${root}packages/vue/src/index.ts`,
      '@cloudcall/iframe': `${root}packages/iframe/src/index.ts`,
    },
  },
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
