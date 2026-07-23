/**
 * Dev-only mock data to preview signed-in UI without backend.
 * OAuth callback fails on localhost, so this intercepts fetch('/api/*')
 * with fake responses—no component/hook changes needed.
 */
import {
  COSMETICS,
  type AccessibleChannel,
  type ChannelSettings,
  type EquippedCosmetics,
  type HistoryEntry,
  type LeaderboardEntry,
  type ListedUser,
  type LivePresence,
  type MeResponse,
  type PublicChannelInfo,
  type ReputationStats,
  type StatsSummary,
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
    stardust: 999_999,
    // Own everything + equip a combo so the shop shows all cosmetics equippable and the signed-in
    // user's own nick/cards demo the effects live (dev preview only).
    ownedCosmetics: COSMETICS.map((c) => c.id),
    // Mid-ladder: Runner (500) earned, Twin runners (1000) and Dragon's breath (2000) still locked,
    // so the shop shows an earned frame and an in-progress one side by side.
    messagesTotal: 720,
    // Mid-ladder again on the watch axis: Tide (25h) and Embers (50h) earned, Canopy (75h) and
    // Storm (100h) still in progress.
    watchMinutesTotal: 3320,
    // Past the star seal's third rung (200) but not its fourth (500), so the ladder previews all
    // three states at once: earned+equipped, earned+equippable, and still locked.
    submissionsTotal: 220,
    // Lifetime earned dust — the "wealth" axis. High enough to show a mid-ladder wealth seal.
    dustEarnedTotal: 5400,
    equipped: {
      nickColor: '#8df0cc',
      nickColor2: '#a78bfa',
      nickFlow: true,
      nickEffect: 'nick-pulse',
      cardEffect: 'card-web',
      frame: 'frame-runner',
      seal: 'seal-star-lit',
      entrance: 'entrance-astral',
      entranceColor: '#ff8a3d',
    },
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
  imageDurationMs: 8_000,
  maxAudioDurationMs: 180_000,
  maxFileSizeBytes: 50 * 1024 * 1024,
  volume: 70,
  accepting: true,
  autoApproveYoutubeMusic: true,
  autoApproveYoutubeVideo: false,
  youtubeAutoMaxMinutes: 10,
  autoApproveGifs: true,
  chatBotLogin: 'tossitbot',
  chatBotReading: false,
  showSenderName: true,
  soundAlert: true,
  ttsName: false,
  ttsMessage: false,
  chatOverlayEnabled: true,
  chatBotReplies: false,
  botLocale: 'ru' as const,
  chatFontSize: 19,
  chatFadeSeconds: 0,
  chatShowBadges: true,
  chatShowLevel: true,
  chatRoleBorders: true,
  overlayPosition: 'bottom-right',
  overlaySize: 40,
  overlayMargin: 5,
  musicSeparate: true,
  musicPosition: 'top-right',
  musicSize: 30,
  musicMargin: 5,
  bgMusicPlaylist: null,
  bgMusicTracks: [
    { videoId: 'dQw4w9WgXcQ', title: 'NCS Mix — Chill Beats Vol. 1', durationSec: 212 },
    { videoId: 'jNQXAC9IVRw', title: 'Lofi Girl — Study Session', durationSec: 3721 },
    { videoId: '9bZkp7q19f0', title: 'Synthwave Drive — Night City', durationSec: 252 },
    { videoId: 'kJQP7kiw5Fk', title: 'Epic Orchestra — Rise Again', durationSec: 281 },
    { videoId: 'RgKAFK5djSk', title: 'Future Bass — Feel the Drop', durationSec: 229 },
    { videoId: 'OPf0YbXqDm0', title: 'Deep House — Midnight Groove' },
  ],
  bgMusicShuffle: false,
  bgMusicVolume: 50,
  bgMusicHidden: false,
  // Preview the background picker with both earned so the black hole can be selected/viewed.
  pageBackground: 'blackhole',
  earnedBackgrounds: ['nebula', 'blackhole'],
  description: 'Шли мемы — лучшее окажется на стриме 🎬',
  links: [
    { platform: 'twitch', url: 'https://twitch.tv/kravetsinside' },
    { platform: 'telegram', url: 'https://t.me/kravetsinside' },
    { platform: 'youtube', url: 'https://youtube.com/@kravetsinside' },
  ],
  theme: { accentHue: null, bgHue: null, bgTint: 0 },
};

