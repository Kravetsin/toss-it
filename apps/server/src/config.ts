import type { MediaKind } from '@tmw/shared';

const twitchClientId = process.env.TWITCH_CLIENT_ID ?? '';
const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  /** Containers need 0.0.0.0 — set via HOST. */
  host: process.env.HOST ?? '127.0.0.1',
  isProd,

  /** Prod: server serves built web+overlay itself (vite does this in dev). */
  serveStatic: isProd || process.env.SERVE_STATIC === '1',

  /** Frontend base URL (post-OAuth redirects). */
  webUrl: process.env.PUBLIC_WEB_URL ?? 'http://localhost:5173',

  twitch: {
    clientId: twitchClientId,
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
    redirectUri: process.env.TWITCH_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback',
  },

  /** Without Twitch keys, fake auth turns on for local dev:
   *  GET /api/auth/login?fake=<login> logs in a made-up user. */
  allowFakeAuth: !twitchClientId || process.env.ALLOW_FAKE_AUTH === '1',

  cookieSecret: process.env.COOKIE_SECRET ?? 'dev-secret-change-me',
  sessionTtlMs: 30 * 24 * 3_600_000,

  /** Who can issue promo codes: comma-separated user ids (twitch:.../google:...). */
  adminUserIds: (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  maxFileSizeBytes: 50 * 1024 * 1024,
  /** Max display duration; longer video/audio is truncated. */
  maxDurationMs: 15_000,
  /** How long static images and gifs stay on screen. */
  imageDurationMs: 8_000,

  /** Media processing: limits against memory spikes (sharp/ffmpeg hold native RAM). */
  media: {
    /** Concurrent heavy tasks (decode/transcode). 3 on the 6-core / 8GB host. */
    concurrency: Number(process.env.MEDIA_CONCURRENCY ?? 3),
    /** Budget for expanded animation: w*h*4*frames (raw RGBA in memory).
     *  Above it, gif/webp treated as single frame, not animated. Default ~96MB. */
    animatedPixelBudgetBytes: Number(process.env.ANIMATED_PIXEL_BUDGET_BYTES ?? 96 * 1024 * 1024),
    /** Hard per-frame pixel cap (pixel-bomb guard). ~24 MP. */
    maxInputPixels: Number(process.env.MAX_INPUT_PIXELS ?? 24_000_000),
    /** ffmpeg transcode timeout: kill hung process so it stops holding RAM. */
    ffmpegTimeoutMs: Number(process.env.FFMPEG_TIMEOUT_MS ?? 120_000),
    /** ffprobe timeout (duration detection). */
    ffprobeTimeoutMs: Number(process.env.FFPROBE_TIMEOUT_MS ?? 30_000),
  },

  /** YouTube sends: link plays in embedded player, no duration cap (plays to end). */
  youtube: {
    /** How long to wait for real duration from player before watchdog deems the
     *  overlay dead and advances the queue (ms). Player usually reports in seconds. */
    loadGraceMs: Number(process.env.YOUTUBE_LOAD_GRACE_MS ?? 60_000),
    /** Data API key (background-music track titles). Empty = track list unavailable. */
    apiKey: process.env.YOUTUBE_API_KEY ?? '',
  },

  /** mime by magic bytes (file-type) → media kind. Everything else rejected. */
  allowedMime: {
    'image/jpeg': 'image',
    'image/png': 'image',
    'image/gif': 'image',
    'image/webp': 'image',
    'video/mp4': 'video',
    'video/webm': 'video',
    'audio/mpeg': 'audio',
    'audio/ogg': 'audio',
    'audio/wav': 'audio',
    'audio/x-wav': 'audio',
  } as Record<string, MediaKind>,

  /** TTS: local Piper (data/piper, `pnpm piper:setup`), Google Translate fallback. */
  tts: {
    /** Forced voice language (en/ru/uk); defaults to detection by text. */
    lang: process.env.TTS_LANG,
    /** Piper install dir override; in Docker it's baked into /opt/piper. */
    piperDir: process.env.PIPER_DIR,
  },

  rateLimit: {
    /** Overall request cap per IP per minute. */
    global: Number(process.env.RATE_LIMIT_GLOBAL ?? 120),
    /** Separate upload cap: transcoding is expensive. */
    upload: Number(process.env.RATE_LIMIT_UPLOAD ?? 10),
  },

  moderation: {
    /** Min interval between one viewer's sends to one channel. */
    viewerCooldownMs: Number(process.env.VIEWER_COOLDOWN_MS ?? 60_000),
    /** Max accepted sends per channel per hour. */
    channelHourlyLimit: Number(process.env.CHANNEL_HOURLY_LIMIT ?? 60),
  },

  cleanup: {
    /** Sweep cadence. Terminal files live terminalRetentionMs anyway — a coarse
     *  grid is fine, and each sweep costs DB reads (Turso bills rows read). */
    intervalMs: 5 * 60_000,
    /** How long to keep file after terminal status (slack for overlay reconnect). */
    terminalRetentionMs: 10 * 60_000,
    /** Sends not shown within this time expire. */
    queuedTtlMs: 4 * 3_600_000,
  },

  /** Slack on watchdog timer: if overlay sends no done within durationMs + this, treat show as finished. */
  watchdogGraceMs: 10_000,
};
