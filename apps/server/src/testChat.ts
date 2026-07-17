import type { ChatBadge, ChatOverlayMessage } from '@tmw/shared';

/**
 * Sample chat lines for the owner's "test chat" button. The point is tuning font size and width,
 * so the set deliberately spans the extremes the streamer needs to see: a one-word line, a wall of
 * text that wraps, an emote-only line (renders big), long nicks, and every role border.
 * Kept server-side so the client can't author arbitrary lines into someone's overlay.
 */

/** Real, stable Twitch global-badge CDN URLs. */
const badge = (id: string, title: string): ChatBadge => ({
  url: `https://static-cdn.jtvnw.net/badges/v1/${id}/2`,
  title,
});
const BROADCASTER = badge('5527c58c-fb7d-422d-b71b-f309dcb85cc1', 'Broadcaster');
const MODERATOR = badge('3267646d-33f0-4b17-b3df-f923a41db1d0', 'Moderator');
const VIP = badge('b817aba4-fad8-49e2-b88a-7cc744dfa6ec', 'VIP');
const SUB = badge('5d9f2208-5dd8-11e7-8513-2ff4adfae661', 'Subscriber');

/** Twitch global emotes (ids are stable). */
const KAPPA = { type: 'emote', id: '25', text: 'Kappa' } as const;
const LUL = { type: 'emote', id: '425618', text: 'LUL' } as const;
const POG = { type: 'emote', id: '305954156', text: 'PogChamp' } as const;

export const TEST_CHAT_MESSAGES: Omit<ChatOverlayMessage, 'id'>[] = [
  {
    userId: 'test-1',
    name: 'kekw_enjoyer',
    twitchColor: '#9ab0ad',
    cosmetics: null,
    isFounder: false,
    level: 0,
    fragments: [{ type: 'text', text: 'ха' }],
  },
  {
    userId: 'test-2',
    name: 'pixel_witch',
    twitchColor: '#ff7ac6',
    cosmetics: null,
    isFounder: false,
    level: 3,
    badges: [SUB],
    role: 'subscriber',
    fragments: [{ type: 'text', text: 'о, стрим начался! я как раз чай заварила' }],
  },
  {
    userId: 'test-3',
    name: 'the_longest_nickname_here',
    twitchColor: '#ffb86c',
    cosmetics: null,
    isFounder: false,
    level: 5,
    badges: [VIP],
    role: 'vip',
    fragments: [{ type: 'text', text: 'длинный ник — проверь, что он влезает' }],
  },
  {
    userId: 'test-4',
    name: 'wall_of_text',
    twitchColor: '#a5b4fc',
    cosmetics: null,
    isFounder: false,
    level: 2,
    fragments: [
      {
        type: 'text',
        text: 'а вот так выглядит длинное сообщение, которое переносится на несколько строк — по нему удобнее всего ловить размер шрифта и ширину окна чата: если оно занимает пол-экрана, шрифт стоит уменьшить',
      },
    ],
  },
  {
    userId: 'test-5',
    name: 'emote_spammer',
    twitchColor: '#8df0cc',
    cosmetics: null,
    isFounder: false,
    level: 4,
    fragments: [KAPPA, { type: 'text', text: ' ' }, LUL, { type: 'text', text: ' ' }, POG],
  },
  {
    userId: 'test-6',
    name: 'trusty_mod',
    twitchColor: '#00d68f',
    cosmetics: null,
    isFounder: false,
    level: 6,
    badges: [MODERATOR],
    role: 'moderator',
    fragments: [{ type: 'text', text: 'бан выдал, всё спокойно' }],
  },
  {
    userId: 'test-7',
    name: 'streamer',
    twitchColor: null,
    cosmetics: {
      nickColor: '#8df0cc',
      nickColor2: '#a78bfa',
      nickFlow: true,
      nickEffect: 'nick-glow',
      cardEffect: 'card-stardust',
    },
    isFounder: true,
    level: 9,
    badges: [BROADCASTER],
    role: 'broadcaster',
    fragments: [{ type: 'text', text: 'это я, с косметикой и бордером ведущего ' }, POG],
  },
  {
    userId: 'test-8',
    name: 'quiet_lurker',
    twitchColor: '#c0c0c0',
    cosmetics: null,
    isFounder: false,
    level: 1,
    fragments: [{ type: 'text', text: '+' }],
  },
];
