import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { MusicTrack } from '@tmw/shared';
import { addMusic, setMusicOrder } from '@/lib/api';
import { clock } from '@/lib/format';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { Button, IconButton } from '@/ui';
import { Icon } from '@/ui/icons';

/**
 * Manage the owned background-music list: add a playlist or a single track from one link (both
 * append, deduped), drag to reorder, delete, and toggle shuffle. Edits hit the server and lift
 * the new list up (the overlay reloads live via music:config).
 */
export function MusicManagerModal({
  open,
  onClose,
  channelId,
  tracks,
  onTracksChange,
  shuffle,
  onToggleShuffle,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
  tracks: MusicTrack[];
  onTracksChange: (tracks: MusicTrack[]) => void;
  shuffle: boolean;
  onToggleShuffle: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  // Local working copy: drag reorders it live; only the drop commits to the server.
  const [items, setItems] = useState<MusicTrack[]>(tracks);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => setItems(tracks), [tracks]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const run = async (fn: () => Promise<{ tracks: MusicTrack[] }>, ok: string) => {
    setBusy(true);
    try {
      const r = await fn();
      setItems(r.tracks);
      onTracksChange(r.tracks);
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const doAdd = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const r = await addMusic(channelId, url.trim());
      setItems(r.tracks);
      onTracksChange(r.tracks);
      toast(t('music.addedN', { n: r.added }));
      setUrl('');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const remove = (videoId: string) => {
    const next = items.filter((tr) => tr.videoId !== videoId);
    setItems(next);
    onTracksChange(next);
    void run(
      () =>
        setMusicOrder(
          channelId,
          next.map((tr) => tr.videoId),
        ),
      t('music.removed'),
    );
  };

  // ── Drag to reorder (pointer-based, with edge auto-scroll) ──────────────────
  // The grabbed row floats under the pointer via an inline transform; mid-drag reorders animate
  // the other rows with FLIP (snapshot tops before setItems, slide from them after render).
  const listRef = useRef<HTMLUListElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; grabOffset: number; pointerY: number; itemH: number } | null>(
    null,
  );
  const rafRef = useRef(0);
  const movedRef = useRef(false);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const prevTopsRef = useRef<Map<string, number> | null>(null);

  const tick = () => {
    const st = drag.current;
    const list = listRef.current;
    if (!st || !list) return;
    const rect = list.getBoundingClientRect();
    const EDGE = 44;
    const SPEED = 14;
    if (st.pointerY < rect.top + EDGE) list.scrollTop -= SPEED;
    else if (st.pointerY > rect.bottom - EDGE) list.scrollTop += SPEED;

    const dragEl = rowRefs.current.get(st.id);
    if (dragEl) {
      const layoutTop = rect.top - list.scrollTop + dragEl.offsetTop;
      dragEl.style.transform = `translateY(${st.pointerY - st.grabOffset - layoutTop}px) scale(1.02)`;
    }

    const list0 = itemsRef.current;
    const topInContent = st.pointerY - st.grabOffset - rect.top + list.scrollTop;
    const target = Math.max(0, Math.min(list0.length - 1, Math.round(topInContent / st.itemH)));
    const cur = list0.findIndex((tr) => tr.videoId === st.id);
    if (cur !== -1 && target !== cur) {
      const next = [...list0];
      const [moved] = next.splice(cur, 1);
      if (moved) {
        next.splice(target, 0, moved);
        const tops = new Map<string, number>();
        for (const [id, el] of rowRefs.current) tops.set(id, el.getBoundingClientRect().top);
        prevTopsRef.current = tops;
        setItems(next);
        movedRef.current = true;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  useLayoutEffect(() => {
    const st = drag.current;
    const prev = prevTopsRef.current;
    const list = listRef.current;
    if (!st || !prev || !list) return;
    prevTopsRef.current = null;
    const base = list.getBoundingClientRect().top - list.scrollTop;
    for (const [id, el] of rowRefs.current) {
      if (id === st.id) continue;
      const before = prev.get(id);
      if (before == null) continue;
      // Snapshot includes any in-flight transform, so an interrupted slide continues smoothly.
      const delta = before - (base + el.offsetTop);
      if (Math.abs(delta) < 0.5) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 160ms ease';
        el.style.transform = '';
      });
    }
  }, [items]);

  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      cleanupRef.current?.();
    },
    [],
  );

  const onGrabDown = (e: ReactPointerEvent, id: string) => {
    if (drag.current) return;
    const row = (e.currentTarget as HTMLElement).closest('li');
    if (!row) return;
    // Stop the browser from starting a text selection with the drag gesture.
    e.preventDefault();
    const rect = row.getBoundingClientRect();
    drag.current = {
      id,
      grabOffset: e.clientY - rect.top,
      pointerY: e.clientY,
      itemH: rect.height,
    };
    movedRef.current = false;
    row.style.transition = 'none';
    row.style.zIndex = '10';
    setDragId(id);
    // Pointer capture would break here: mid-drag reorders move the row in the DOM, which drops
    // the capture. Window listeners keep the drag alive anywhere on the page.
    const pointerId = e.pointerId;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId && drag.current) drag.current.pointerY = ev.clientY;
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanupRef.current?.();
      finishDrag();
    };
    cleanupRef.current = () => {
      cleanupRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    rafRef.current = requestAnimationFrame(tick);
  };
  const finishDrag = () => {
    cancelAnimationFrame(rafRef.current);
    const st = drag.current;
    const committed = movedRef.current;
    drag.current = null;
    setDragId(null);
    // Let the released row glide into its slot instead of snapping.
    const el = st ? rowRefs.current.get(st.id) : undefined;
    if (el) {
      el.style.transition = 'transform 160ms ease';
      el.style.transform = '';
      window.setTimeout(() => {
        el.style.transition = '';
        el.style.zIndex = '';
      }, 200);
    }
    if (committed) {
      const next = itemsRef.current;
      onTracksChange(next);
      void run(
        () =>
          setMusicOrder(
            channelId,
            next.map((tr) => tr.videoId),
          ),
        t('music.saved'),
      );
    }
  };

  const input =
    'w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors focus-visible:border-accent';

  return createPortal(
    <div
      inert={!open}
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${open ? '' : 'pointer-events-none'}`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-[var(--dur)] ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        className={`glass glass-strong relative flex max-h-[85vh] w-full max-w-lg flex-col border border-glass-border p-5 shadow-4 transition-all duration-[var(--dur)] ${open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 label-mono text-text">
            <Icon name="youtube" size={16} className="text-accent" />
            {t('music.manage')}
          </h2>
          <IconButton
            name="close"
            label={t('common.close')}
            variant="ghost"
            size="sm"
            onClick={onClose}
          />
        </div>

        {/* One field: paste a playlist or a single video — both append (deduped). */}
        <label className="text-sm text-muted">{t('music.addLabel')}</label>
        <div className="mt-1 flex gap-2">
          <input
            className={input}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void doAdd()}
            placeholder="https://www.youtube.com/…?v= или ?list="
          />
          <Button size="sm" disabled={busy || !url.trim()} onClick={() => void doAdd()}>
            {t('music.add')}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => onToggleShuffle(!shuffle)}
          aria-pressed={shuffle}
          className={`mt-3 inline-flex w-max cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 label-mono outline-none transition-colors focus-visible:[box-shadow:var(--shadow-focus)] ${
            shuffle
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-border text-muted hover:text-text'
          }`}
        >
          <Icon name="shuffle" size={15} />
          {t('music.shuffle')}
        </button>

        {/* Editable list — drag the handle to reorder, × to remove. */}
        <div className="mt-4 min-h-0 flex-1 border-t border-border pt-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted">{t('music.empty')}</p>
          ) : (
            <ul
              ref={listRef}
              className={`relative flex max-h-[50vh] flex-col overflow-x-hidden overflow-y-auto ${dragId ? 'select-none' : ''}`}
            >
              {items.map((tr) => (
                <li
                  key={tr.videoId}
                  ref={(el) => {
                    if (el) rowRefs.current.set(tr.videoId, el);
                    else rowRefs.current.delete(tr.videoId);
                  }}
                  className={`relative flex items-center gap-2 rounded-[var(--radius-sm)] py-1 pr-1 text-sm ${
                    dragId === tr.videoId ? 'bg-accent-soft shadow-2' : ''
                  }`}
                >
                  <span
                    onPointerDown={(e) => onGrabDown(e, tr.videoId)}
                    aria-label={t('music.drag')}
                    className="shrink-0 cursor-grab touch-none px-1 text-faint hover:text-muted active:cursor-grabbing"
                  >
                    <Icon name="grip-vertical" size={16} />
                  </span>
                  <img
                    src={`https://i.ytimg.com/vi/${tr.videoId}/default.jpg`}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="h-7 w-12 shrink-0 rounded-sm object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-text">{tr.title}</span>
                  {tr.durationSec != null && (
                    <span className="shrink-0 text-xs tabular-nums text-faint">
                      {clock(tr.durationSec)}
                    </span>
                  )}
                  <IconButton
                    name="close"
                    label={t('music.remove')}
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => remove(tr.videoId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
