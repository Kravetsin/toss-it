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
    userId: 'test-5r',
    name: 'quick_reply',
    twitchColor: '#89dceb',
    cosmetics: null,
    isFounder: false,
    level: 2,
    reply: { name: 'emote_spammer' },
    fragments: [KAPPA],
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
  // Notices: with a message attached (the watch streak that started this) and without one.
  {
    userId: 'test-n1',
    name: 'streak_holder',
    twitchColor: '#ffd479',
    cosmetics: null,
    isFounder: false,
    level: 5,
    notice: { type: 'watchStreak', text: 'серия просмотров · 12', count: 12 },
    fragments: [{ type: 'text', text: 'ни одного не пропустил!' }],
  },
  {
    userId: 'test-n2',
    name: 'raiding_friend',
    twitchColor: '#ff7ac6',
    cosmetics: null,
    isFounder: false,
    level: 0,
    notice: { type: 'raid', text: 'рейд · 148', count: 148, otherName: 'raiding_friend' },
    fragments: [],
  },
  // What Twitch marks on the message itself: bits, a paid highlight, a newcomer's first line.
  {
    userId: 'test-e1',
    name: 'bit_thrower',
    twitchColor: '#7ec8ff',
    cosmetics: null,
    isFounder: false,
    level: 3,
    emphasis: { kind: 'cheer', bits: 100 },
    fragments: [
      {
        type: 'cheermote',
        text: 'Cheer100',
        bits: 100,
        prefix: 'Cheer',
        tier: 100,
        url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/100/2.gif',
        color: '#9c3ee8',
      },
      { type: 'text', text: ' держи на кофе' },
    ],
  },
  {
    userId: 'test-e2',
    name: 'loud_and_proud',
    twitchColor: '#c9a0ff',
    cosmetics: null,
    isFounder: false,
    level: 4,
    emphasis: { kind: 'highlighted' },
    fragments: [{ type: 'text', text: 'выделил сообщение за баллы — заметь меня' }],
  },
  {
    userId: 'test-e3',
    name: 'first_timer',
    twitchColor: '#8df0cc',
    cosmetics: null,
    isFounder: false,
    level: 0,
    emphasis: { kind: 'intro', text: 'первое сообщение' },
    fragments: [{ type: 'text', text: 'всем привет, я тут впервые' }],
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
