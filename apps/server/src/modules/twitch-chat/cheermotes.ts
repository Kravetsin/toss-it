import type { FastifyBaseLogger } from 'fastify';
import type { ChatFragment } from '@tmw/shared';

const CHEERMOTES_URL = 'https://api.twitch.tv/helix/bits/cheermotes';
/** Global cheer art almost never moves; a channel's own custom cheermotes rarely. One call covers
 *  both (Twitch returns global + channel_custom for a broadcaster_id), so one TTL covers both. */
const TTL_MS = 6 * 60 * 60_000;
/** After a failed fetch, retry this soon instead of at full TTL — bounds request rate. */
const RETRY_MS = 60_000;
/** 56px art, the same asset the 2.0 emote scale uses, so a cheer sits level with the emotes. */
const SCALE = '2';

/** prefix (lowercased) -> tiers, biggest first: the first one the cheer can afford is its art. */
type Catalog = Map<string, { minBits: number; url: string; color: string }[]>;

interface Cached {
  map: Catalog;
  at: number;
  /** false = last fetch failed; serve stale art but retry after RETRY_MS, not TTL. */
  ok: boolean;
}

interface TwitchCheermote {
  prefix?: string;
  tiers?: {
    min_bits?: number;
    color?: string;
    images?: Record<string, Record<string, Record<string, string>>>;
  }[];
}

/** Animated dark art is what the overlay wants; fall back through the shapes Twitch offers so a
 *  missing variant costs the image, not the whole cheer. */
function artOf(
  images: Record<string, Record<string, Record<string, string>>> | undefined,
): string | undefined {
  const dark = images?.dark ?? images?.light;
  return dark?.animated?.[SCALE] ?? dark?.static?.[SCALE];
}

function parseCatalog(data: TwitchCheermote[]): Catalog {
  const map: Catalog = new Map();
  for (const c of data) {
    if (!c.prefix) continue;
    const tiers: { minBits: number; url: string; color: string }[] = [];
    for (const t of c.tiers ?? []) {
      const url = artOf(t.images);
      if (url) tiers.push({ minBits: t.min_bits ?? 0, url, color: t.color ?? '#8df0cc' });
    }
    // Descending, so picking a tier is "the first one this cheer reaches".
    tiers.sort((a, b) => b.minBits - a.minBits);
    if (tiers.length) map.set(c.prefix.toLowerCase(), tiers);
  }
  return map;
}

export interface CheermoteResolverDeps {
  /** Helix GET with the bot token (same one the module uses elsewhere). */
  helixGet(url: URL): Promise<Response | null>;
  log: FastifyBaseLogger;
}

export interface CheermoteResolver {
  /** Fill in art and tier color for every cheermote fragment; other fragments pass through. */
  resolve(broadcasterId: string, fragments: ChatFragment[]): Promise<ChatFragment[]>;
}

/**
 * Resolves cheers to their art from a cached per-channel catalog. Same shape as the badge resolver
 * and for the same reason: the catalog is the only network cost, and it is per-channel, not per
 * message — the cheer itself rides free on the chat message.
 */
export function createCheermoteResolver(deps: CheermoteResolverDeps): CheermoteResolver {
  const channels = new Map<string, Cached>();
  const pending = new Map<string, Promise<Cached>>();

  // Never throws: a failed fetch resolves to a stale-or-empty catalog so callers never reject.
  async function fetchCatalog(broadcasterId: string, prev: Cached | null): Promise<Cached> {
    try {
      const url = new URL(CHEERMOTES_URL);
      url.searchParams.set('broadcaster_id', broadcasterId);
      const res = await deps.helixGet(url);
      if (!res?.ok) {
        deps.log.warn({ status: res?.status }, 'twitch-chat: cheermote catalog fetch failed');
        return { map: prev?.map ?? new Map(), at: Date.now(), ok: false };
      }
      const body = (await res.json()) as { data?: TwitchCheermote[] };
      return { map: parseCatalog(body.data ?? []), at: Date.now(), ok: true };
    } catch (err) {
      deps.log.warn({ err }, 'twitch-chat: cheermote catalog fetch error');
      return { map: prev?.map ?? new Map(), at: Date.now(), ok: false };
    }
  }

  async function ensure(broadcasterId: string): Promise<Catalog> {
    const cur = channels.get(broadcasterId) ?? null;
    if (cur && Date.now() - cur.at < (cur.ok ? TTL_MS : RETRY_MS)) return cur.map;
    let inflight = pending.get(broadcasterId);
    if (!inflight) {
      // Single-flight: a cheer train's worth of concurrent messages shares one fetch.
      inflight = fetchCatalog(broadcasterId, cur).then((c) => {
        channels.set(broadcasterId, c);
        pending.delete(broadcasterId);
        return c;
      });
      pending.set(broadcasterId, inflight);
    }
    return (await inflight).map;
  }

  return {
    async resolve(broadcasterId, fragments) {
      if (!fragments.some((f) => f.type === 'cheermote')) return fragments;
      const map = await ensure(broadcasterId);
      return fragments.map((f) => {
        if (f.type !== 'cheermote') return f;
        // Twitch's own `tier` is the canonical threshold, but trust the bits: a tier the catalog
        // does not carry (custom cheermote just removed) must still land on a real one.
        const tier = map.get(f.prefix.toLowerCase())?.find((t) => f.bits >= t.minBits);
        return tier ? { ...f, url: tier.url, color: tier.color } : f;
      });
    },
  };
}
