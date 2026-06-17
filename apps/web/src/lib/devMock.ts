/**
 * DEV-ONLY мок данных для оценки внешнего вида без логина/бэкенда.
 *
 * Зачем: OAuth-callback не работает на localhost, поэтому залогиненный UI
 * (оболочка, кокпит дашборда, карточка аккаунта) раньше можно было смотреть
 * только в проде. Здесь мы подменяем `fetch('/api/*')` и сокет фейковыми
 * данными — никакие хуки/провайдеры/компоненты не меняются.
 *
 * Включение: открыть `http://localhost:5173/?mock=1` (флаг запоминается в
 * localStorage). Выключение: `?mock=0`. Работает ТОЛЬКО в dev-сборке.
 */
import type {
  AccessibleChannel,
  ChannelSettings,
  HistoryEntry,
  ListedUser,
  MeResponse,
  ReputationStats,
  SubmissionSummary,
} from '@tmw/shared';

const FLAG_KEY = 'tmw_mock';

/** ?mock=1/0 из URL → localStorage (вызывается один раз при установке). */
function syncFlagFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (!p.has('mock')) return;
    const v = p.get('mock');
    if (v === '0' || v === 'false') localStorage.removeItem(FLAG_KEY);
    else localStorage.setItem(FLAG_KEY, '1');
  } catch {
    /* приватный режим */
  }
}

