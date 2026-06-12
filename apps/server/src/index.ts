import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';

// .env лежит в apps/server (см. .env.example). Без него работают dev-дефолты.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../.env'));
} catch {
  // файла нет — ок
}

const { config } = await import('./config');
const { runMigrations } = await import('./db/index');
const { LocalDiskStorage } = await import('./storage');
const { setupRealtime } = await import('./playback');
const { registerRoutes } = await import('./routes/index');
const { startCleanup } = await import('./cleanup');

await runMigrations();

const serverRoot = path.resolve(import.meta.dirname, '..');
const mediaDir = path.join(serverRoot, 'data', 'media');
const tmpDir = path.join(serverRoot, 'data', 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const storage = new LocalDiskStorage(mediaDir);

// trustProxy: на Render/за реверс-прокси нужен X-Forwarded-* для https-редиректов и secure-cookies.
const app = Fastify({ logger: true, trustProxy: true });

await app.register(fastifyRateLimit, {
  max: config.rateLimit.global,
  timeWindow: '1 minute',
});
await app.register(fastifyCookie, { secret: config.cookieSecret });
await app.register(fastifyMultipart, {
  limits: { fileSize: config.maxFileSizeBytes, files: 1 },
});
// serve: false — медиа отдаётся только через GET /api/media/:id (reply.sendFile).
await app.register(fastifyStatic, { root: storage.root, serve: false });

// Прод: сервер сам раздаёт собранные фронты — один домен, ноль CORS-проблем.
if (config.serveStatic) {
  const webDist = path.resolve(serverRoot, '../web/dist');
  const overlayDist = path.resolve(serverRoot, '../overlay/dist');

  await app.register(fastifyStatic, {
    root: overlayDist,
    prefix: '/overlay/',
    decorateReply: false,
    redirect: true,
  });
  await app.register(fastifyStatic, {
    root: webDist,
    prefix: '/',
    decorateReply: false,
  });
  // SPA-fallback: /c/<login> и /dashboard обслуживает index.html веб-приложения.
  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url ?? '';
    if (req.method === 'GET' && !url.startsWith('/api') && !url.startsWith('/socket.io')) {
      return reply.type('text/html').sendFile('index.html', webDist);
    }
    return reply.code(404).send({ error: 'Не найдено' });
  });
}

// Оверлей в dev живёт на другом origin (vite :5174) — WebSocket нужен CORS.
const io: import('./playback').RealtimeServer = new Server(app.server, {
  cors: { origin: true },
});
const playback = setupRealtime(io);
await playback.recoverFromDb();

registerRoutes(app, { playback, storage, tmpDir, io });
startCleanup(storage, app.log);

if (config.allowFakeAuth) {
  app.log.warn('Fake-авторизация ВКЛЮЧЕНА (нет TWITCH_CLIENT_ID): /api/auth/login?fake=<login>');
}

app.addHook('onClose', async () => {
  await io.close();
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
