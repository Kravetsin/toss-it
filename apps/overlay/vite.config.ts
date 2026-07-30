import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Prod: served by server under /overlay/; dev: root of own port.
  base: command === 'build' ? '/overlay/' : '/',
  // Stamped into the bundle and sent on connect: the admin panel needs it to tell which OBS sources
  // are still running an old build — they keep working and never ask for the new one by themselves.
  define: {
    __OVERLAY_BUILD__: JSON.stringify(
      command === 'build' ? new Date().toISOString().slice(0, 16).replace('T', ' ') : 'dev',
    ),
  },
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
