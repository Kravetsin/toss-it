/**
 * Dev-only mock data to preview signed-in UI without backend.
 * OAuth callback fails on localhost, so this intercepts fetch('/api/*')
 * with fake responses—no component/hook changes needed.
 */
import {
  BET,
  colorOfSlot,
  COSMETICS,
  maxBet,
  parseColor,
  PAYOUT,
  payoutFor,
  WHEEL_ORDER,
  type AccessibleChannel,
  type ChannelSettings,
  type DirectoryChannel,
  type EquippedCosmetics,
  type LeaderboardEntry,
  type ListedUser,
  type LivePresence,
  type MeResponse,
  type MusicDisplay,
  type OnboardingStatus,
  type PublicChannelInfo,
  type ReputationStats,
  type DailyStat,
  type StatsPeriod,
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
    // A bought name over a different platform one, so the shop card and the hover both have
    // something to show without a round trip.
    displayName: '长尺丹丷乇丁丂',
    platformName: 'Kravets',
    hasCustomName: true,
    avatarUrl: null,
    isFounder: true,
    isAdmin: true,
    stardust: 999_999,
    // Own everything + equip a combo so the shop shows all cosmetics equippable and the signed-in
    // user's own nick/cards demo the effects live (dev preview only).
    ownedCosmetics: COSMETICS.map((c) => c.id),
    // Past the core seal's first rung (500) but short of its full ring (3000), so that ladder
    // previews a LOCKED rung counting up; also earns every message-frame.
    messagesTotal: 2100,
    // Mid-ladder on the watch axis (the in-progress demo lives here now): Tide (25h) and Embers (50h)
    // earned, Canopy (75h) and Storm (100h) still in progress — and the eye seal (100h) + its colour
    // upgrade (250h) still locked, so the shop previews a colourable seal's LOCKED/progress state too.
    watchMinutesTotal: 3320,
    // Past both nova rungs (25 / 250) but short of its colour upgrade (500), so the shop previews an
    // earned two-rung ladder with the colour still counting up.
    submissionsTotal: 320,
    // Lifetime earned dust — the hoarding axis, no seal on it yet (the black hole moved to spending).
    dustEarnedTotal: 5400,
    // Lifetime spent dust. Past the black hole's first rung (2000) but not its second (10k), so that
    // ladder previews the LOCKED rung the nova's no longer shows.
    dustSpentTotal: 5400,
    // The breadth axis, per channel. Tuned so every new ladder previews mid-climb: 4 channels clear
    // the moons' first bar (25 messages) but only 2 clear its second (100); 2 of 3 channels clear the
    // rings' first bar (10 h); the keyring sits one channel short of its second rung.
    breadth: {
      messages: [420, 180, 96, 41, 12],
      submissions: [12, 6, 3, 1],
      watchMinutes: [1800, 700, 240],
      moderated: 2,
    },
    equipped: {
      nickColor: '#8df0cc',
      nickColor2: '#a78bfa',
      nickFlow: true,
      nickEffect: 'nick-pulse',
      cardEffect: 'card-web',
      // Per-effect saved colours — the picker inside each effect's card shows these; owned via
      // ownedCosmetics = every catalog id (so both colour upgrades are owned).
      cardEffectColors: {
        'card-butterflies': '#5ad1ff',
        'card-eyes': '#7cff4f',
        'card-web': '#ff8fd4',
      },
      // Saved per-seal colours — the picker inside each colourable seal's row seeds from these.
      sealColors: {
        'seal-core': '#5ad1ff',
        'seal-hourglass': '#7cff4f',
        'seal-swarm': '#c9b6ff',
        'seal-moons': '#ffb35c',
        'seal-keyring': '#ff8fd4',
        'seal-lanterns': '#ffd166',
        'seal-rings': '#a0e34a',
      },
      frame: 'frame-runner',
      frameColors: { 'frame-runner': '#ff6ec7' },
      seal: 'seal-nova',
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
  // Mirrors the server's registry, `!play` left off — the state the command card has to show.
  chatCommands: [
    { name: 'tossit', aliases: ['help', 'commands'], enabled: true },
    { name: 'balance', aliases: ['dust'], enabled: true },
    { name: 'xp', aliases: ['level', 'уровень', 'рівень'], enabled: true },
    { name: 'queue', aliases: ['очередь', 'черга'], enabled: true },
    { name: 'play', aliases: ['sr'], enabled: false },
    { name: 'tts', aliases: ['say'], enabled: true },
  ],
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
  autoApproveText: false,
  // Mock owner has no linked Twitch (MOCK_ME.hasTwitch=false), so the bot isn't usable here and has
  // no login — matches production (chatBotLogin is non-null only for Twitch-linked owners). This
  // hides ChatDustSettings and surfaces ChatUpsellCard, the consistent not-linked home view.
  chatBotLogin: null,
  chatBotReading: false,
  showSenderName: true,
  soundAlert: true,
  ttsName: false,
  ttsMessage: false,
  chatOverlayEnabled: true,
  chatBotReplies: false,
  chatPlayCommand: true,
  chatTtsCommand: true,
  chatSkipCommand: true,
  chatRouletteCommand: true,
  skipVotesNeeded: 3,
  botLocale: 'ru' as const,
  chatFontSize: 19,
  chatFadeSeconds: 0,
  chatBgOpacity: 58,
  chatCompact: false,
  chatRadius: 12,
  chatGap: 40,
  chatShowBadges: true,
  chatShowLevel: true,
  chatRoleBorders: true,
  overlayPosition: 'bottom-right',
  overlaySize: 40,
  allowViewerPosition: true,
  overlayMargin: 5,
  youtubeAsMusic: true,
  parallelSlots: true,
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
  bgMusicDisplay: 'compact',
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
  senderPlatformName: null,
  senderColor: null,
  senderColor2: null,
  senderNickFlow: false,
  senderEffect: null,
  senderCardEffect: null,
  senderCardEffectColor: null,
  senderCardEffectColor2: null,
  senderFrame: null,
  senderFrameColor: null,
  senderSeal: null,
  senderSealColor: null,
  mime: 'text/plain',
  text: null,
  durationMs: 6000,
  createdAt: t,
  url: '',
  ...s,
});

