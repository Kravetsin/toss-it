import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // В проде оверлей раздаётся сервером под /overlay/, в dev — корень своего порта.
  base: command === 'build' ? '/overlay/' : '/',
  server: {
    port: 5174,
  },
}));