/** Включён ли мок прямо сейчас (читается живьём — logout его гасит). */
export function isMockOn(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

// ─── Данные ──────────────────────────────────────────────────────────────
const t = Date.now();
const min = 60_000;

const IMG = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320'>" +
    "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
    "<stop offset='0' stop-color='#8df0cc'/><stop offset='1' stop-color='#0d1111'/>" +
    '</linearGradient></defs>' +
    "<rect width='480' height='320' fill='url(#g)'/>" +
    "<text x='50%' y='56%' font-family='monospace' font-weight='700' font-size='84' " +
    "text-anchor='middle' fill='#06201a'>MEME</text></svg>",
)}`;

const MOCK_ME: MeResponse = {
  user: {
    id: 'twitch:u_dev',
    login: 'kravetsinside',
    displayName: 'Kravets',
    avatarUrl: null,
    isFounder: true,
    isAdmin: true,
  },
  channel: { id: 'ch_dev', overlayToken: 'dev-overlay-token-7f3a91' },
};

const MOCK_CHANNELS: AccessibleChannel[] = [
  { channelId: 'ch_dev', login: 'kravetsinside', displayName: 'Kravets', role: 'owner' },
  { channelId: 'ch_friend', login: 'friendstreamer', displayName: 'FriendStreamer', role: 'moderator' },
];

const MOCK_SETTINGS: ChannelSettings = {
  maxDurationMs: 30_000,
  maxAudioDurationMs: 180_000,
  maxFileSizeBytes: 50 * 1024 * 1024,
  volume: 70,
  accepting: true,
  showSenderName: true,
  soundAlert: true,
  ttsName: false,
  ttsMessage: false,
  overlayPosition: 'bottom-right',
  overlaySize: 40,
  overlayMargin: 5,
  musicSeparate: false,
  musicPosition: 'top-right',
  musicSize: 30,
  musicMargin: 5,
};

const sub = (s: Partial<SubmissionSummary> & Pick<SubmissionSummary, 'id' | 'kind'>): SubmissionSummary => ({
  senderUserId: null,
  senderName: null,
  mime: 'text/plain',
  text: null,
  durationMs: 6000,
  createdAt: t,
  url: '',
  ...s,
});

const MOCK_PENDING: SubmissionSummary[] = [
  sub({
    id: 's1',
    kind: 'text',
    senderUserId: 'twitch:v1',
    senderName: 'meme_lord',
    text: 'каеф, врубай этого на стрим 🔥🔥🔥',
    createdAt: t - 1 * min,
  }),
  sub({
    id: 's2',
    kind: 'image',
    mime: 'image/svg+xml',
    senderUserId: 'google:v2',
    senderName: 'pixel_witch',
    text: 'смотри какой котик получился',
    url: IMG,
    durationMs: 8000,
    createdAt: t - 3 * min,
  }),
  sub({
    id: 's3',
    kind: 'youtube',
    mime: 'video/youtube',
    senderUserId: 'twitch:v3',
    senderName: 'dj_summer',
    youtubeId: 'dQw4w9WgXcQ',
    text: 'трек на фон, зайдёт',
    durationMs: 20_000,
    createdAt: t - 7 * min,
  }),
  sub({
    id: 's4',
    kind: 'text',
    senderUserId: null,
    senderName: 'anon_viewer',
    text: 'привет со стрима, давно тебя смотрю — респект за контент!',
    createdAt: t - 12 * min,
  }),
  sub({
    id: 's5',
    kind: 'text',
    senderUserId: 'google:v5',
    senderName: 'newbie123',
    text: 'превед :)',
    createdAt: t - 18 * min,
  }),
];

const MOCK_NOW: SubmissionSummary | null = sub({
  id: 'now1',
  kind: 'image',
  mime: 'image/svg+xml',
  senderUserId: 'twitch:v9',
  senderName: 'streamfan',
  text: 'на удачу',
  url: IMG,
  durationMs: 8000,
  createdAt: t - 30_000,
});

const user = (
  id: string,
  login: string,
  displayName: string,
  agoMin: number,
  isFounder = false,
): ListedUser => ({
  userId: id,
  login,
  displayName,
  addedAt: t - agoMin * min,
  isFounder,
});

const MOCK_WHITELIST: ListedUser[] = [
  user('google:v2', 'pixel_witch', 'Pixel Witch', 60 * 24 * 3, true),
  user('twitch:v9', 'streamfan', 'StreamFan', 60 * 24 * 12),
  user('google:v12', 'regular_andy', 'Regular Andy', 60 * 24 * 40),
];

const MOCK_BANS: ListedUser[] = [
  user('twitch:b1', 'spammer_99', 'spammer_99', 60 * 24 * 2),
  user('google:b2', 'rude_guy', 'rude_guy', 60 * 24 * 9),
];

const hist = (
  id: string,
  senderName: string,
  kind: SubmissionSummary['kind'],
  status: HistoryEntry['status'],
  agoMin: number,
  senderUserId: string | null = null,
  isFounder = false,
): HistoryEntry => ({
  ...sub({ id, kind, senderName, senderUserId, createdAt: t - agoMin * min }),
  status,
  isFounder,
});

const MOCK_HISTORY: HistoryEntry[] = [
  hist('h1', 'streamfan', 'image', 'played', 5, 'twitch:v9'),
  hist('h2', 'meme_lord', 'video', 'played', 22, 'twitch:v1'),
  hist('h3', 'spammer_99', 'text', 'rejected', 38, 'twitch:b1'),
  hist('h4', 'dj_summer', 'audio', 'expired', 64, 'twitch:v3'),
  hist('h5', 'pixel_witch', 'image', 'played', 95, 'google:v2', true),
];

const MOCK_REPUTATION: Record<string, ReputationStats> = {
  'twitch:v1': { accepted: 14, rejected: 2, whitelistedChannels: 1, bannedChannels: 0, isFounder: false },
  'google:v2': { accepted: 31, rejected: 0, whitelistedChannels: 4, bannedChannels: 0, isFounder: true },
  'twitch:v3': { accepted: 3, rejected: 5, whitelistedChannels: 0, bannedChannels: 1, isFounder: false },
  'twitch:v9': { accepted: 58, rejected: 1, whitelistedChannels: 6, bannedChannels: 0, isFounder: false },
};

const MOCK_MODERATORS: ListedUser[] = [user('twitch:m1', 'trusty_mod', 'Trusty Mod', 60 * 24 * 20)];

// ─── Роутер ──────────────────────────────────────────────────────────────
/** Возвращает мок-тело для известной ручки, иначе undefined (→ реальный fetch). */
function route(pathname: string): unknown | undefined {
  if (pathname === '/api/auth/me') return MOCK_ME;
  if (pathname === '/api/auth/logout') {
    try {
      localStorage.removeItem(FLAG_KEY);
    } catch {
      /* ignore */
    }
    return {};
  }
  if (pathname === '/api/me/channels') return MOCK_CHANNELS;

  const m = pathname.match(/^\/api\/dashboard\/[^/]+\/(.+)$/);
  if (m) {
    switch (m[1]) {
      case 'pending':
        return MOCK_PENDING;
      case 'now':
        return { now: MOCK_NOW };
      case 'settings':
        return MOCK_SETTINGS;
      case 'whitelist':
        return MOCK_WHITELIST;
      case 'bans':
        return MOCK_BANS;
      case 'history':
        return MOCK_HISTORY;
      case 'reputation':
        return MOCK_REPUTATION;
      case 'moderators':
        return MOCK_MODERATORS;
      default:
        return {}; // действия (approve/reject/skip/invite/save) → ok
    }
  }
  return undefined;
}

interface PatchedFetch {
  __mockPatched?: boolean;
}

/** Устанавливает перехват fetch (только dev). Вызвать до первого рендера. */
export function installDevMock() {
  if (!import.meta.env.DEV) return;
  syncFlagFromUrl();
  if ((window.fetch as PatchedFetch).__mockPatched) return;

  const orig = window.fetch.bind(window);
  const patched = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isMockOn()) {
      const href =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const { pathname } = new URL(href, window.location.origin);
      if (pathname.startsWith('/api/')) {
        const data = route(pathname);
        if (data !== undefined) {
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
      }
    }
    return orig(input, init);
  }) as typeof window.fetch & PatchedFetch;
  patched.__mockPatched = true;
  window.fetch = patched;

  if (isMockOn()) {
    console.info('[dev] mock-режим ВКЛ — данные фейковые. Выключить: ?mock=0');
    queueMicrotask(mountBadge);
  }
}

/** Маленький угловой бейдж, чтобы скриншоты не путали с реальными данными. */
function mountBadge() {
  if (document.getElementById('dev-mock-badge')) return;
  const el = document.createElement('div');
  el.id = 'dev-mock-badge';
  el.textContent = 'DEV · MOCK';
  el.style.cssText =
    'position:fixed;left:12px;bottom:12px;z-index:70;font:560 10px/1 ui-monospace,monospace;' +
    'letter-spacing:.16em;text-transform:uppercase;color:#8df0cc;background:#06201a;' +
    'border:1px solid #8df0cc55;padding:6px 10px;pointer-events:none;opacity:.85';
  document.body.appendChild(el);
}