const MOCK_PENDING: SubmissionSummary[] = [
  // A bought display name: the card shows the name, hovering it reveals the account it belongs to.
  // Sits first so the tooltip is the first thing to try in the queue. The pair is deliberately a
  // stylised CJK name over an ordinary Latin login — the case the item exists for.
  sub({
    id: 's0',
    kind: 'text',
    senderUserId: 'twitch:v0',
    senderName: '工马尺口从丹刀匚卄工长',
    senderPlatformName: 'ironmachine_xX21',
    senderLevel: 6,
    senderColor: '#8df0cc',
    text: 'имя купил, а вот мем — нет',
    createdAt: t - 30_000,
  }),
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
    // The frame colour upgrade, so the runner shows a non-default tint without a picker.
    senderFrameColor: '#ff6ec7',
    senderSeal: 'seal-nova-ember',
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
    senderSeal: 'seal-swarm',
    senderSealColor: '#c9b6ff',
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
    senderSeal: 'seal-nova',
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
    senderSeal: 'seal-void',
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
    senderSeal: 'seal-lanterns',
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
  sub({
    id: 's12',
    kind: 'text',
    senderUserId: 'twitch:v15',
    senderName: 'mothwing',
    senderLevel: 6,
    senderColor: '#ff8fd6',
    senderCardEffect: 'card-butterflies',
    // Showcase the colour upgrade: this sender recoloured their butterflies cyan.
    senderCardEffectColor: '#5ad1ff',
    // The butterfly seal, recoloured cyan via its own colour upgrade.
    senderSeal: 'seal-core',
    senderSealColor: '#5ad1ff',
    text: 'замри на секунду — они сядут',
    createdAt: t - 46 * min,
  }),
  sub({
    id: 's13',
    kind: 'text',
    senderUserId: 'twitch:v16',
    senderName: 'peekaboo',
    senderLevel: 7,
    senderColor: '#ff5a7a',
    senderCardEffect: 'card-eyes',
    // Showcase the (now general) colour upgrade recolouring the eyes too — acid green.
    senderCardEffectColor: '#7CFF4F',
    senderSeal: 'seal-hourglass',
    senderSealColor: '#7CFF4F',
    text: 'не оборачивайся',
    createdAt: t - 50 * min,
  }),
  sub({
    id: 's14',
    kind: 'text',
    senderUserId: 'twitch:v17',
    senderName: 'wickkeeper',
    senderLevel: 5,
    senderColor: '#ffca7a',
    senderCardEffect: 'card-candles',
    text: 'пока горят — можно просить',
    createdAt: t - 54 * min,
  }),
  sub({
    id: 's15',
    kind: 'text',
    senderUserId: 'twitch:v18',
    senderName: 'seamripper',
    senderLevel: 8,
    senderColor: '#b9a7ff',
    senderCardEffect: 'card-claws',
    // Showcase the claw colour upgrade — the wound bleeds crimson instead of the default violet.
    senderCardEffectColor: '#ff4d6a',
    text: 'она рвётся, если долго смотреть',
    createdAt: t - 58 * min,
  }),
  sub({
    id: 's16',
    kind: 'text',
    senderUserId: 'twitch:v19',
    senderName: 'piltover',
    senderLevel: 9,
    senderColor: '#6fd8ff',
    senderCardEffect: 'card-hextech',
    // Showcase the lattice colour upgrade — gold instead of the default hextech blue.
    senderCardEffectColor: '#ffb43c',
    text: 'заряд пошёл',
    createdAt: t - 62 * min,
  }),
  sub({
    id: 's17',
    kind: 'text',
    senderUserId: 'twitch:v20',
    senderName: 'deepcurrent',
    senderLevel: 6,
    senderColor: '#9db8ff',
    senderCardEffect: 'card-jelly',
    text: 'тут глубоко',
    createdAt: t - 66 * min,
  }),
  sub({
    id: 's18',
    kind: 'text',
    senderUserId: 'twitch:v21',
    senderName: 'glasstapper',
    senderLevel: 5,
    senderColor: '#dcf2ff',
    senderCardEffect: 'card-hextech',
    text: 'оно снова подошло к стеклу',
    createdAt: t - 70 * min,
  }),
  sub({
    id: 's19',
    kind: 'text',
    senderUserId: 'twitch:v22',
    senderName: 'holocron',
    senderLevel: 7,
    senderColor: '#5ac8ff',
    senderCardEffect: 'card-blade-duel',
    // Both blades recoloured — the dual-colour upgrade is the only one with two pickers.
    senderCardEffectColor: '#b57cff',
    senderCardEffectColor2: '#7cff9e',
    text: 'держи блок',
    createdAt: t - 74 * min,
  }),
  sub({
    id: 's20',
    kind: 'text',
    senderUserId: 'twitch:v23',
    senderName: 'nulltrace',
    senderLevel: 8,
    senderColor: '#7cffb0',
    senderCardEffect: 'card-code-rain',
    text: 'смотри внимательнее',
    createdAt: t - 78 * min,
  }),
  sub({
    id: 's21',
    kind: 'text',
    senderUserId: 'twitch:v24',
    senderName: 'violetstack',
    senderLevel: 6,
    senderColor: '#c9a7ff',
    senderCardEffect: 'card-code-rain',
    // Next to the default green one above: the colour upgrade is the whole difference.
    senderCardEffectColor: '#c26bff',
    text: 'а можно фиолетовый',
    createdAt: t - 82 * min,
  }),
  sub({
    id: 's22',
    kind: 'text',
    senderUserId: 'twitch:v25',
    senderName: 'linecleaner',
    senderLevel: 5,
    senderColor: '#ffe14a',
    senderCardEffect: 'card-well',
    text: 'ещё один ряд',
    createdAt: t - 86 * min,
  }),
  sub({
    id: 's23',
    kind: 'text',
    senderUserId: 'twitch:v26',
    senderName: 'apertureboy',
    senderLevel: 9,
    senderColor: '#5fd8ff',
    senderCardEffect: 'card-portals',
    senderCardEffectColor: '#5fffd0',
    senderCardEffectColor2: '#ff5f8f',
    text: 'думаю с порталами',
    createdAt: t - 90 * min,
  }),
  sub({
    id: 's24',
    kind: 'text',
    senderUserId: 'twitch:v27',
    senderName: 'expelliarmus',
    senderLevel: 10,
    senderColor: '#ffcf94',
    senderCardEffect: 'card-spellclash',
    // Both beams recoloured, so the row shows the dual upgrade rather than the default green/red.
    senderCardEffectColor: '#8fb4ff',
    senderCardEffectColor2: '#ffb03c',
    text: 'кто кого',
    createdAt: t - 94 * min,
  }),
  sub({
    id: 's25',
    kind: 'text',
    senderUserId: 'twitch:v28',
    senderName: 'cubejumper',
    senderLevel: 7,
    senderColor: '#7cb8ff',
    senderCardEffect: 'card-runner',
    // Both pickers of the dual upgrade: blue cube, pink world (floor + spikes).
    senderCardEffectColor: '#7cb8ff',
    senderCardEffectColor2: '#ff5f8f',
    text: 'главное — вовремя прыгнуть',
    createdAt: t - 98 * min,
  }),
  sub({
    id: 's26',
    kind: 'text',
    senderUserId: 'twitch:v29',
    senderName: 'polarnight',
    senderLevel: 6,
    senderColor: '#b18cff',
    senderCardEffect: 'card-aurora',
    text: 'у нас такое небо сегодня',
    createdAt: t - 102 * min,
  }),
  sub({
    id: 's27',
    kind: 'text',
    senderUserId: 'twitch:v30',
    senderName: 'stillwater',
    senderLevel: 8,
    senderColor: '#ffd166',
    senderCardEffect: 'card-ripples',
    // Recoloured sparks over neutral water: the upgrade paints the light, not the pond.
    senderCardEffectColor: '#ffd166',
    text: 'тихо, слышно каждую каплю',
    createdAt: t - 106 * min,
  }),
  sub({
    id: 's28',
    kind: 'text',
    senderUserId: 'twitch:v31',
    senderName: 'gromfest',
    senderLevel: 9,
    senderColor: '#ffd166',
    senderCardEffect: 'card-fireworks',
    text: 'за это стоит поднять небо',
    createdAt: t - 110 * min,
  }),
  sub({
    id: 's29',
    kind: 'text',
    senderUserId: 'twitch:v32',
    senderName: 'starlingz',
    senderLevel: 7,
    senderColor: '#b18cff',
    senderCardEffect: 'card-flock',
    // Recoloured murmuration: the upgrade paints the flock's light.
    senderCardEffectColor: '#b18cff',
    text: 'мы поворачиваем все разом',
    createdAt: t - 114 * min,
  }),
  sub({
    id: 's30',
    kind: 'text',
    senderUserId: 'twitch:v33',
    senderName: 'meadowlark',
    senderLevel: 5,
    senderColor: '#d6ffaa',
    senderCardEffect: 'card-fireflies',
    text: 'жди третьей вспышки',
    createdAt: t - 118 * min,
  }),
  sub({
    id: 's31',
    kind: 'text',
    senderUserId: 'twitch:v34',
    senderName: 'pondkeeper',
    senderLevel: 8,
    senderColor: '#f2b06a',
    senderCardEffect: 'card-koi',
    // Both pickers of the dual upgrade: teal and pink neon fish, patches swapped between them.
    senderCardEffectColor: '#7cf0d8',
    senderCardEffectColor2: '#ff8fd4',
    text: 'у пруда своя очередь',
    createdAt: t - 122 * min,
  }),
  sub({
    id: 's32',
    kind: 'text',
    senderUserId: 'twitch:v35',
    senderName: 'coldbreath',
    senderLevel: 6,
    senderColor: '#cfe9ff',
    senderCardEffect: 'card-frost',
    text: 'окно снова зацвело',
    createdAt: t - 126 * min,
  }),
  sub({
    id: 's33',
    kind: 'text',
    senderUserId: 'twitch:v36',
    senderName: 'nightdriver',
    senderLevel: 10,
    senderColor: '#ff4fd8',
    senderCardEffect: 'card-outrun',
    // Both pickers of the dual upgrade: mint neon over a blue counterpoint — the stand's second
    // palette, so the recolour path shows next to the authored pink/cyan default in the chat demo.
    senderCardEffectColor: '#8df0cc',
    senderCardEffectColor2: '#7cb8ff',
    text: 'до горизонта и дальше',
    createdAt: t - 130 * min,
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
    platformName: null,
    avatarUrl: null,
    accepting: true,
    maxDurationMs: MOCK_SETTINGS.maxDurationMs,
    maxAudioDurationMs: MOCK_SETTINGS.maxAudioDurationMs,
    maxFileSizeBytes: MOCK_SETTINGS.maxFileSizeBytes,
    autoApproveGifs: MOCK_SETTINGS.autoApproveGifs,
    autoApproveText: MOCK_SETTINGS.autoApproveText,
    autoApproveYoutube:
      MOCK_SETTINGS.autoApproveYoutubeMusic || MOCK_SETTINGS.autoApproveYoutubeVideo,
    ttsEnabled: true,
    allowViewerPosition: true, // on by default here — otherwise the placement picker is unreachable
    overlayLayout: {
      position: MOCK_SETTINGS.overlayPosition,
      size: MOCK_SETTINGS.overlaySize,
      margin: MOCK_SETTINGS.overlayMargin,
    },
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

const MOCK_LEADERBOARD_TOP: LeaderboardEntry[] = [
  {
    userId: 'twitch:other1',
    login: 'darkblane',
    // A bought name over the underscore-suffixed handle Twitch's uniqueness rule forced on them —
    // hover the row to see the real one. The case this item exists for.
    displayName: 'Тёмный Клинок',
    platformName: 'DarkBlane_',
    value: 12,
    isFounder: false,
    nickColor: '#ffb86c',
    nickColor2: '#ff5f6d',
    nickFlow: true,
    nickEffect: 'nick-glow',
    cardEffect: 'card-lightning',
    seal: 'seal-moons',
    sealColor: null,
    level: 8,
  },
  {
    userId: 'twitch:u_dev',
    login: 'kravetsinside',
    displayName: 'Kravets',
    platformName: null,
    value: 12,
    isFounder: true,
    nickColor: null,
    nickColor2: null,
    nickFlow: false,
    nickEffect: null,
    cardEffect: 'card-portals',
    seal: 'seal-keyring',
    sealColor: null,
    level: 4,
  },
  {
    userId: 'twitch:other2',
    login: 'kravetsin',
    displayName: 'Kravetsin',
    platformName: null,
    value: 6,
    isFounder: false,
    nickColor: '#a5b4fc',
    nickColor2: null,
    nickFlow: false,
    nickEffect: 'nick-pulse',
    cardEffect: 'card-code-rain',
    // Colourable hourglass seal, recoloured — previews a tinted seal in the leaderboard.
    seal: 'seal-hourglass',
    sealColor: '#7cff4f',
    level: 10,
  },
  {
    userId: 'google:other3',
    login: 'slava',
    displayName: 'Слава Anfani',
    platformName: null,
    value: 5,
    isFounder: false,
    nickColor: '#ffd36e',
    nickColor2: null,
    nickFlow: false,
    nickEffect: 'nick-glow',
    cardEffect: 'card-well',
    // Colourable butterfly seal, recoloured cyan.
    seal: 'seal-core',
    sealColor: '#5ad1ff',
    level: 6,
  },
  {
    userId: 'google:other4',
    login: 'darina',
    displayName: 'Дмитриева Дарина',
    platformName: null,
    value: 2,
    isFounder: false,
    nickColor: '#b0f5c0',
    nickColor2: '#7dd3fc',
    // Static gradient, no flow — the contrast against the drifting rows above is the point.
    nickFlow: false,
    nickEffect: null,
    cardEffect: 'card-spellclash',
    seal: null,
    sealColor: null,
    level: 2,
  },
];

/**
 * The board's long tail. The owner's leaderboards page themselves as you scroll, and six rows could
 * never show that — this is enough to walk past two page boundaries and reach the end.
 */
const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  ...MOCK_LEADERBOARD_TOP,
  ...Array.from({ length: 54 }, (_, i) => ({
    userId: `twitch:filler${i}`,
    login: `viewer${i}`,
    displayName: `viewer_${String(i).padStart(2, '0')}`,
    platformName: null,
    value: Math.max(1, 60 - i * 2),
    isFounder: false,
    nickColor: null,
    nickColor2: null,
    nickFlow: false,
    nickEffect: null,
    cardEffect: null,
    seal: null,
    sealColor: null,
    level: Math.max(1, 9 - Math.floor(i / 7)),
  })),
];

/** Stats for a period; only the daily series depends on it — the totals are lifetime either way. */
/**
 * Stats for a window. Mirrors the real endpoint: the month view is a bar per day of the current
 * calendar month, the all-time view a bar per month — and every total follows the window too, or the
 * period switch looks broken in mock mode (which is exactly how it was first reported).
 */
const mockStats = (period: StatsPeriod): StatsSummary => {
  const now = new Date(t);
  const bucket = period === 'all' ? 'month' : 'day';
  const keys =
    bucket === 'day'
      ? Array.from({ length: now.getUTCDate() }, (_, i) =>
          new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), i + 1))
            .toISOString()
            .slice(0, 10),
        )
      : Array.from({ length: 14 }, (_, i) =>
          new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13 + i, 1))
            .toISOString()
            .slice(0, 7),
        );
  const scale = bucket === 'month' ? 22 : 1; // a month bucket holds a month's worth of activity
  const daily: DailyStat[] = keys.map((day) => {
    const submissions = (3 + Math.floor(Math.random() * 12)) * scale;
    const aired = Math.floor(submissions * (0.4 + Math.random() * 0.4));
    return {
      day,
      submissions,
      aired,
      rejected: Math.floor((submissions - aired) * Math.random()),
      messages: (20 + Math.floor(Math.random() * 120)) * scale,
      watchMinutes: (100 + Math.floor(Math.random() * 400)) * scale,
    };
  });
  const sum = (pick: (d: DailyStat) => number) => daily.reduce((n, d) => n + pick(d), 0);
  return {
    period,
    bucket,
    submissions: sum((d) => d.submissions),
    aired: sum((d) => d.aired),
    rejected: sum((d) => d.rejected),
    // Deliberately past the galaxy threshold in the all-time view and short of the black hole's,
    // so the achievements page previews both states.
    uniqueContributors: period === 'all' ? 84 : 19,
    messages: sum((d) => d.messages),
    watchMinutes: sum((d) => d.watchMinutes),
    todaySubmissions: 12,
    daily,
    byKind: [
      { kind: 'image', count: 520 },
      { kind: 'youtube', count: 310 },
      { kind: 'video', count: 190 },
      { kind: 'text', count: 120 },
      { kind: 'gif', count: 64 },
      { kind: 'audio', count: 30 },
    ],
  };
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

