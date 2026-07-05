/**
 * Dev-only mock data to preview signed-in UI without backend.
 * OAuth callback fails on localhost, so this intercepts fetch('/api/*')
 * with fake responses—no component/hook changes needed.
 */
import {
  COSMETICS,
  type AccessibleChannel,
  type ChannelSettings,
  type HistoryEntry,
  type LeaderboardEntry,
  type ListedUser,
  type MeResponse,
  type PublicChannelInfo,
  type ReputationStats,
  type SubmissionSummary,
} from '@tmw/shared';

const FLAG_KEY = 'tmw_mock';

function syncFlagFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (!p.has('mock')) return;
    const v = p.get('mock');
    if (v === '0' || v === 'false') localStorage.removeItem(FLAG_KEY);
    else localStorage.setItem(FLAG_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function isMockOn(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

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
    stardust: 250,
    ownedCosmetics: [],
    equipped: {},
    // false so the "link Twitch" shop banner is visible in mock previews.
    hasTwitch: false,
  },
  channel: { id: 'ch_dev', overlayToken: 'dev-overlay-token-7f3a91' },
};

const MOCK_CHANNELS: AccessibleChannel[] = [
  { channelId: 'ch_dev', login: 'kravetsinside', displayName: 'Kravets', role: 'owner' },
  {
    channelId: 'ch_friend',
    login: 'friendstreamer',
    displayName: 'FriendStreamer',
    role: 'moderator',
  },
];

const MOCK_SETTINGS: ChannelSettings = {
  maxDurationMs: 30_000,
  maxAudioDurationMs: 180_000,
  maxFileSizeBytes: 50 * 1024 * 1024,
  volume: 70,
  accepting: true,
  autoApproveYoutube: false,
  autoApproveGifs: true,
  chatBotLogin: 'tossitbot',
  chatBotReading: false,
  showSenderName: true,
  soundAlert: true,
  ttsName: false,
  ttsMessage: false,
  chatOverlayEnabled: true,
  overlayPosition: 'bottom-right',
  overlaySize: 40,
  overlayMargin: 5,
  musicSeparate: false,
  musicPosition: 'top-right',
  musicSize: 30,
  musicMargin: 5,
  description: 'Шли мемы — лучшее окажется на стриме 🎬',
  links: [
    { platform: 'twitch', url: 'https://twitch.tv/kravetsinside' },
    { platform: 'telegram', url: 'https://t.me/kravetsinside' },
    { platform: 'youtube', url: 'https://youtube.com/@kravetsinside' },
  ],
};

const sub = (
  s: Partial<SubmissionSummary> & Pick<SubmissionSummary, 'id' | 'kind'>,
): SubmissionSummary => ({
  senderUserId: null,
  senderName: null,
  senderColor: null,
  senderEffect: null,
  senderCardEffect: null,
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
    senderColor: '#ff6ad5',
    senderEffect: 'nick-glow',
    senderCardEffect: 'card-stardust',
    text: 'каеф, врубай этого на стрим 🔥🔥🔥',
    createdAt: t - 1 * min,
  }),
  sub({
    id: 's2',
    kind: 'image',
    mime: 'image/svg+xml',
    senderUserId: 'google:v2',
    senderName: 'pixel_witch',
    senderColor: '#8df0cc',
    senderCardEffect: 'card-levitation',
    text: 'смотри какой котик получился',
    url: IMG,
    durationMs: 8000,
    createdAt: t - 3 * min,
  }),
  sub({
    id: 's-video',
    kind: 'video',
    mime: 'video/mp4',
    senderUserId: 'twitch:v7',
    senderName: 'clip_gremlin',
    text: 'зацени нарезку, го на стрим',
    url: '/mock-video.mp4',
    durationMs: 12_000,
    createdAt: t - 5 * min,
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
  'twitch:v1': {
    accepted: 14,
    rejected: 2,
    whitelistedChannels: 1,
    bannedChannels: 0,
    isFounder: false,
  },
  'google:v2': {
    accepted: 31,
    rejected: 0,
    whitelistedChannels: 4,
    bannedChannels: 0,
    isFounder: true,
  },
  'twitch:v3': {
    accepted: 3,
    rejected: 5,
    whitelistedChannels: 0,
    bannedChannels: 1,
    isFounder: false,
  },
  'twitch:v9': {
    accepted: 58,
    rejected: 1,
    whitelistedChannels: 6,
    bannedChannels: 0,
    isFounder: false,
  },
};

const MOCK_MODERATORS: ListedUser[] = [user('twitch:m1', 'trusty_mod', 'Trusty Mod', 60 * 24 * 20)];

function mockPublicChannel(login: string): PublicChannelInfo {
  return {
    login,
    displayName: login,
    avatarUrl: null,
    accepting: true,
    maxDurationMs: MOCK_SETTINGS.maxDurationMs,
    maxAudioDurationMs: MOCK_SETTINGS.maxAudioDurationMs,
    maxFileSizeBytes: MOCK_SETTINGS.maxFileSizeBytes,
    autoApproveGifs: MOCK_SETTINGS.autoApproveGifs,
    isFounder: true,
    description: MOCK_SETTINGS.description,
    links: MOCK_SETTINGS.links,
    nickColor: '#ff9ed8',
    nickEffect: 'nick-glow',
    cardEffect: 'card-stardust',
  };
}

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  {
    userId: 'twitch:other1',
    login: 'darkblane',
    displayName: 'DarkBlane_',
    value: 12,
    isFounder: false,
    nickColor: '#ffb86c',
    nickEffect: 'nick-glow',
    cardEffect: 'card-levitation',
  },
  {
    userId: 'twitch:u_dev',
    login: 'kravetsinside',
    displayName: 'Kravets',
    value: 12,
    isFounder: true,
    nickColor: null,
    nickEffect: null,
    cardEffect: null,
  },
  {
    userId: 'twitch:other2',
    login: 'kravetsin',
    displayName: 'Kravetsin',
    value: 6,
    isFounder: false,
    nickColor: '#8df0cc',
    nickEffect: null,
    cardEffect: 'card-stardust',
  },
  {
    userId: 'google:other3',
    login: 'slava',
    displayName: 'Слава Anfani',
    value: 5,
    isFounder: false,
    nickColor: null,
    nickEffect: null,
    cardEffect: null,
  },
  {
    userId: 'google:other4',
    login: 'darina',
    displayName: 'Дмитриева Дарина',
    value: 2,
    isFounder: false,
    nickColor: null,
    nickEffect: null,
    cardEffect: null,
  },
];

