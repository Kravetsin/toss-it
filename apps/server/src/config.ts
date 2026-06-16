import type { MediaKind } from '@tmw/shared';

const twitchClientId = process.env.TWITCH_CLIENT_ID ?? '';
const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  /** В контейнере нужен 0.0.0.0 — задаётся через HOST. */
  host: process.env.HOST ?? '127.0.0.1',
  isProd,

  /** Прод-режим: сервер сам раздаёт собранные web и overlay (в dev это делает vite). */
  serveStatic: isProd || process.env.SERVE_STATIC === '1',

  /** Базовый URL фронта (редиректы после OAuth). */
  webUrl: process.env.PUBLIC_WEB_URL ?? 'http://localhost:5173',

  twitch: {
    clientId: twitchClientId,
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
    redirectUri:
      process.env.TWITCH_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback',
  },

  /**
   * Без ключей Twitch включается фейковая авторизация для локальной разработки:
   * GET /api/auth/login?fake=<login> логинит выдуманного пользователя.
   */
  allowFakeAuth: !twitchClientId || process.env.ALLOW_FAKE_AUTH === '1',

  cookieSecret: process.env.COOKIE_SECRET ?? 'dev-secret-change-me',
  sessionTtlMs: 30 * 24 * 3_600_000,

  /** Кто может выпускать промокоды: список user id (twitch:.../google:...) через запятую. */
  adminUserIds: (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  maxFileSizeBytes: 50 * 1024 * 1024,
  /** Максимальная длительность показа; более длинные видео/аудио обрезаются. */
  maxDurationMs: 15_000,
  /** Сколько держать на экране статичные картинки и гифки. */
  imageDurationMs: 8_000,

  /** Обработка медиа: лимиты против спайков памяти (sharp/ffmpeg держат нативную RAM). */
  media: {
    /** Сколько тяжёлых задач (декод/транскод) выполнять одновременно. На 512МБ — 1. */
    concurrency: Number(process.env.MEDIA_CONCURRENCY ?? 1),
    /**
     * Бюджет на «развёрнутую» анимацию: ширина×высота×4×кадры (сырой RGBA в памяти).
     * Сверх него gif/webp обрабатываем как один кадр, а не как анимацию. По умолчанию ~96МБ.
     */
    animatedPixelBudgetBytes: Number(process.env.ANIMATED_PIXEL_BUDGET_BYTES ?? 96 * 1024 * 1024),
    /** Жёсткий потолок пикселей на один кадр (защита от pixel-bomb). ~24 МП. */
    maxInputPixels: Number(process.env.MAX_INPUT_PIXELS ?? 24_000_000),
    /** Таймаут ffmpeg-транскода: зависший процесс убиваем, чтобы не держал RAM. */
    ffmpegTimeoutMs: Number(process.env.FFMPEG_TIMEOUT_MS ?? 120_000),
    /** Таймаут ffprobe (определение длительности). */
    ffprobeTimeoutMs: Number(process.env.FFPROBE_TIMEOUT_MS ?? 30_000),
  },

  /** YouTube-отправки: ссылка играет встроенным плеером, без лимита длительности (играет до конца). */
  youtube: {
    /**
     * Сколько ждать реальную длительность от плеера, прежде чем watchdog решит,
     * что оверлей мёртв, и продвинет очередь (мс). Плеер обычно сообщает её за секунды.
     */
    loadGraceMs: Number(process.env.YOUTUBE_LOAD_GRACE_MS ?? 60_000),
  },

  /** mime по magic bytes (file-type) → вид медиа. Всё остальное отклоняется. */
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

  /** TTS через Google Translate (бесплатно, без ключа). */
  tts: {
    /** Принудительный язык озвучки (en/ru/...); по умолчанию определяется по имени. */
    lang: process.env.TTS_LANG,
  },

  rateLimit: {
    /** Общий потолок запросов с одного IP в минуту. */
    global: Number(process.env.RATE_LIMIT_GLOBAL ?? 120),
    /** Отдельный потолок на аплоад: транскодирование — дорогая операция. */
    upload: Number(process.env.RATE_LIMIT_UPLOAD ?? 10),
  },

  moderation: {
    /** Минимальный интервал между отправками одного зрителя в один канал. */
    viewerCooldownMs: Number(process.env.VIEWER_COOLDOWN_MS ?? 60_000),
    /** Максимум принятых отправок на канал в час. */
    channelHourlyLimit: Number(process.env.CHANNEL_HOURLY_LIMIT ?? 60),
  },

  cleanup: {
    intervalMs: 60_000,
    /** Сколько держать файл после терминального статуса (запас на реконнект оверлея). */
    terminalRetentionMs: 10 * 60_000,
    /** Не показанные за это время отправки протухают. */
    queuedTtlMs: 4 * 3_600_000,
  },

  /** Запас к таймеру watchdog: если оверлей не прислал done за durationMs + это время, считаем показ завершённым. */
  watchdogGraceMs: 10_000,
};
