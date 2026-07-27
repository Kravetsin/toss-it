import { describe, expect, it } from 'vitest';
import { toNotice } from './eventsub';

/**
 * The notice mapper decides what reaches the overlay at all: an unmapped kind must be dropped
 * rather than rendered blank, a gift bomb must not flush the whole chat column, and the number a
 * caption shows has to come from the right sub-object — they all look alike in the payload.
 */
describe('toNotice', () => {
  it('drops kinds we have no copy for', () => {
    expect(toNotice({ notice_type: 'unknown' })).toBeNull();
    expect(toNotice({ notice_type: 'something_twitch_added_later' })).toBeNull();
    expect(toNotice({})).toBeNull();
  });

  it('folds a shared-chat variant into its base kind', () => {
    expect(toNotice({ notice_type: 'shared_chat_sub' })?.type).toBe('sub');
    expect(toNotice({ notice_type: 'shared_chat_raid', raid: { viewer_count: 12 } })).toMatchObject(
      {
        type: 'raid',
        count: 12,
      },
    );
  });

  // The batch row is the event; its members would be 100 more rows behind it.
  it('drops the per-recipient rows of a gifted-sub batch', () => {
    expect(
      toNotice({
        notice_type: 'sub_gift',
        sub_gift: { recipient_user_name: 'quiet_lurker', community_gift_id: '9f3c' },
      }),
    ).toBeNull();
  });

  it('keeps a standalone gift and names its recipient', () => {
    expect(
      toNotice({
        notice_type: 'sub_gift',
        sub_gift: { recipient_user_name: 'quiet_lurker', community_gift_id: null },
      }),
    ).toMatchObject({ type: 'subGift', otherName: 'quiet_lurker', count: undefined });
  });

  it('takes the count from the kind that carries it', () => {
    const count = (ev: Parameters<typeof toNotice>[0]) => toNotice(ev)?.count;
    expect(count({ notice_type: 'watch_streak', watch_streak: { streak_count: 12 } })).toBe(12);
    expect(count({ notice_type: 'resub', resub: { cumulative_months: 26 } })).toBe(26);
    expect(count({ notice_type: 'community_sub_gift', community_sub_gift: { total: 5 } })).toBe(5);
    expect(count({ notice_type: 'raid', raid: { viewer_count: 148 } })).toBe(148);
    expect(count({ notice_type: 'modiversary', modiversary: { months: 3 } })).toBe(3);
    expect(count({ notice_type: 'bits_badge_tier', bits_badge_tier: { tier: 10000 } })).toBe(10000);
  });

  // A plain sub only carries its multi-month duration, which the caption is better off without.
  it('leaves a plain sub and an announcement bare', () => {
    expect(toNotice({ notice_type: 'sub', system_message: 'x subscribed' })).toMatchObject({
      type: 'sub',
      count: undefined,
      otherName: undefined,
    });
    expect(toNotice({ notice_type: 'announcement' })).toMatchObject({
      type: 'announcement',
      count: undefined,
    });
  });

  it('names the other party where the kind has one', () => {
    expect(
      toNotice({ notice_type: 'raid', raid: { user_name: 'raiding_friend', viewer_count: 4 } })
        ?.otherName,
    ).toBe('raiding_friend');
    expect(
      toNotice({ notice_type: 'pay_it_forward', pay_it_forward: { gifter_user_name: 'santa' } })
        ?.otherName,
    ).toBe('santa');
    expect(
      toNotice({
        notice_type: 'gift_paid_upgrade',
        gift_paid_upgrade: { gifter_user_name: 'santa' },
      })?.otherName,
    ).toBe('santa');
  });

  it("carries Twitch's line as the stand-in caption, never undefined", () => {
    expect(toNotice({ notice_type: 'raid', system_message: '4 raiders joined!' })?.text).toBe(
      '4 raiders joined!',
    );
    expect(toNotice({ notice_type: 'raid' })?.text).toBe('');
  });
});
