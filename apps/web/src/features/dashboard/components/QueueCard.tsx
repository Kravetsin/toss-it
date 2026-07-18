import { useEffect, useRef, useState } from 'react';
import { giphyGifUrl, type SubmissionSummary } from '@tmw/shared';
import { reorderQueue } from '@/lib/api';
import { youtubeThumbnail } from '@/lib/youtube';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card } from '@/ui';
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

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-mono text-muted">{t('dash.queue')}</h2>
        <span className="label-mono text-faint">{items.length}</span>
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
              {s.text && <p className="truncate text-xs text-muted">{s.text}</p>}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-faint">
              {formatTrackDuration(s.kind, s.durationMs, t)}
            </span>
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
