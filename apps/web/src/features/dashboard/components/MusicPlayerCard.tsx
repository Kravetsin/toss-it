import { useEffect, useState } from 'react';
import type { MusicCommand, MusicState, MusicTrack } from '@tmw/shared';
import { getMusicTracks, sendMusicCommand } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card, IconButton } from '@/ui';

/**
 * Background-music transport for the dashboard: play/pause/prev/next plus a scrollable
 * track list (click a track to play it). Live state (current track + playing) arrives via
 * the dashboard socket. Phase 1 is read-only — editing the list comes later.
 */
export function MusicPlayerCard({
  channelId,
  hasPlaylist,
  musicState,
}: {
  channelId: string;
  /** Whether a playlist is configured (settings). Card hides entirely if not. */
  hasPlaylist: boolean;
  musicState: MusicState;
}) {
  const { t } = useI18n();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasPlaylist) return;
    let cancelled = false;
    setLoading(true);
    void getMusicTracks(channelId)
      .then((r) => {
        if (!cancelled) setTracks(r.tracks);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, hasPlaylist]);

  if (!hasPlaylist) return null;

  const cmd = (c: MusicCommand) => void sendMusicCommand(channelId, c).catch(() => {});
  const current = tracks.find((tr) => tr.videoId === musicState.videoId);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 label-mono text-muted">
          <Icon name="youtube" size={16} className="shrink-0 text-accent" />
          <span className="truncate">{t('dash.music')}</span>
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            name="skip-back"
            size="sm"
            variant="ghost"
            label={t('dash.musicPrev')}
            onClick={() => cmd({ action: 'prev' })}
          />
          <IconButton
            name={musicState.playing ? 'pause' : 'play'}
            size="sm"
            label={musicState.playing ? t('dash.musicPause') : t('dash.musicPlay')}
            onClick={() => cmd({ action: musicState.playing ? 'pause' : 'play' })}
          />
          <IconButton
            name="skip-forward"
            size="sm"
            variant="ghost"
            label={t('dash.musicNext')}
            onClick={() => cmd({ action: 'next' })}
          />
        </div>
      </div>

      <p className="mt-1 truncate text-sm text-muted">
        {current ? current.title : t('dash.musicIdle')}
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-muted">{t('common.loading')}</p>
      ) : tracks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('dash.musicNoTracks')}</p>
      ) : (
        <ul className="mt-3 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {tracks.map((tr, i) => {
            const active = tr.videoId === musicState.videoId;
            return (
              <li key={`${tr.videoId}-${i}`}>
                <button
                  type="button"
                  onClick={() => cmd({ action: 'playAt', videoId: tr.videoId })}
                  className={`flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm outline-none transition-colors focus-visible:bg-surface-2 ${
                    active ? 'bg-accent-soft text-accent' : 'text-text hover:bg-surface-2'
                  }`}
                >
                  <img
                    src={`https://i.ytimg.com/vi/${tr.videoId}/default.jpg`}
                    alt=""
                    loading="lazy"
                    className="h-7 w-12 shrink-0 rounded-sm object-cover"
                  />
                  <span className="truncate">{tr.title}</span>
                  {active && musicState.playing && (
                    <Icon name="volume-2" size={13} className="ml-auto shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