function cosmeticState() {
  const u = MOCK_ME.user!;
  return { stardust: u.stardust, ownedCosmetics: u.ownedCosmetics, equipped: u.equipped };
}

function route(pathname: string, init?: RequestInit): unknown | undefined {
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
  if (pathname === '/api/admin/bot') return { connected: true, login: 'tossitbot' };
  if (pathname === '/api/admin/live-channels') {
    return [
      { login: 'kravetsinside', displayName: 'Kravets', avatarUrl: null, overlays: 1 },
    ];
  }
  if (pathname === '/api/admin/leaderboard-exclusions') {
    if (init?.method === 'POST') return { ok: true, login: 'wizebot' };
    if (init?.method === 'DELETE') return { ok: true };
    return [
      { login: 'wizebot', note: 'WizeBot', createdAt: Date.now() - 86_400_000 },
      { login: 'tune2livebot', note: 'Tune2LiveBot', createdAt: Date.now() - 3_600_000 },
    ];
  }
  if (pathname.startsWith('/api/admin/leaderboard-exclusions/')) return { ok: true };
  if (pathname === '/api/admin/users') {
    return [
      {
        id: 'twitch:u_dev',
        login: 'kravetsinside',
        displayName: 'Kravets',
        avatarUrl: null,
        stardust: 250,
        isFounder: true,
        createdAt: Date.now() - 86_400_000 * 20,
        identities: ['twitch', 'google'],
        hasChannel: true,
        pendingDust: 0,
        ownedCosmetics: 2,
        accepted: 34,
        rejected: 2,
        whitelistedIn: 3,
        bannedIn: 0,
        isLive: true,
      },
      {
        id: 'google:other3',
        login: 'slava',
        displayName: 'Слава Anfani',
        avatarUrl: null,
        stardust: 40,
        isFounder: false,
        createdAt: Date.now() - 86_400_000 * 3,
        identities: ['google'],
        hasChannel: false,
        pendingDust: 17,
        ownedCosmetics: 0,
        accepted: 5,
        rejected: 4,
        whitelistedIn: 0,
        bannedIn: 1,
        isLive: false,
      },
    ];
  }
  if (pathname.startsWith('/api/admin/users/')) return { ok: true, stardust: 999 };
  if (pathname === '/api/auth/link/pending') {
    return {
      current: {
        login: 'kravetsinside',
        displayName: 'Kravets',
        avatarUrl: null,
        stardust: 250,
        ownsChannel: true,
      },
      other: {
        login: 'kravets_twitch',
        displayName: 'KravetsTwitch',
        avatarUrl: null,
        stardust: 1200,
        ownsChannel: false,
      },
    };
  }

  if (pathname === '/api/cosmetics/buy') {
    const u = MOCK_ME.user!;
    const body = init?.body ? (JSON.parse(String(init.body)) as { itemId?: string }) : {};
    const item = COSMETICS.find((c) => c.id === body.itemId);
    if (item && !u.ownedCosmetics.includes(item.id)) {
      u.ownedCosmetics = [...u.ownedCosmetics, item.id];
      u.stardust -= item.costDust;
    }
    return cosmeticState();
  }
  if (pathname === '/api/cosmetics/equip') {
    const u = MOCK_ME.user!;
    const body = init?.body
      ? (JSON.parse(String(init.body)) as {
          nickColor?: string | null;
          nickEffect?: string | null;
          cardEffect?: string | null;
        })
      : {};
    if ('nickColor' in body) u.equipped = { ...u.equipped, nickColor: body.nickColor || undefined };
    if ('nickEffect' in body)
      u.equipped = { ...u.equipped, nickEffect: body.nickEffect || undefined };
    if ('cardEffect' in body)
      u.equipped = { ...u.equipped, cardEffect: body.cardEffect || undefined };
    return cosmeticState();
  }

  const cm = pathname.match(/^\/api\/c\/([^/]+)(?:\/(leaderboard))?$/);
  if (cm) return cm[2] === 'leaderboard' ? MOCK_LEADERBOARD : mockPublicChannel(cm[1]!);

  const m = pathname.match(/^\/api\/dashboard\/[^/]+\/(.+)$/);
  if (m) {
    switch (m[1]) {
      case 'pending':
        return new URLSearchParams(window.location.search).has('empty') ? [] : MOCK_PENDING;
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
      case 'integrations':
        return []; // donation integrations
      case 'integrations/donatello':
        return {
          provider: 'donatello',
          connected: true,
          callbackUrl: 'https://toss-it.win/api/donations/donatello/ch_dev',
          key: 'demo0000111122223333444455556666',
        };
      default:
        return {};
    }
  }
  return undefined;
}

interface PatchedFetch {
  __mockPatched?: boolean;
}

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
        const data = route(pathname, init);
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
    console.info('[dev] mock mode enabled');
    queueMicrotask(mountBadge);
  }
}

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
