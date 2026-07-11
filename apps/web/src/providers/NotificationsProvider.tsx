import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import type { SubmissionSummary } from '@tmw/shared';
import { getMyChannels, getPending } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { initAudioUnlock, playNotify } from '@/lib/notify';
import { useMe } from '@/hooks/useMe';
import { useToast } from '@/providers/ToastProvider';
import { useI18n } from '@/i18n';

const SOUND_KEY = 'tmw_modsound';
const DESKTOP_KEY = 'tmw_desktopnotif';
const SELECTED_CHANNEL_KEY = 'tmw_dash_channel'; // written by useChannels
const MAX_ITEMS = 50;

type PermissionState = NotificationPermission | 'unsupported';

/** A single feed entry. `kind` is future-proofed for 'news' / 'info' items beyond submissions. */
export interface NotificationItem {
  id: string; // submission id (also used to reconcile `moderation:resolved`)
  kind: 'submission';
  channelId: string;
  senderName: string | null;
  submissionKind: SubmissionSummary['kind'];
  createdAt: number;
  read: boolean;
}

interface NotificationsValue {
  notifications: NotificationItem[];
  unreadCount: number;
  markAllRead: () => void;
  soundOn: boolean;
  toggleSound: () => void;
  /** Fresh sound preference for the dashboard's own socket handler (avoids reconnect on toggle). */
  soundOnRef: RefObject<boolean>;
  desktopEnabled: boolean;
  permission: PermissionState;
  toggleDesktop: () => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

function initialPermission(): PermissionState {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

/**
 * Global notification hub: subscribes to every accessible channel's dashboard room so the streamer
 * is alerted on any page (or in another window) when a submission arrives — not only while the
 * moderation queue is open. Owns the feed list, the shared sound preference and desktop-notification
 * opt-in. Server needs no changes: it already emits `moderation:new` to the per-channel dashboard
 * room and authorizes the socket via the session cookie.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const toast = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) !== '0');
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const [desktopPref, setDesktopPref] = useState(() => localStorage.getItem(DESKTOP_KEY) === '1');
  const [permission, setPermission] = useState<PermissionState>(initialPermission);

  const userId = me?.user?.id ?? null;

  // Preserve the server-rendered tab title and only prepend the unread count.
  const baseTitleRef = useRef(document.title || 'Tossit');

  useEffect(() => {
    initAudioUnlock();
  }, []);

  // Merge new items newest-first, deduped by id, capped.
  const addItems = useCallback((incoming: NotificationItem[]) => {
    setNotifications((prev) => {
      const seen = new Set(prev.map((n) => n.id));
      const fresh = incoming.filter((n) => !seen.has(n.id));
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ITEMS);
    });
  }, []);

  // Ref (not a dep) so the subscription effect doesn't re-run on every navigation.
  const isActivelyViewingRef = useRef<(channelId: string) => boolean>(() => false);
  isActivelyViewingRef.current = (channelId) =>
    document.visibilityState === 'visible' &&
    pathname === '/dashboard' &&
    channelId === localStorage.getItem(SELECTED_CHANNEL_KEY);

  // Rebound each render so the once-bound socket handler always runs fresh logic
  // (current route, prefs, language) without resubscribing.
  const onNewRef = useRef<(channelId: string, s: SubmissionSummary) => void>(() => {});
  onNewRef.current = (channelId, s) => {
    const selected = localStorage.getItem(SELECTED_CHANNEL_KEY);
    // The dashboard's own socket handles the live queue + sound for the channel it shows.
    const dashOwnsChannel = pathname === '/dashboard' && channelId === selected;
    const seenLive = document.visibilityState === 'visible' && dashOwnsChannel;

    addItems([
      {
        id: s.id,
        kind: 'submission',
        channelId,
        senderName: s.senderName,
        submissionKind: s.kind,
        createdAt: Date.now(),
        read: seenLive,
      },
    ]);
    if (seenLive) return; // staring at the live queue — the dashboard already surfaces it

    const name = s.senderName ?? t('common.anon');
    if (soundOn && !dashOwnsChannel) playNotify(); // dashboard plays it when it owns the channel

    if (document.visibilityState === 'visible') {
      toast(t('notif.newFrom', { name }), 'ok');
    } else if (desktopPref && 'Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(t('notif.newTitle'), {
        body: t('notif.newFrom', { name }),
        tag: 'tossit-mod',
        icon: '/favicon.svg',
      });
      n.onclick = () => {
        window.focus();
        navigate('/dashboard');
        n.close();
      };
    }
  };

  // Subscribe to all accessible channels; reset on login/logout.
  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    const sockets: Socket[] = [];
    void getMyChannels()
      .then((channels) => {
        if (cancelled) return;
        for (const ch of channels) {
          // Seed the feed with the current backlog so a fresh load shows what's waiting.
          void getPending(ch.channelId)
            .then((list) => {
              if (cancelled) return;
              addItems(
                list.map((s) => ({
                  id: s.id,
                  kind: 'submission' as const,
                  channelId: ch.channelId,
                  senderName: s.senderName,
                  submissionKind: s.kind,
                  createdAt: s.createdAt,
                  read: isActivelyViewingRef.current(ch.channelId),
                })),
              );
            })
            .catch(() => {});
          const socket = connectSocket({ role: 'dashboard', channelId: ch.channelId });
          socket.on('moderation:new', (s: SubmissionSummary) => onNewRef.current(ch.channelId, s));
          socket.on('moderation:resolved', (id: string) =>
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n))),
          );
          sockets.push(socket);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sockets.forEach((s) => s.close());
    };
  }, [userId, addItems]);

  // Opening the queue marks that channel's feed items read.
  useEffect(() => {
    if (pathname !== '/dashboard') return;
    const selected = localStorage.getItem(SELECTED_CHANNEL_KEY);
    if (!selected) return;
    setNotifications((prev) =>
      prev.some((n) => n.channelId === selected && !n.read)
        ? prev.map((n) => (n.channelId === selected ? { ...n, read: true } : n))
        : prev,
    );
  }, [pathname]);

  const unreadCount = notifications.reduce((n, item) => n + (item.read ? 0 : 1), 0);

  // Global tab-title badge — visible on any page when the tab is backgrounded.
  useEffect(() => {
    document.title = (unreadCount > 0 ? `(${unreadCount}) ` : '') + baseTitleRef.current;
  }, [unreadCount]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev,
    );
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      localStorage.setItem(SOUND_KEY, next ? '1' : '0');
      if (next) playNotify(); // confirm + unlock audio in browser
      return next;
    });
  }, []);

  const toggleDesktop = useCallback(() => {
    if (!('Notification' in window)) {
      toast(t('notif.unsupported'), 'warn');
      return;
    }
    if (Notification.permission === 'denied') {
      toast(t('notif.blocked'), 'warn');
      return;
    }
    if (Notification.permission === 'default') {
      void Notification.requestPermission().then((p) => {
        setPermission(p);
        if (p === 'granted') {
          setDesktopPref(true);
          localStorage.setItem(DESKTOP_KEY, '1');
          toast(t('notif.enabled'), 'ok');
        }
      });
      return;
    }
    setDesktopPref((prev) => {
      const next = !prev;
      localStorage.setItem(DESKTOP_KEY, next ? '1' : '0');
      return next;
    });
  }, [toast, t]);

  const desktopEnabled = desktopPref && permission === 'granted';

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        markAllRead,
        soundOn,
        toggleSound,
        soundOnRef,
        desktopEnabled,
        permission,
        toggleDesktop,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
