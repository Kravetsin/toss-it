import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Prod: served by server under /overlay/; dev: root of own port.
  base: command === 'build' ? '/overlay/' : '/',
  build: {
    rollupOptions: {
      // Two OBS sources: the media overlay (index) and the chat overlay (chat).
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        chat: resolve(import.meta.dirname, 'chat.html'),
      },
    },
  },
  server: {
    port: 5174,
  },
}));