const sub = (
  s: Partial<SubmissionSummary> & Pick<SubmissionSummary, 'id' | 'kind'>,
): SubmissionSummary => ({
  senderUserId: null,
  senderName: null,
  senderColor: null,
  senderColor2: null,
  senderNickFlow: false,
  senderEffect: null,
  senderCardEffect: null,
  senderFrame: null,
  senderSeal: null,
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
    senderLevel: 7,
    senderColor: '#ff6ad5',
    // Full nick ladder: gradient + flow + glow, so the top of the colour chain is on screen.
    senderColor2: '#a78bfa',
    senderNickFlow: true,
    senderEffect: 'nick-glow',
    senderCardEffect: 'card-stardust',
    senderFrame: 'frame-runner',
    senderSeal: 'seal-star-dormant',
    text: 'каеф, врубай этого на стрим 🔥🔥🔥',
    createdAt: t - 1 * min,
  }),
  sub({
    id: 's2',
    kind: 'image',
    mime: 'image/svg+xml',
    senderUserId: 'google:v2',
    senderName: 'pixel_witch',
    senderLevel: 4,
    senderColor: '#8df0cc',
    senderEffect: 'nick-pulse',
    senderCardEffect: 'card-levitation',
    senderSeal: 'seal-gem-clear',
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
    senderLevel: 2,
    senderColor: '#ffb86c',
    // Static gradient right next to meme_lord's flowing one — the difference is the whole upsell.
    senderColor2: '#ff5f6d',
    senderEffect: 'nick-glow',
    senderCardEffect: 'card-embers',
    // Schematic frames are meant to be worn WITH their card effect — coals under, embers above.
    senderFrame: 'frame-embers',
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
    senderLevel: 9,
    senderColor: '#a5b4fc',
    senderEffect: 'nick-pulse',
    senderCardEffect: 'card-rain',
    // The frame is meant to be worn WITH its card effect — rain above, tide along the bottom.
    senderFrame: 'frame-water',
    senderSeal: 'seal-star-lit',
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
    senderLevel: 1,
    senderColor: '#b0f5c0',
    senderCardEffect: 'card-snow',
    text: 'превед :)',
    createdAt: t - 18 * min,
  }),
  // Snow's neighbour on purpose: both are calm falls, and side by side it's obvious that a petal
  // is not a dot.
  sub({
    id: 's6',
    kind: 'text',
    senderUserId: 'twitch:v6',
    senderName: 'hanami',
    senderLevel: 5,
    senderColor: '#ffc2d8',
    senderCardEffect: 'card-sakura',
    senderFrame: 'frame-canopy',
    senderSeal: 'seal-gem-crown',
    text: 'принесла тебе весны в предложку',
    createdAt: t - 22 * min,
  }),
  sub({
    id: 's7',
    kind: 'text',
    senderUserId: 'twitch:v8',
    senderName: 'thunderstruck',
    senderLevel: 10,
    senderColor: '#f5f3ff',
    senderColor2: '#7c3aed',
    senderNickFlow: true,
    senderEffect: 'nick-pulse',
    senderCardEffect: 'card-lightning',
    senderFrame: 'frame-storm',
    senderSeal: 'seal-star-awake',
    text: 'бахнуло знатно, го смотреть',
    createdAt: t - 26 * min,
  }),
  sub({
    id: 's8',
    kind: 'text',
    senderUserId: 'twitch:v10',
    senderName: 'stargazer_9',
    senderLevel: 11,
    senderColor: '#a9c9ff',
    senderCardEffect: 'card-constellation',
    senderFrame: 'frame-dragon-breath',
    text: 'зачекинься под звёздами на секунду',
    createdAt: t - 30 * min,
  }),
  sub({
    id: 's9',
    kind: 'text',
    senderUserId: 'google:v11',
    senderName: 'seafoam',
    senderLevel: 2,
    senderColor: '#8fe3ff',
    senderCardEffect: 'card-bubbles',
    text: 'дыши глубже, стрим длинный будет',
    createdAt: t - 34 * min,
  }),
  sub({
    id: 's10',
    kind: 'text',
    senderUserId: 'twitch:v13',
    senderName: 'hollow_lure',
    senderLevel: 8,
    senderColor: '#57e0b0',
    senderCardEffect: 'card-wisp',
    text: 'иди на свет, там что-то интересное',
    createdAt: t - 38 * min,
  }),
  sub({
    id: 's11',
    kind: 'text',
    senderUserId: 'google:v14',
    senderName: 'runecaller',
    senderLevel: 9,
    senderColor: '#c7a8ff',
    senderCardEffect: 'card-runes',
    text: 'начертал на удачу, должно сработать',
    createdAt: t - 42 * min,
  }),
];

