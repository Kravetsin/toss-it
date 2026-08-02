import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type {
  ChannelSettings,
  ListedUser,
  MusicState,
  MusicTrack,
  OverlayPresence,
  PlaybackProgress,
  PlaybackSlot,
  ReputationStats,
  SubmissionSummary,
} from '@tmw/shared';
import {
  getBans,
  getMusic,
  getNowPlaying,
  getPending,
  getReputation,
  getSettings,
  getWhitelist,
} from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { isMockOn } from '@/lib/devMock';
import { playNotify } from '@/lib/notify';

/**
 * Loads channel data (queue, now playing, settings, lists, reputation) and establishes
 * live socket connection. Resets on channel change. Sound on new submission uses soundOnRef
 * to avoid socket recreation when toggling sound.
 */
export function useChannelData(
  channelId: string | null,
  isOwner: boolean,
  soundOnRef: RefObject<boolean>,
) {
  const [pending, setPending] = useState<SubmissionSummary[]>([]);
  const [now, setNow] = useState<SubmissionSummary | null>(null);
  /** The compact player's show, when the channel runs parallel slots. */
  const [nowMusic, setNowMusic] = useState<SubmissionSummary | null>(null);
  const [queue, setQueue] = useState<SubmissionSummary[]>([]);
  const [progress, setProgress] = useState<PlaybackProgress | null>(null);
  const [musicProgress, setMusicProgress] = useState<PlaybackProgress | null>(null);
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  /** Content volume 0-100, from /now — moderators get it too, unlike the owner-only settings. */
  const [contentVolume, setContentVolume] = useState<number | null>(null);
  const [allowed, setAllowed] = useState<ListedUser[]>([]);
  const [banned, setBanned] = useState<ListedUser[]>([]);
  const [musicState, setMusicState] = useState<MusicState>({ videoId: null, playing: false });
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  // DJ knobs (shuffle/volume/hidden) — separate from owner-only settings so moderators get them too.
  const [musicConfig, setMusicConfig] = useState({ shuffle: false, volume: 50, hidden: false });
  const [musicLoading, setMusicLoading] = useState(false);
  // Overlay sources connected right now, and whether we can still be told about it: a dashboard that
  // lost the server knows nothing about the overlay and must say so instead of showing stale green.
  const [presence, setPresence] = useState<OverlayPresence>({ media: 0, chat: 0 });
  const [serverConnected, setServerConnected] = useState(false);
  // Cross-channel reputation cache by userId, loaded on-demand as submissions arrive.
  const [reputation, setReputation] = useState<Record<string, ReputationStats>>({});
  const reputationRef = useRef(reputation);
  reputationRef.current = reputation;

  const refreshLists = useCallback(() => {
    if (!channelId) return;
    void getWhitelist(channelId)
      .then(setAllowed)
      .catch(() => {});
    void getBans(channelId)
      .then(setBanned)
      .catch(() => {});
  }, [channelId]);

  // Fetch reputation for new senders not yet in cache.
  useEffect(() => {
    if (!channelId) return;
    const ids = [
      ...new Set(pending.map((p) => p.senderUserId).filter((x): x is string => !!x)),
    ].filter((id) => !(id in reputationRef.current));
    if (ids.length === 0) return;
    void getReputation(channelId, ids)
      .then((rep) => setReputation((prev) => ({ ...prev, ...rep })))
      .catch(() => {});
  }, [pending, channelId]);

  // Owned background-music list + DJ knobs, loaded once per channel (owner AND moderators, so a mod
  // can DJ); edits update it live.
  useEffect(() => {
    if (!channelId) {
      setMusicTracks([]);
      return;
    }
    let cancelled = false;
    setMusicLoading(true);
    void getMusic(channelId)
      .then((r) => {
        if (cancelled) return;
        setMusicTracks(r.tracks);
        setMusicConfig({ shuffle: r.shuffle, volume: r.volume, hidden: r.hidden });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMusicLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // Load channel data and establish live socket connection. Restarts on channel change.
  useEffect(() => {
    if (!channelId) return;
    setPending([]);
    setNow(null);
    setNowMusic(null);
    setQueue([]);
    setProgress(null);
    setMusicProgress(null);
    setSettings(null);
    setContentVolume(null);
    setAllowed([]);
    setBanned([]);
    setReputation({});
    // Dev-mock has no socket at all; pretend both sources are there so the UI can be looked at.
    setPresence(isMockOn() ? { media: 1, chat: 1 } : { media: 0, chat: 0 });
    setServerConnected(isMockOn());

    void getPending(channelId)
      .then(setPending)
      .catch(() => {});
    void getNowPlaying(channelId)
      .then((r) => {
        setNow(r.now);
        setNowMusic(r.nowMusic);
        setQueue(r.queue);
        if (typeof r.volume === 'number') setContentVolume(r.volume);
      })
      .catch(() => {});
    // Settings accessible to owner only.
    if (isOwner)
      void getSettings(channelId)
        .then(setSettings)
        .catch(() => {});
    refreshLists();

    // Live updates authorized via session cookie (overlay token not needed for moderator).
    const socket = connectSocket({ role: 'dashboard', channelId });
    socket.on('moderation:new', (s: SubmissionSummary) =>
      setPending((prev) => {
        if (prev.some((p) => p.id === s.id)) return prev;
        if (soundOnRef.current) playNotify();
        return [...prev, s];
      }),
    );
    socket.on('moderation:resolved', (id: string) =>
      setPending((prev) => prev.filter((p) => p.id !== id)),
    );
    socket.on('playback:started', (s: SubmissionSummary, slot?: PlaybackSlot) => {
      // Each stage owns its own panel; a song starting must not blank the picture's progress bar.
      if (slot === 'music') {
        setNowMusic(s);
        setMusicProgress(null);
      } else {
        setNow(s);
        setProgress(null); // reset until the overlay reports the new item's position
      }
    });
    socket.on('playback:ended', (_id: string, slot?: PlaybackSlot) => {
      if (slot === 'music') {
        setNowMusic(null);
        setMusicProgress(null);
      } else {
        setNow(null);
        setProgress(null);
      }
    });
    socket.on('connect', () => setServerConnected(true));
    socket.on('disconnect', () => setServerConnected(false));
    socket.on('overlay:presence', (p: OverlayPresence) => setPresence(p));
    socket.on('playback:queue', (q: SubmissionSummary[]) => setQueue(q));
    socket.on('playback:progress', (p: PlaybackProgress) =>
      p.slot === 'music' ? setMusicProgress(p) : setProgress(p),
    );
    socket.on('music:state', (s: MusicState) => setMusicState(s));
    return () => {
      socket.close();
    };
  }, [channelId, isOwner, refreshLists, soundOnRef]);

  return {
    pending,
    setPending,
    now,
    nowMusic,
    musicProgress,
    queue,
    progress,
    settings,
    setSettings,
    contentVolume,
    setContentVolume,
    allowed,
    banned,
    reputation,
    musicState,
    musicTracks,
    setMusicTracks,
    musicConfig,
    setMusicConfig,
    musicLoading,
    presence,
    serverConnected,
    refreshLists,
  };
}
