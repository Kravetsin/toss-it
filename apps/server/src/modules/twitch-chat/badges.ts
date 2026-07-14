import type { FastifyBaseLogger } from 'fastify';
import type { ChatBadge, ChatRole } from '@tmw/shared';

/** A badge assignment as it arrives on a chat message (Twitch EventSub `badges[]`). */
export interface EventBadge {
  setId: string;
  /** Version id within the set (sub months tier, bits amount, or '1'). */
  id: string;
}

/** Highest-priority highlighted role for the tinted message border; broadcaster > mod > vip > sub.
 *  Roles above sub are effectively mutually exclusive on Twitch, but pick a winner defensively;
 *  subscriber is lowest so a mod/vip who also subs keeps their role color. `founder` is Twitch's
 *  early-subscriber badge (NOT our Tossit founder) — it also means "subscribed". */
export function roleFromBadges(badges: EventBadge[]): ChatRole | undefined {
  const ids = new Set(badges.map((b) => b.setId));
  if (ids.has('broadcaster')) return 'broadcaster';
  if (ids.has('moderator')) return 'moderator';
  if (ids.has('vip')) return 'vip';
  if (ids.has('subscriber') || ids.has('founder')) return 'subscriber';
  return undefined;
}

const GLOBAL_BADGES_URL = 'https://api.twitch.tv/helix/chat/badges/global';
const CHANNEL_BADGES_URL = 'https://api.twitch.tv/helix/chat/badges';
/** Global badge art (mod/vip/broadcaster…) is near-static — refetch a day apart at most. */
const GLOBAL_TTL_MS = 24 * 60 * 60_000;
/** Channel sub/bits badges change more often (new tiers) but still rarely. */
const CHANNEL_TTL_MS = 6 * 60 * 60_000;
/** After a failed fetch, retry this soon instead of at full TTL — bounds request rate. */
const RETRY_MS = 60_000;
/** Twitch's own client caps the row at 3; match it to keep the name line tidy. */
const MAX_BADGES = 3;

/** set_id -> (version id -> resolved badge). */
type BadgeMap = Map<string, Map<string, ChatBadge>>;

interface Catalog {
  map: BadgeMap;
  at: number;
  /** false = last fetch failed; serve stale art but retry after RETRY_MS, not TTL. */
  ok: boolean;
}

interface TwitchBadgeSet {
  set_id?: string;
  versions?: { id?: string; image_url_2x?: string; title?: string }[];
}

function parseCatalog(data: TwitchBadgeSet[]): BadgeMap {
  const map: BadgeMap = new Map();
  for (const set of data) {
    if (!set.set_id) continue;
    const versions = new Map<string, ChatBadge>();
    for (const v of set.versions ?? []) {
      if (v.id && v.image_url_2x) {
        versions.set(v.id, { url: v.image_url_2x, title: v.title ?? set.set_id });
      }
    }
    if (versions.size) map.set(set.set_id, versions);
  }
  return map;
}

export interface BadgeResolverDeps {
  /** Helix GET with the bot token (same one the module uses elsewhere). */
  helixGet(url: URL): Promise<Response | null>;
  log: FastifyBaseLogger;
}

export interface BadgeResolver {
  /** Turn a message's raw badge assignments into ≤3 renderable badges (channel art wins). */
  resolve(broadcasterId: string, badges: EventBadge[]): Promise<ChatBadge[]>;
}

/**
 * Resolves Twitch badge assignments to image URLs from cached catalogs. The catalogs are the
 * ONLY network cost, and they are per-catalog, not per-user or per-message: the global set is
 * fetched once for the whole server (~daily), each channel's set once every few hours. Badge
 * assignments themselves ride free on the chat message.
 */
export function createBadgeResolver(deps: BadgeResolverDeps): BadgeResolver {
  let global: Catalog | null = null;
  let globalPending: Promise<Catalog> | null = null;
  const channels = new Map<string, Catalog>();
  const channelPending = new Map<string, Promise<Catalog>>();

  const fresh = (c: Catalog | null, ttl: number): boolean =>
    c != null && Date.now() - c.at < (c.ok ? ttl : RETRY_MS);

  // Never throws: a failed fetch resolves to a stale-or-empty catalog so callers never reject.
  async function fetchCatalog(url: URL, prev: Catalog | null): Promise<Catalog> {
    try {
      const res = await deps.helixGet(url);
      if (!res?.ok) {
        deps.log.warn({ status: res?.status }, 'twitch-chat: badge catalog fetch failed');
        return { map: prev?.map ?? new Map(), at: Date.now(), ok: false };
      }
      const body = (await res.json()) as { data?: TwitchBadgeSet[] };
      return { map: parseCatalog(body.data ?? []), at: Date.now(), ok: true };
    } catch (err) {
      deps.log.warn({ err }, 'twitch-chat: badge catalog fetch error');
      return { map: prev?.map ?? new Map(), at: Date.now(), ok: false };
    }
  }

  async function ensureGlobal(): Promise<BadgeMap> {
    if (fresh(global, GLOBAL_TTL_MS)) return global!.map;
    // Single-flight: concurrent cold messages share one fetch.
    globalPending ??= fetchCatalog(new URL(GLOBAL_BADGES_URL), global).then((c) => {
      global = c;
      globalPending = null;
      return c;
    });
    return (await globalPending).map;
  }

  async function ensureChannel(broadcasterId: string): Promise<BadgeMap> {
    const cur = channels.get(broadcasterId) ?? null;
    if (fresh(cur, CHANNEL_TTL_MS)) return cur!.map;
    let pending = channelPending.get(broadcasterId);
    if (!pending) {
      const url = new URL(CHANNEL_BADGES_URL);
      url.searchParams.set('broadcaster_id', broadcasterId);
      pending = fetchCatalog(url, cur).then((c) => {
        channels.set(broadcasterId, c);
        channelPending.delete(broadcasterId);
        return c;
      });
      channelPending.set(broadcasterId, pending);
    }
    return (await pending).map;
  }

  return {
    async resolve(broadcasterId, badges) {
      if (badges.length === 0) return [];
      const [globalMap, channelMap] = await Promise.all([
        ensureGlobal(),
        ensureChannel(broadcasterId),
      ]);
      const out: ChatBadge[] = [];
      for (const b of badges) {
        // Channel catalog wins: subscriber/bits art is per-channel; roles fall back to global.
        const hit = channelMap.get(b.setId)?.get(b.id) ?? globalMap.get(b.setId)?.get(b.id);
        if (hit) out.push(hit);
        if (out.length >= MAX_BADGES) break;
      }
      return out;
    },
  };
}
