import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { Tooltip } from '@/ui';
import { useNotifications, type NotificationItem } from '@/providers/NotificationsProvider';

const PANEL_MAX_H = 440;
const SELECTED_CHANNEL_KEY = 'tmw_dash_channel';

interface PanelPos {
  left: number;
  top: number;
  width: number;
  up: boolean;
}

const KIND_ICON: Record<string, IconName> = {
  text: 'message-circle',
  image: 'image',
  gif: 'image',
  video: 'play',
  youtube: 'play',
  audio: 'volume-2',
};

/** Compact localized relative time, e.g. "5 min ago" — recomputed on each open. */
function relativeTime(ts: number, lang: string): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const sec = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(Math.min(sec, -1), 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const hr = Math.round(sec / 3600);
  if (Math.abs(hr) < 24) return rtf.format(hr, 'hour');
  return rtf.format(Math.round(sec / 86400), 'day');
}

function ToggleRow({
  icon,
  label,
  on,
  onToggle,
}: {
  icon: IconName;
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-text outline-none transition-colors duration-[var(--dur-fast)] hover:bg-surface-2 focus-visible:bg-surface-2"
    >
      <Icon name={icon} size={16} className={`shrink-0 ${on ? 'text-accent' : 'text-muted'}`} />
      <span className="truncate">{label}</span>
      <span className={`ml-auto label-mono ${on ? 'text-accent' : 'text-muted'}`}>
        {on ? t('notif.on') : t('notif.off')}
      </span>
    </button>
  );
}

function FeedItem({ item, onNavigate }: { item: NotificationItem; onNavigate: () => void }) {
  const { t, lang } = useI18n();
  const name = item.senderName ?? t('common.anon');
  return (
    <button
      type="button"
      onClick={onNavigate}
      className="flex w-full items-start gap-3 px-3 py-2.5 text-left outline-none transition-colors duration-[var(--dur-fast)] hover:bg-surface-2 focus-visible:bg-surface-2"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name={KIND_ICON[item.submissionKind] ?? 'bell'} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-text">{t('notif.newFrom', { name })}</span>
        <span className="block text-xs text-muted">{relativeTime(item.createdAt, lang)}</span>
      </span>
      {!item.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-hidden />}
    </button>
  );
}

/**
 * YouTube-style notification hub: a bell trigger with an unread badge that opens a portaled popover
 * listing recent notifications plus the sound / desktop-notification toggles. Lives in the app shell
 * so it's reachable on every page. `variant` picks the trigger shape for the sidebar vs mobile bar.
 */
export function NotificationBell({
  variant = 'icon',
  collapsed = false,
}: {
  /** 'sidebar' = full-width nav row (respects `collapsed`); 'icon' = round button for the mobile bar. */
  variant?: 'sidebar' | 'icon';
  collapsed?: boolean;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    markAllRead,
    soundOn,
    toggleSound,
    desktopEnabled,
    toggleDesktop,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(360, window.innerWidth - 16);
      const belowSpace = window.innerHeight - r.bottom;
      const up = belowSpace < PANEL_MAX_H + 16 && r.top > belowSpace;
      const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
      setPos({ left, top: up ? r.top - 8 : r.bottom + 8, width, up });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) markAllRead();
  };

  const goToItem = (item: NotificationItem) => {
    // Land on the right channel's queue when the streamer moderates several.
    try {
      localStorage.setItem(SELECTED_CHANNEL_KEY, item.channelId);
    } catch {
      // localStorage may be unavailable
    }
    setOpen(false);
    navigate('/dashboard');
  };

  const badge =
    unreadCount > 0 ? (
      <span
        aria-hidden
        className="pointer-events-none flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] font-bold leading-none text-accent-contrast"
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    ) : null;

  const trigger =
    variant === 'sidebar' ? (
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        aria-label={t('notif.title')}
        aria-expanded={open}
        className={`relative flex w-full items-center overflow-hidden px-3 py-2.5 label-mono text-muted outline-none transition-colors duration-[var(--dur-fast)] ease-out hover:text-text focus-visible:[box-shadow:var(--shadow-focus)] ${
          collapsed ? 'justify-center' : 'justify-start gap-3'
        } ${open ? 'text-text' : ''}`}
      >
        <span className="relative shrink-0">
          <Icon name="bell" size={18} />
          {collapsed && badge && <span className="absolute -right-2 -top-2">{badge}</span>}
        </span>
        <span
          className="overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-[var(--dur)] ease-out"
          style={{ maxWidth: collapsed ? 0 : '10rem', opacity: collapsed ? 0 : 1 }}
        >
          {t('notif.title')}
        </span>
        {!collapsed && badge && <span className="ml-auto">{badge}</span>}
      </button>
    ) : (
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        aria-label={t('notif.title')}
        aria-expanded={open}
        className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border outline-none transition-colors duration-[var(--dur-fast)] ease-out focus-visible:[box-shadow:var(--shadow-focus)] ${
          open
            ? 'border-transparent bg-accent-soft text-accent'
            : 'border-border text-muted hover:text-text'
        }`}
      >
        <Icon name="bell" size={18} />
        {badge && <span className="absolute -right-1 -top-1">{badge}</span>}
      </button>
    );

  const triggerEl =
    variant === 'sidebar' && collapsed ? (
      <Tooltip content={t('notif.title')} placement="right" focusable={false} className="w-full">
        {trigger}
      </Tooltip>
    ) : (
      trigger
    );

  return (
    <>
      {triggerEl}
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t('notif.title')}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: pos.width,
              transform: pos.up ? 'translateY(-100%)' : undefined,
            }}
            className="glass glass-strong z-[80] flex max-h-[440px] flex-col overflow-hidden border border-glass-border shadow-4"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <span className="label-mono text-text">{t('notif.title')}</span>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="cursor-pointer text-xs text-muted outline-none transition-colors hover:text-text focus-visible:text-text"
                >
                  {t('notif.markAllRead')}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Icon name="bell" size={24} className="text-muted opacity-60" />
                  <p className="text-sm text-muted">{t('notif.empty')}</p>
                </div>
              ) : (
                notifications.map((item) => (
                  <FeedItem key={item.id} item={item} onNavigate={() => goToItem(item)} />
                ))
              )}
            </div>

            <div className="border-t border-border">
              <ToggleRow
                icon={soundOn ? 'bell' : 'bell-off'}
                label={t('notif.soundLabel')}
                on={soundOn}
                onToggle={toggleSound}
              />
              <ToggleRow
                icon="monitor"
                label={t('notif.desktopLabel')}
                on={desktopEnabled}
                onToggle={toggleDesktop}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
