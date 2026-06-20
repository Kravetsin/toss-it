import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Prod: served by server under /overlay/; dev: root of own port.
  base: command === 'build' ? '/overlay/' : '/',
  server: {
    port: 5174,
  },
}));
