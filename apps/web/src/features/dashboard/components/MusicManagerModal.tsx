import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MusicTrack } from '@tmw/shared';
import { addMusicTrack, importMusicPlaylist, setMusicOrder } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useConfirm } from '@/providers/ConfirmProvider';
import { useToast } from '@/providers/ToastProvider';
import { Button, IconButton } from '@/ui';
import { Icon } from '@/ui/icons';

/**
 * Manage the owned background-music list: import a playlist (replaces it), add single tracks,
 * reorder (up/down), delete, and toggle shuffle. Edits hit the server and lift the new list up
 * (the overlay reloads live via music:config).
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
  const confirm = useConfirm();
  const toast = useToast();
  const [importUrl, setImportUrl] = useState('');
  const [trackUrl, setTrackUrl] = useState('');
  const [busy, setBusy] = useState(false);

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
      onTracksChange(r.tracks);
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!importUrl.trim()) return;
    if (tracks.length > 0) {
      const okConfirm = await confirm({
        message: t('music.importConfirm'),
        confirmLabel: t('music.import'),
        danger: true,
      });
      if (!okConfirm) return;
    }
    await run(() => importMusicPlaylist(channelId, importUrl.trim()), t('music.imported'));
    setImportUrl('');
  };

  const doAdd = async () => {
    if (!trackUrl.trim()) return;
    await run(() => addMusicTrack(channelId, trackUrl.trim()), t('music.added'));
    setTrackUrl('');
  };

  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= tracks.length) return;
    const next = [...tracks];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    onTracksChange(next); // optimistic
    void run(
      () =>
        setMusicOrder(
          channelId,
          next.map((tr) => tr.videoId),
        ),
      t('music.saved'),
    );
  };

  const remove = (videoId: string) => {
    const next = tracks.filter((tr) => tr.videoId !== videoId);
    onTracksChange(next); // optimistic
    void run(
      () =>
        setMusicOrder(
          channelId,
          next.map((tr) => tr.videoId),
        ),
      t('music.removed'),
    );
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

        {/* Import + add + shuffle controls */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted">{t('music.importLabel')}</label>
          <div className="flex gap-2">
            <input
              className={input}
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://www.youtube.com/playlist?list=…"
            />
            <Button size="sm" disabled={busy || !importUrl.trim()} onClick={() => void doImport()}>
              {t('music.import')}
            </Button>
          </div>
          <label className="mt-2 text-sm text-muted">{t('music.addLabel')}</label>
          <div className="flex gap-2">
            <input
              className={input}
              value={trackUrl}
              onChange={(e) => setTrackUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
            <Button size="sm" disabled={busy || !trackUrl.trim()} onClick={() => void doAdd()}>
              {t('music.add')}
            </Button>
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => onToggleShuffle(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            {t('music.shuffle')}
          </label>
        </div>

        {/* Editable list */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t border-border pt-3">
          {tracks.length === 0 ? (
            <p className="text-sm text-muted">{t('music.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {tracks.map((tr, i) => (
                <li key={tr.videoId} className="flex items-center gap-2 px-1 py-1 text-sm">
                  <img
                    src={`https://i.ytimg.com/vi/${tr.videoId}/default.jpg`}
                    alt=""
                    loading="lazy"
                    className="h-7 w-12 shrink-0 rounded-sm object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-text">{tr.title}</span>
                  <IconButton
                    name="chevron-up"
                    label={t('music.up')}
                    variant="ghost"
                    size="sm"
                    disabled={i === 0 || busy}
                    onClick={() => reorder(i, i - 1)}
                  />
                  <IconButton
                    name="chevron-down"
                    label={t('music.down')}
                    variant="ghost"
                    size="sm"
                    disabled={i === tracks.length - 1 || busy}
                    onClick={() => reorder(i, i + 1)}
                  />
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
