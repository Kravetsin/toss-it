import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type {
  ChannelSettings,
  HistoryEntry,
  ListedUser,
  MusicState,
  MusicTrack,
  PlaybackProgress,
  ReputationStats,
  SubmissionSummary,
} from '@tmw/shared';
import {
  getBans,
  getHistory,
  getMusicTracks,
  getNowPlaying,
  getPending,
  getReputation,
  getSettings,
  getWhitelist,
} from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { playNotify } from '@/lib/notify';

/**
 * Loads channel data (queue, now playing, settings, lists, history, reputation) and establishes
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
  const [progress, setProgress] = useState<PlaybackProgress | null>(null);
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [allowed, setAllowed] = useState<ListedUser[]>([]);
  const [banned, setBanned] = useState<ListedUser[]>([]);
  const [musicState, setMusicState] = useState<MusicState>({ videoId: null, playing: false });
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
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
    void getHistory(channelId)
      .then(setHistory)
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

  // Owned background-music track list (owner only), loaded once per channel; edits update it live.
  useEffect(() => {
    if (!channelId || !isOwner) {
      setMusicTracks([]);
      return;
    }
    let cancelled = false;
    setMusicLoading(true);
    void getMusicTracks(channelId)
      .then((r) => {
        if (!cancelled) setMusicTracks(r.tracks);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMusicLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, isOwner]);

  // Load channel data and establish live socket connection. Restarts on channel change.
  useEffect(() => {
    if (!channelId) return;
    setPending([]);
    setNow(null);
    setProgress(null);
    setSettings(null);
    setAllowed([]);
    setBanned([]);
    setReputation({});

    void getPending(channelId)
      .then(setPending)
      .catch(() => {});
    void getNowPlaying(channelId)
      .then((r) => setNow(r.now))
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
    socket.on('playback:started', (s: SubmissionSummary) => {
      setNow(s);
      setProgress(null); // reset until the overlay reports the new item's position
    });
    socket.on('playback:ended', () => {
      setNow(null);
      setProgress(null);
      void getHistory(channelId)
        .then(setHistory)
        .catch(() => {});
    });
    socket.on('playback:progress', (p: PlaybackProgress) => setProgress(p));
    socket.on('music:state', (s: MusicState) => setMusicState(s));
    return () => {
      socket.close();
    };
  }, [channelId, isOwner, refreshLists, soundOnRef]);

  return {
    pending,
    setPending,
    now,
    progress,
    settings,
    setSettings,
    history,
    allowed,
    banned,
    reputation,
    musicState,
    musicTracks,
    setMusicTracks,
    musicLoading,
    refreshLists,
  };
}
