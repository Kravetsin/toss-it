import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type {
  ChannelSettings,
  HistoryEntry,
  ListedUser,
  ReputationStats,
  SubmissionSummary,
} from '@tmw/shared';
import {
  getBans,
  getHistory,
  getNowPlaying,
  getPending,
  getReputation,
  getSettings,
  getWhitelist,
} from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { playNotify } from '@/lib/notify';

/**
 * Данные канала (очередь, сейчас играет, настройки, списки, история, репутация) +
 * live-сокет. Всё перезапускается при смене канала. Звук на новую отправку читается
 * из soundOnRef, чтобы переключение звука не пересоздавало сокет.
 */
export function useChannelData(
  channelId: string | null,
  isOwner: boolean,
  soundOnRef: RefObject<boolean>,
) {
  const [pending, setPending] = useState<SubmissionSummary[]>([]);
  const [now, setNow] = useState<SubmissionSummary | null>(null);
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [allowed, setAllowed] = useState<ListedUser[]>([]);
  const [banned, setBanned] = useState<ListedUser[]>([]);
  // Кэш кросс-канальной репутации по userId (догружаем по мере появления заявок).
  const [reputation, setReputation] = useState<Record<string, ReputationStats>>({});
  const reputationRef = useRef(reputation);
  reputationRef.current = reputation;

  const refreshLists = useCallback(() => {
    if (!channelId) return;
    void getWhitelist(channelId).then(setAllowed).catch(() => {});
    void getBans(channelId).then(setBanned).catch(() => {});
    void getHistory(channelId).then(setHistory).catch(() => {});
  }, [channelId]);

  // Догружаем репутацию для новых отправителей в очереди (только отсутствующих в кэше).
  useEffect(() => {
    if (!channelId) return;
    const ids = [...new Set(pending.map((p) => p.senderUserId).filter((x): x is string => !!x))].filter(
      (id) => !(id in reputationRef.current),
    );
    if (ids.length === 0) return;
    void getReputation(channelId, ids)
      .then((rep) => setReputation((prev) => ({ ...prev, ...rep })))
      .catch(() => {});
  }, [pending, channelId]);

  // Загрузка данных канала + live-сокет. Перезапускается при смене канала.
  useEffect(() => {
    if (!channelId) return;
    setPending([]);
    setNow(null);
    setSettings(null);
    setAllowed([]);
    setBanned([]);
    setReputation({});

    void getPending(channelId).then(setPending).catch(() => {});
    void getNowPlaying(channelId)
      .then((r) => setNow(r.now))
      .catch(() => {});
    // Настройки доступны только владельцу.
    if (isOwner) void getSettings(channelId).then(setSettings).catch(() => {});
    refreshLists();

    // Live-обновления: авторизация по сессионной куке (модератору overlayToken не нужен).
    const socket = connectSocket({ role: 'dashboard', channelId });
    socket.on('moderation:new', (s: SubmissionSummary) =>
      setPending((prev) => {
        if (prev.some((p) => p.id === s.id)) return prev;
        if (soundOnRef.current) playNotify(); // звуковой сигнал на новую отправку
        return [...prev, s];
      }),
    );
    socket.on('moderation:resolved', (id: string) =>
      setPending((prev) => prev.filter((p) => p.id !== id)),
    );
    socket.on('playback:started', (s: SubmissionSummary) => setNow(s));
    socket.on('playback:ended', () => {
      setNow(null);
      void getHistory(channelId).then(setHistory).catch(() => {});
    });
    return () => {
      socket.close();
    };
  }, [channelId, isOwner, refreshLists, soundOnRef]);

  return {
    pending,
    setPending,
    now,
    settings,
    setSettings,
    history,
    allowed,
    banned,
    reputation,
    refreshLists,
  };
}