/** Limits every card shows the same way; only the interesting fields differ per mock row. */
const DIR_LIMITS = {
  maxDurationMs: 15_000,
  maxAudioDurationMs: 60_000,
  maxFileSizeBytes: 50 * 1024 * 1024,
};

/**
 * Every state a directory card has: with and without nick/card cosmetics, no description, no stream
 * link, all opt-ins on and all off, both groups.
 */
const MOCK_DIRECTORY: DirectoryChannel[] = [
  {
    login: 'kravetsinside',
    displayName: 'Kravets',
    avatarUrl: null,
    description: 'Шли мемы — лучшее окажется на стриме 🎬',
    streamUrl: 'https://www.twitch.tv/kravetsinside',
    streamPlatform: 'twitch',
    live: true,
    overlayMedia: true,
    overlayChat: true,
    lastLiveAt: null,
    isFounder: true,
    aired: 1248,
    ...DIR_LIMITS,
    autoApproveGifs: true,
    autoApproveText: true,
    autoApproveYoutube: true,
    ttsEnabled: true,
    allowViewerPosition: true,
    nickColor: '#8df0cc',
    nickColor2: '#ff9ed8',
    nickFlow: true,
    nickEffect: 'nick-glow',
    cardEffect: 'card-stardust',
    cardEffectColor: null,
    cardEffectColor2: null,
  },
  {
    login: 'pixel_witch',
    displayName: 'Pixel Witch',
    avatarUrl: null,
    description: null,
    streamUrl: 'https://www.youtube.com/@pixelwitch',
    streamPlatform: 'youtube',
    live: true,
    // Chat overlay only: previews the row that must NOT promise images.
    overlayMedia: false,
    overlayChat: true,
    lastLiveAt: null,
    isFounder: false,
    aired: 37,
    ...DIR_LIMITS,
    autoApproveGifs: false,
    autoApproveText: false,
    autoApproveYoutube: false,
    ttsEnabled: false,
    allowViewerPosition: false,
    nickColor: null,
    nickColor2: null,
    nickFlow: false,
    nickEffect: null,
    cardEffect: null,
    cardEffectColor: null,
    cardEffectColor2: null,
  },
  {
    login: 'dj_summer',
    displayName: 'DJ Summer',
    avatarUrl: null,
    description: 'Только музыка, без видео',
    streamUrl: null,
    streamPlatform: null,
    live: false,
    overlayMedia: false,
    overlayChat: false,
    lastLiveAt: t - 42 * 60_000,
    isFounder: false,
    aired: 402,
    ...DIR_LIMITS,
    maxAudioDurationMs: 180_000,
    autoApproveGifs: true,
    autoApproveText: false,
    autoApproveYoutube: true,
    ttsEnabled: false,
    allowViewerPosition: false,
    nickColor: '#ffcc66',
    nickColor2: null,
    nickFlow: false,
    nickEffect: null,
    cardEffect: 'card-butterflies',
    cardEffectColor: '#ff2e9a',
    cardEffectColor2: null,
  },
  {
    login: 'clip_gremlin',
    displayName: 'clip_gremlin',
    avatarUrl: null,
    description: 'Присылай клипы, разбираем в эфире',
    streamUrl: 'https://www.twitch.tv/clip_gremlin',
    streamPlatform: 'twitch',
    live: false,
    overlayMedia: false,
    overlayChat: false,
    lastLiveAt: t - 7 * 3_600_000,
    isFounder: false,
    aired: 0,
    ...DIR_LIMITS,
    autoApproveGifs: false,
    autoApproveText: false,
    autoApproveYoutube: false,
    ttsEnabled: true,
    allowViewerPosition: false,
    nickColor: null,
    nickColor2: null,
    nickFlow: false,
    nickEffect: null,
    cardEffect: null,
    cardEffectColor: null,
    cardEffectColor2: null,
  },
];

