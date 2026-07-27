import { describe, expect, it } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import type { ChatFragment } from '@tmw/shared';
import { createCheermoteResolver } from './cheermotes';

/**
 * Which tier a cheer wears is the whole job here, and it is invisible when wrong: a 5000-bit cheer
 * showing the grey 1-bit art still "works". The catalog is also a shared network cost, so a message
 * with no cheer in it must never reach for it.
 */
describe('cheermote resolver', () => {
  const log = { info() {}, warn() {}, error() {} } as unknown as FastifyBaseLogger;

  const tier = (id: string, minBits: number, color: string) => ({
    id,
    min_bits: minBits,
    color,
    images: { dark: { animated: { '2': `https://cdn/${id}.gif` } } },
  });
  const CATALOG = {
    data: [
      { prefix: 'Cheer', tiers: [tier('1', 1, '#979797'), tier('100', 100, '#9c3ee8')] },
      { prefix: 'PogChampion', tiers: [tier('1', 1, '#111111')] },
    ],
  };

  /** Counts fetches so the cache and the "no cheer, no catalog" rule can be asserted. */
  function fake(body: unknown = CATALOG, ok = true) {
    let calls = 0;
    const helixGet = async () => {
      calls += 1;
      return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
    };
    return { resolver: createCheermoteResolver({ helixGet, log }), calls: () => calls };
  }

  const cheer = (bits: number, prefix = 'Cheer'): ChatFragment => ({
    type: 'cheermote',
    text: `${prefix}${bits}`,
    bits,
    prefix,
    tier: bits,
  });

  it('dresses a cheer in the best tier it can afford', async () => {
    const { resolver } = fake();
    const [small, big] = await resolver.resolve('1', [cheer(50), cheer(5000)]);
    expect(small).toMatchObject({ url: 'https://cdn/1.gif', color: '#979797' });
    expect(big).toMatchObject({ url: 'https://cdn/100.gif', color: '#9c3ee8' });
  });

  it('matches the prefix however the viewer typed it', async () => {
    const { resolver } = fake();
    const [f] = await resolver.resolve('1', [cheer(500, 'pOgChAmPiOn')]);
    expect(f).toMatchObject({ url: 'https://cdn/1.gif' });
  });

  it('leaves a cheer the catalog does not know alone', async () => {
    const { resolver } = fake();
    const [f] = await resolver.resolve('1', [cheer(100, 'NotACheermote')]);
    expect(f).toEqual(cheer(100, 'NotACheermote'));
  });

  it('never touches the network for a message without a cheer', async () => {
    const { resolver, calls } = fake();
    const plain: ChatFragment[] = [{ type: 'text', text: 'просто сообщение' }];
    expect(await resolver.resolve('1', plain)).toBe(plain);
    expect(calls()).toBe(0);
  });

  it('fetches the catalog once for a whole cheer train', async () => {
    const { resolver, calls } = fake();
    await resolver.resolve('1', [cheer(100)]);
    await resolver.resolve('1', [cheer(100)]);
    expect(calls()).toBe(1);
  });

  it('degrades to plain text when the catalog cannot be fetched', async () => {
    const { resolver } = fake(null, false);
    const [f] = await resolver.resolve('1', [cheer(100)]);
    expect(f).toEqual(cheer(100));
  });
});
