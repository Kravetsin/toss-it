import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';

// .env in apps/server (see .env.example); without it dev defaults apply.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../.env'));
} catch {
  // no file — fine
}

const { config } = await import('./config');
const { runMigrations } = await import('./db/index');
const { LocalDiskStorage } = await import('./storage');
const { setupRealtime } = await import('./playback');
const { registerRoutes } = await import('./routes/index');
const { startCleanup } = await import('./cleanup');
const { startBackups } = await import('./backup');
const { registerSeo } = await import('./seo');

await runMigrations();

const serverRoot = path.resolve(import.meta.dirname, '..');
const mediaDir = path.join(serverRoot, 'data', 'media');
const tmpDir = path.join(serverRoot, 'data', 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const storage = new LocalDiskStorage(mediaDir);

// trustProxy: behind Render/reverse proxy, need X-Forwarded-* for https redirects and secure cookies.
const app = Fastify({ logger: true, trustProxy: true });

await app.register(fastifyRateLimit, {
  max: config.rateLimit.global,
  timeWindow: '1 minute',
});
await app.register(fastifyCookie, { secret: config.cookieSecret });
await app.register(fastifyMultipart, {
  // fieldSize caps the raw text field in memory before it's clamped to TEXT_MAX_LEN (280);
  // 4 KB is ample for a UTF-8 caption + a link. fields caps non-file parts (we read text + giphyId).
  limits: { fileSize: config.maxFileSizeBytes, files: 1, fields: 4, fieldSize: 4096 },
});
// serve:false — media served only via GET /api/media/:id (reply.sendFile).
await app.register(fastifyStatic, { root: storage.root, serve: false });

// Prod: server serves the built frontends — single domain, no CORS issues.
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
    // index:false — route '/' through SPA fallback for SEO meta injection;
    // otherwise static would serve raw index.html, bypassing it.
    index: false,
  });
  // robots.txt, sitemap.xml, SPA fallback with per-route SEO meta
  // (+ real 404 for nonexistent /c/<login>). See seo.ts.
  registerSeo(app, webDist);
}

// In dev the overlay is on another origin (vite :5174), so WebSocket needs CORS.
const io: import('./playback').RealtimeServer = new Server(app.server, {
  cors: { origin: true },
});
const playback = setupRealtime(io, app);
await playback.recoverFromDb();

// Optional Twitch chat module: dormant unless bot credentials exist in app_meta.
const { createTwitchChatModule } = await import('./modules/twitch-chat/index');
const twitchChat = createTwitchChatModule({
  overlayCount: (channelId) => playback.overlayCount(channelId),
  io,
  log: app.log,
});

registerRoutes(app, { playback, storage, tmpDir, io, twitchChat });
startCleanup(storage, app.log);
startBackups(serverRoot, app.log);

if (config.allowFakeAuth) {
  app.log.warn('Fake-авторизация ВКЛЮЧЕНА (нет TWITCH_CLIENT_ID): /api/auth/login?fake=<login>');
}

app.addHook('onClose', async () => {
  twitchChat.stop();
  await io.close();
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