function cosmeticState() {
  const u = MOCK_ME.user!;
  return { stardust: u.stardust, ownedCosmetics: u.ownedCosmetics, equipped: u.equipped };
}

function route(pathname: string, init?: RequestInit, query?: URLSearchParams): unknown | undefined {
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
  if (pathname === '/api/directory') return MOCK_DIRECTORY;
  if (pathname === '/api/admin/bot') return { connected: true, login: 'tossitbot' };
  if (pathname === '/api/admin/live-channels') {
    return [{ login: 'kravetsinside', displayName: 'Kravets', avatarUrl: null, overlays: 1 }];
  }
  // Two sources of the same channel, deliberately on different builds: the stale one is what the
  // panel exists to surface, and the media one is mid-show so its "reloading replays it" flag shows.
  if (pathname === '/api/admin/overlays') {
    if (init?.method === 'POST') return { reloaded: 1, skipped: 0 };
    return [
      {
        socketId: 'sock_chat_1',
        login: 'kravetsinside',
        displayName: 'Kravets',
        kind: 'chat',
        connectedAt: Date.now() - 8_100_000,
        transport: 'websocket',
        build: '2026-07-30 11:26',
        playing: false,
      },
      {
        socketId: 'sock_media_1',
        login: 'kravetsinside',
        displayName: 'Kravets',
        kind: 'media',
        connectedAt: Date.now() - 240_000,
        transport: 'polling',
        build: '2026-07-29 19:04',
        playing: true,
      },
    ];
  }
  if (pathname.startsWith('/api/admin/overlays/')) return { ok: true };
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
    // total is deliberately larger than the two rows below: it is what makes the pager appear.
    return {
      total: 137,
      rows: [
        {
          id: 'twitch:u_dev',
          login: 'kravetsinside',
          displayName: 'Kravets',
          avatarUrl: null,
          stardust: 250,
          rouletteWins: 12,
          rouletteLosses: 27,
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
      ],
    };
  }
  if (pathname.endsWith('/cosmetics') && pathname.startsWith('/api/admin/users/')) {
    return [
      { itemId: 'nick-glow', ownedAt: Date.now() - 86_400_000 * 4, paidDust: 300 },
      { itemId: 'card-stardust', ownedAt: Date.now() - 86_400_000 * 9, paidDust: 500 },
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
    return {
      connected: false,
      externalName: null,
      hasStardust: false,
      hasYoutube: false,
      hasTts: false,
      hasSkip: false,
    };
  }
  // add (POST) / remove (DELETE) for any reward kind — the kind is the last path segment.
  if (/^\/api\/channel-points\/(stardust|youtube|tts)$/.test(pathname)) {
    return { ok: true };
  }

  // The wheel. Spins for real against the mock balance — a wheel that always pays or always
  // loses tells you nothing about how the animation feels, which is the only reason to preview it.
  if (pathname === '/api/roulette') {
    const u = MOCK_ME.user!;
    return {
      balance: u.stardust,
      max: maxBet(u.stardust),
      min: BET.min,
      payouts: PAYOUT,
      cooldownS: 60,
      fairHash: 'mock0000000000000000000000000000000000000000000000000000000000',
    };
  }
  if (pathname === '/api/roulette/bet') {
    const u = MOCK_ME.user!;
    const body = init?.body
      ? (JSON.parse(String(init.body)) as { stake?: number; color?: string })
      : {};
    const color = parseColor(String(body.color ?? '')) ?? 'red';
    const stake = Number(body.stake) || 0;
    const cap = maxBet(u.stardust);
    if (stake > cap)
      return { ok: false, outcome: { kind: 'overCap', max: cap, balance: u.stardust } };
    if (stake < BET.min) return { ok: false, outcome: { kind: 'tooSmall', min: BET.min } };
    // No cooldown here on purpose: previewing the animation means spinning it back to back.
    const slot = WHEEL_ORDER[Math.floor(Math.random() * WHEEL_ORDER.length)]!;
    const payout = payoutFor(color, slot, stake);
    u.stardust = u.stardust - stake + payout;
    return {
      ok: true,
      outcome: {
        kind: 'done',
        stake,
        betColor: color,
        slot,
        resultColor: colorOfSlot(slot),
        payout,
        balance: u.stardust,
      },
    };
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
    // Per-effect card colours: merge the partial { effectId: hex | null } map (null removes one).
    const colorPatch = (body as { cardEffectColors?: Record<string, string | null> })
      .cardEffectColors;
    if (colorPatch && typeof colorPatch === 'object') {
      const map = { ...(u.equipped.cardEffectColors ?? {}) };
      for (const [k, v] of Object.entries(colorPatch)) {
        if (v) map[k] = v;
        else delete map[k];
      }
      next.cardEffectColors = map;
    }
    // The SECOND colour of a two-sided effect, merged the same way. Not optional bookkeeping: this
    // mock is how the shop gets looked at, and a slot it silently drops reads as a broken feature.
    const colorPatch2 = (body as { cardEffectColors2?: Record<string, string | null> })
      .cardEffectColors2;
    if (colorPatch2 && typeof colorPatch2 === 'object') {
      const map = { ...(u.equipped.cardEffectColors2 ?? {}) };
      for (const [k, v] of Object.entries(colorPatch2)) {
        if (v) map[k] = v;
        else delete map[k];
      }
      next.cardEffectColors2 = map;
    }
    // Mirror the server's ladder: an upgrade can't outlive the rung it stands on.
    if (!next.nickColor) next.nickColor2 = undefined;
    if (!next.nickColor2) next.nickFlow = undefined;
    // entranceColor persists across entrance changes (the render gates on the portal being equipped).
    u.equipped = next;
    return cosmeticState();
  }

  const cm = pathname.match(/^\/api\/c\/([^/]+)(?:\/(leaderboard))?$/);
  // The public board is served capped at ten (see the channels route); only the owner's own
  // dashboard boards page through the whole room.
  if (cm)
    return cm[2] === 'leaderboard' ? MOCK_LEADERBOARD.slice(0, 10) : mockPublicChannel(cm[1]!);

  const m = pathname.match(/^\/api\/dashboard\/[^/]+\/(.+)$/);
  if (m) {
    switch (m[1]) {
      case 'pending':
        return new URLSearchParams(window.location.search).has('empty') ? [] : MOCK_PENDING;
      case 'now':
        return { now: MOCK_NOW, nowMusic: null, queue: MOCK_PENDING, volume: MOCK_SETTINGS.volume };
      case 'volume': {
        // Echo the posted value like the server does — an empty reply would blank the slider.
        if (init?.body) {
          const b = JSON.parse(String(init.body)) as { volume?: number };
          if (typeof b.volume === 'number') MOCK_SETTINGS.volume = b.volume;
        }
        return { volume: MOCK_SETTINGS.volume };
      }
      case 'stats':
        // The real endpoint's series length follows ?days=; a fixed one here makes the period switch
        // look broken in mock mode, which is exactly how this was first reported.
        return mockStats(query?.get('period') === 'all' ? 'all' : 'month');
      case 'leaderboard': {
        // Sliced like the real route, so the page's infinite scroll actually reaches an end here.
        const from = Number(query?.get('offset')) || 0;
        return MOCK_LEADERBOARD.slice(from, from + (Number(query?.get('limit')) || 25));
      }
      case 'live':
        return MOCK_LIVE;
      case 'onboarding':
        // Mock owner has no Twitch (hasTwitch: false) — exercises the chat step's link + pre-mod
        // branch. botLogin is surfaced regardless of linking, so the /mod command shows.
        return {
          overlayAdded: true,
          hasViewerSend: false,
          botAvailable: false,
          botReading: false,
          botLogin: 'tossitbot',
        } satisfies OnboardingStatus;
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
          display: MOCK_SETTINGS.bgMusicDisplay,
        };
      }
      case 'music/config': {
        // DJ knobs (shuffle/volume/display) — owner or moderator.
        if (init?.body) {
          const b = JSON.parse(String(init.body)) as {
            shuffle?: boolean;
            volume?: number;
            display?: MusicDisplay;
          };
          if (typeof b.shuffle === 'boolean') MOCK_SETTINGS.bgMusicShuffle = b.shuffle;
          if (typeof b.volume === 'number') MOCK_SETTINGS.bgMusicVolume = b.volume;
          if (b.display) MOCK_SETTINGS.bgMusicDisplay = b.display;
        }
        return {
          tracks: MOCK_SETTINGS.bgMusicTracks,
          shuffle: MOCK_SETTINGS.bgMusicShuffle,
          volume: MOCK_SETTINGS.bgMusicVolume,
          display: MOCK_SETTINGS.bgMusicDisplay,
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
      const url = new URL(href, window.location.origin);
      const { pathname } = url;
      if (pathname.startsWith('/api/')) {
        const data = route(pathname, init, url.searchParams);
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
