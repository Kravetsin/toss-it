import { describe, expect, it } from 'vitest';
import { createEarningGuard } from './earning';

/**
 * This guard is the only thing standing between "chat pays double a watched minute" and "chat pays
 * double a watched minute, forty times a minute". Each rule is pinned separately, because relaxing
 * any one of them re-opens the farm on its own.
 */
describe('chat earning guard', () => {
  it('pays a normal line and refuses the same line again', () => {
    const guard = createEarningGuard();
    expect(guard.earns('ch1', 'u1', 'привет всем', 0)).toBe(true);
    expect(guard.earns('ch1', 'u1', 'привет всем', 1_000)).toBe(false);
    // Whitespace is not a different message — otherwise the guard costs one space to defeat.
    expect(guard.earns('ch1', 'u1', '  привет всем  ', 2_000)).toBe(false);
  });

  it('forgets a line once repeating it is conversation rather than spam', () => {
    const guard = createEarningGuard();
    guard.earns('ch1', 'u1', 'ахахах', 0);
    expect(guard.earns('ch1', 'u1', 'ахахах', 9 * 60_000)).toBe(false);
    expect(guard.earns('ch1', 'u1', 'ахахах', 11 * 60_000)).toBe(true);
  });

  it('refuses farming tokens too short to be a message', () => {
    const guard = createEarningGuard();
    expect(guard.earns('ch1', 'u1', '+', 0)).toBe(false);
    expect(guard.earns('ch1', 'u1', '1', 0)).toBe(false);
    expect(guard.earns('ch1', 'u1', 'ку', 0)).toBe(false);
    expect(guard.earns('ch1', 'u1', 'ага', 0)).toBe(true);
  });

  it('keeps viewers and channels apart', () => {
    const guard = createEarningGuard();
    expect(guard.earns('ch1', 'u1', 'gg wp', 0)).toBe(true);
    // Two people saying the same thing is a chat agreeing, not one person repeating themselves.
    expect(guard.earns('ch1', 'u2', 'gg wp', 0)).toBe(true);
    // And the same person in another channel is in another conversation.
    expect(guard.earns('ch2', 'u1', 'gg wp', 0)).toBe(true);
  });

  it('does not let a repeat refresh its own window', () => {
    const guard = createEarningGuard();
    guard.earns('ch1', 'u1', 'спам спам', 0);
    // Hammering it for nine minutes must not push the expiry out to minute nineteen.
    for (let t = 60_000; t <= 9 * 60_000; t += 60_000) {
      expect(guard.earns('ch1', 'u1', 'спам спам', t)).toBe(false);
    }
    expect(guard.earns('ch1', 'u1', 'спам спам', 11 * 60_000)).toBe(true);
  });

  it('drops stale lines when pruned', () => {
    const guard = createEarningGuard();
    guard.earns('ch1', 'u1', 'до встречи', 0);
    guard.prune(30 * 60_000);
    // Pruned or not, the answer must be the same — prune is housekeeping, not policy.
    expect(guard.earns('ch1', 'u1', 'до встречи', 30 * 60_000)).toBe(true);
  });
});
