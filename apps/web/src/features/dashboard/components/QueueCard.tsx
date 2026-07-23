import { useEffect, useRef, useState } from 'react';
import { giphyGifUrl, type SubmissionSummary } from '@tmw/shared';
import { clearQueue, removeFromQueue, reorderQueue } from '@/lib/api';
import { youtubeThumbnail } from '@/lib/youtube';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card, IconButton, LinkedText } from '@/ui';
import { KIND_ICON, formatTrackDuration } from '../constants';
import { useReorderList } from '../hooks/useReorderList';

/**
 * The waiting queue under "Now playing": every approved submission not yet on screen, in play order.
 * Drag a row to reorder (same feel as the music manager). The list is live — items leave the top as
 * they play and new ones arrive — so an incoming update is ignored only while a drag is in flight.
 */
export function QueueCard({ channelId, queue }: { channelId: string; queue: SubmissionSummary[] }) {
  const { t } = useI18n();
  // Local working copy so a drag reorders live; committed order persists via the reorder endpoint.
  const [items, setItems] = useState(queue);
  const { listRef, dragId, registerRow, handleProps } = useReorderList<SubmissionSummary>({
    items,
    setItems,
    getId: (s) => s.id,
    onCommit: (ids) => void reorderQueue(channelId, ids).catch(() => {}),
  });
  // Adopt each fresh server list — except mid-drag, where a live update would fight the pointer.
  // Keyed on `queue` only (not dragId): resyncing on release would briefly revert the optimistic
  // order before the server's echo lands. The committed order arrives as the next `queue` push.
  const dragging = useRef(false);
  dragging.current = dragId !== null;
  useEffect(() => {
    if (!dragging.current) setItems(queue);
  }, [queue]);

  // Drop one item: optimistic (the server's echo confirms). The streamer can't vet what's incoming,
  // so pulling it from the queue is the guard.
  const remove = (id: string) => {
    setItems((prev) => prev.filter((s) => s.id !== id));
    void removeFromQueue(channelId, id).catch(() => {});
  };

  // Clear all is destructive and one-shot, so it arms on the first click and fires on the second.
  const [clearArmed, setClearArmed] = useState(false);
  const clearTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(clearTimer.current), []);
  const clearAll = () => {
    if (!clearArmed) {
      setClearArmed(true);
      clearTimer.current = window.setTimeout(() => setClearArmed(false), 3000);
      return;
    }
    window.clearTimeout(clearTimer.current);
    setClearArmed(false);
    setItems([]);
    void clearQueue(channelId).catch(() => {});
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-mono text-muted">{t('dash.queue')}</h2>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 label-mono outline-none transition-colors focus-visible:[box-shadow:var(--shadow-focus)] ${
                clearArmed
                  ? 'border-danger bg-danger/10 text-danger'
                  : 'border-border text-muted hover:border-danger hover:text-danger'
              }`}
            >
              <Icon name="trash" size={14} />
              {clearArmed ? t('music.clearConfirm') : t('music.clearAll')}
            </button>
          )}
          <span className="label-mono text-faint">{items.length}</span>
        </div>
      </div>
      {/* `relative`: makes this <ul> the offsetParent of its rows, so the drag hook's offsetTop math
          is measured from the list (not the card header) — otherwise the grabbed row flies upward. */}
      <ul
        ref={listRef}
        className={`relative mt-3 flex max-h-64 flex-col gap-0.5 overflow-x-hidden overflow-y-auto ${
          dragId ? 'select-none' : ''
        }`}
      >
        {items.map((s) => (
          <li
            key={s.id}
            ref={registerRow(s.id)}
            className={`relative flex items-center gap-2.5 rounded-[var(--radius-sm)] py-1.5 pr-1 text-sm ${
              dragId === s.id ? 'bg-accent-soft shadow-2' : ''
            }`}
          >
            <span
              {...handleProps(s.id)}
              aria-label={t('music.drag')}
              className="shrink-0 cursor-grab touch-none px-0.5 text-faint hover:text-muted active:cursor-grabbing"
            >
              <Icon name="grip-vertical" size={16} />
            </span>
            <Thumb s={s} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-text">{s.senderName ?? t('common.anon')}</p>
              {s.text && (
                <p className="select-text truncate text-xs text-muted">
                  <LinkedText text={s.text} />
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-faint">
              {formatTrackDuration(s.kind, s.durationMs, t)}
            </span>
            <IconButton
              name="close"
              label={t('music.remove')}
              variant="ghost"
              size="sm"
              onClick={() => remove(s.id)}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Small queue thumbnail: image/YouTube/GIF preview, else the kind's glyph. */
function Thumb({ s }: { s: SubmissionSummary }) {
  const [err, setErr] = useState(false);
  const src =
    !err && s.kind === 'image'
      ? s.url
      : !err && s.kind === 'youtube' && s.youtubeId
        ? youtubeThumbnail(s.youtubeId)
        : !err && s.kind === 'gif' && s.giphyId
          ? giphyGifUrl(s.giphyId, '200w.gif')
          : null;
  if (src) {
    return (
      <div className="grid h-9 w-14 shrink-0 place-items-center overflow-hidden rounded-sm bg-surface-2">
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setErr(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className="grid h-9 w-14 shrink-0 place-items-center rounded-sm bg-surface-2">
      <Icon name={KIND_ICON[s.kind]} size={16} className="text-muted" />
    </div>
  );
}
