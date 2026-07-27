import { describe, expect, it } from 'vitest';
import type { ChatNotice } from '@tmw/shared';
import { noticeText } from './notices';

/**
 * The caption is the only thing a viewer reads off a notice, and it replaces Twitch's own line —
 * so a kind that silently loses its number, or prints "· 0", says less than what it replaced.
 */
describe('notice captions', () => {
  const notice = (n: Partial<ChatNotice> & Pick<ChatNotice, 'type'>): ChatNotice => ({
    text: '',
    ...n,
  });

  it('appends the count as the detail', () => {
    expect(noticeText(notice({ type: 'watchStreak', count: 12 }), 'ru')).toBe(
      'серия просмотров · 12',
    );
    expect(noticeText(notice({ type: 'raid', count: 148 }), 'en')).toBe('raid · 148');
  });

  it('carries a unit where the count is months', () => {
    expect(noticeText(notice({ type: 'resub', count: 26 }), 'ru')).toBe('подписка · 26 мес.');
    expect(noticeText(notice({ type: 'modiversary', count: 3 }), 'uk')).toBe(
      'річниця модератора · 3 міс.',
    );
  });

  it('falls back to the other party when there is no count', () => {
    expect(noticeText(notice({ type: 'subGift', otherName: 'quiet_lurker' }), 'ru')).toBe(
      'подписка в подарок · quiet_lurker',
    );
  });

  it('stays bare when the event carries neither', () => {
    expect(noticeText(notice({ type: 'announcement' }), 'ru')).toBe('объявление');
  });

  // A raid that Twitch reports with 0 viewers must not read "рейд · 0".
  it('treats a zero count as no detail', () => {
    expect(noticeText(notice({ type: 'raid', count: 0 }), 'ru')).toBe('рейд');
  });

  it('groups thousands so a bits tier stays readable', () => {
    expect(noticeText(notice({ type: 'bitsBadgeTier', count: 10000 }), 'en')).toBe(
      'new bits badge · 10,000',
    );
  });
});