const MOCK_NOW: SubmissionSummary | null = sub({
  id: 'now1',
  kind: 'image',
  mime: 'image/svg+xml',
  senderUserId: 'twitch:v9',
  senderName: 'streamfan',
  senderLevel: 6,
  senderColor: '#ffd36e',
  senderEffect: 'nick-glow',
  senderCardEffect: 'card-levitation',
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

/** Numeric override from the query string, e.g. ?accentHue=210; null wipes the knob. */
function mockNum(key: string, fallback: number | null): number | null {
  const raw = new URLSearchParams(window.location.search).get(key);
  if (raw === null) return fallback;
  if (raw === '' || raw === 'null') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

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
    ttsEnabled: true,
    viewerLevel: 8,
    viewerXp: 34000, // between L8 (25600) and L9 (51200) — the hover reads 34000/51200
    isFounder: true,
    description: MOCK_SETTINGS.description,
    links: MOCK_SETTINGS.links,
    nickColor: '#ff9ed8',
    nickColor2: '#a78bfa',
    nickFlow: true,
    nickEffect: 'nick-glow',
    cardEffect: 'card-stardust',
    pageBackground: 'blackhole', // preview the earned black-hole background on the channel page
    // Themed on purpose: ?mock=1 is the only way to see a custom channel theme without a real
    // channel. Override per-run with ?accentHue=&bgHue=&bgTint=.
    theme: {
      accentHue: mockNum('accentHue', 300),
      bgHue: mockNum('bgHue', 30),
      bgTint: mockNum('bgTint', 40) ?? 40,
    },
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
    nickColor2: '#ff5f6d',
    nickFlow: true,
    nickEffect: 'nick-glow',
    cardEffect: 'card-lightning',
    seal: 'seal-star-awake',
    level: 8,
  },
  {
    userId: 'twitch:u_dev',
    login: 'kravetsinside',
    displayName: 'Kravets',
    value: 12,
    isFounder: true,
    nickColor: null,
    nickColor2: null,
    nickFlow: false,
    nickEffect: null,
    cardEffect: null,
    seal: 'seal-star-lit',
    level: 4,
  },
  {
    userId: 'twitch:other2',
    login: 'kravetsin',
    displayName: 'Kravetsin',
    value: 6,
    isFounder: false,
    nickColor: '#a5b4fc',
    nickColor2: null,
    nickFlow: false,
    nickEffect: 'nick-pulse',
    cardEffect: 'card-snow',
    seal: null,
    level: 10,
  },
  {
    userId: 'google:other3',
    login: 'slava',
    displayName: 'Слава Anfani',
    value: 5,
    isFounder: false,
    nickColor: '#ffd36e',
    nickColor2: null,
    nickFlow: false,
    nickEffect: 'nick-glow',
    cardEffect: 'card-rain',
    seal: null,
    level: 6,
  },
  {
    userId: 'google:other4',
    login: 'darina',
    displayName: 'Дмитриева Дарина',
    value: 2,
    isFounder: false,
    nickColor: '#b0f5c0',
    nickColor2: '#7dd3fc',
    // Static gradient, no flow — the contrast against the drifting rows above is the point.
    nickFlow: false,
    nickEffect: null,
    cardEffect: 'card-sakura',
    seal: null,
    level: 2,
  },
];

const MOCK_STATS: StatsSummary = {
  totalSubmissions: 1234,
  totalAired: 720, // galaxy unlocked (>=500), black hole in progress (720/1000) — previews both states
  totalRejected: 210,
  monthSubmissions: 189,
  todaySubmissions: 12,
  uniqueContributors: 84,
  monthMessages: 5230,
  monthWatchMinutes: 9840,
  daily: Array.from({ length: 14 }, (_, i) => {
    const dayMs = t - (13 - i) * 86_400_000;
    const submissions = 3 + Math.floor(Math.random() * 12);
    const aired = Math.floor(submissions * (0.4 + Math.random() * 0.4));
    return {
      day: new Date(dayMs).toISOString().slice(0, 10),
      submissions,
      aired,
      rejected: Math.floor((submissions - aired) * Math.random()),
      messages: 20 + Math.floor(Math.random() * 120),
      watchMinutes: 100 + Math.floor(Math.random() * 400),
    };
  }),
  byKind: [
    { kind: 'image', count: 520 },
    { kind: 'youtube', count: 310 },
    { kind: 'video', count: 190 },
    { kind: 'text', count: 120 },
    { kind: 'gif', count: 64 },
    { kind: 'audio', count: 30 },
  ],
};

const MOCK_LIVE: LivePresence = {
  live: true,
  provider: 'twitch',
  updatedAt: t,
  viewers: [
    { id: 'v1', login: 'meme_lord', name: 'meme_lord' },
    { id: 'v2', login: 'pixel_witch', name: 'Pixel Witch' },
    { id: 'v7', login: 'clip_gremlin', name: 'clip_gremlin' },
    { id: 'v3', login: 'dj_summer', name: 'DJ Summer' },
    { id: 'v9', login: 'streamfan', name: 'StreamFan' },
    { id: 'v12', login: 'regular_andy', name: 'Regular Andy' },
  ],
};

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
    return [{ login: 'kravetsinside', displayName: 'Kravets', avatarUrl: null, overlays: 1 }];
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
        cosmetics: 1,
        ownsChannel: true,
      },
      other: {
        login: 'kravets_twitch',
        displayName: 'KravetsTwitch',
        avatarUrl: null,
        stardust: 1200,
        cosmetics: 4,
        ownsChannel: false,
      },
    };
  }

  if (pathname === '/api/channel-points/status') {
    return { connected: false, externalName: null, hasStardust: false, hasYoutube: false };
  }
  // add (POST) / remove (DELETE) for either reward.
  if (pathname === '/api/channel-points/stardust' || pathname === '/api/channel-points/youtube') {
    return { ok: true };
  }

  if (pathname === '/api/cosmetics/buy') {
    const u = MOCK_ME.user!;
    const body = init?.body ? (JSON.parse(String(init.body)) as { itemId?: string }) : {};
    const item = COSMETICS.find((c) => c.id === body.itemId);
    // Mirror the server: ladder items only unlock once the rung below them is owned.
    if (item?.requires && !u.ownedCosmetics.includes(item.requires)) return cosmeticState();
    if (item && !u.ownedCosmetics.includes(item.id)) {
      u.ownedCosmetics = [...u.ownedCosmetics, item.id];
      u.stardust -= item.costDust;
    }
    return cosmeticState();
  }
  if (pathname === '/api/cosmetics/equip') {
    const u = MOCK_ME.user!;
    const body = init?.body ? (JSON.parse(String(init.body)) as EquippedCosmetics) : {};
    const next: EquippedCosmetics = { ...u.equipped };
    for (const slot of [
      'nickColor',
      'nickColor2',
      'nickEffect',
      'cardEffect',
      'entrance',
      'entranceColor',
    ] as const) {
      if (slot in body) next[slot] = body[slot] || undefined;
    }
    if ('nickFlow' in body) next.nickFlow = body.nickFlow || undefined;
    // Mirror the server's ladder: an upgrade can't outlive the rung it stands on.
    if (!next.nickColor) next.nickColor2 = undefined;
    if (!next.nickColor2) next.nickFlow = undefined;
    // entranceColor persists across entrance changes (the render gates on the portal being equipped).
    u.equipped = next;
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
        return { now: MOCK_NOW, queue: MOCK_PENDING };
      case 'stats':
        return MOCK_STATS;
      case 'live':
        return MOCK_LIVE;
      case 'settings': {
        // PUT merges the patch so sliders/toggles don't snap back on the echoed response.
        if (init?.method === 'PUT' && init.body) {
          Object.assign(MOCK_SETTINGS, JSON.parse(String(init.body)) as Partial<ChannelSettings>);
        }
        return MOCK_SETTINGS;
      }
      case 'music/command':
        return { ok: true };
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
      case 'music/tracks': {
        // GET returns the list + DJ knobs (MusicDashboard); PUT reorders/removes; DELETE wipes.
        if (init?.method === 'DELETE') {
          MOCK_SETTINGS.bgMusicTracks = [];
          MOCK_SETTINGS.bgMusicPlaylist = null;
          return { tracks: MOCK_SETTINGS.bgMusicTracks };
        }
        if (init?.method === 'PUT' && init.body) {
          const body = JSON.parse(String(init.body)) as { videoIds?: string[] };
          const byId = new Map(MOCK_SETTINGS.bgMusicTracks.map((tr) => [tr.videoId, tr]));
          MOCK_SETTINGS.bgMusicTracks = (body.videoIds ?? []).flatMap((id) => {
            const tr = byId.get(id);
            return tr ? [tr] : [];
          });
          return { tracks: MOCK_SETTINGS.bgMusicTracks };
        }
        return {
          tracks: MOCK_SETTINGS.bgMusicTracks,
          shuffle: MOCK_SETTINGS.bgMusicShuffle,
          volume: MOCK_SETTINGS.bgMusicVolume,
          hidden: MOCK_SETTINGS.bgMusicHidden,
        };
      }
      case 'music/config': {
        // DJ knobs (shuffle/volume/hidden) — owner or moderator.
        if (init?.body) {
          const b = JSON.parse(String(init.body)) as {
            shuffle?: boolean;
            volume?: number;
            hidden?: boolean;
          };
          if (typeof b.shuffle === 'boolean') MOCK_SETTINGS.bgMusicShuffle = b.shuffle;
          if (typeof b.volume === 'number') MOCK_SETTINGS.bgMusicVolume = b.volume;
          if (typeof b.hidden === 'boolean') MOCK_SETTINGS.bgMusicHidden = b.hidden;
        }
        return {
          tracks: MOCK_SETTINGS.bgMusicTracks,
          shuffle: MOCK_SETTINGS.bgMusicShuffle,
          volume: MOCK_SETTINGS.bgMusicVolume,
          hidden: MOCK_SETTINGS.bgMusicHidden,
        };
      }
      case 'integrations':
        return []; // donation integrations
      case 'integrations/donatello':
        return {
          provider: 'donatello',
          connected: true,
          callbackUrl: 'https://toss-it.org/api/donations/donatello/ch_dev',
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
