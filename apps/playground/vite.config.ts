import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cloudcall/core': `${root}/packages/core/src/index.ts`,
      '@cloudcall/signaling': `${root}/packages/signaling/src/index.ts`,
      '@cloudcall/webrtc': `${root}/packages/webrtc/src/index.ts`,
      '@cloudcall/ui': `${root}/packages/ui/src/index.tsx`,
    },
  },
  server: { host: '127.0.0.1', port: 5173 },
});
