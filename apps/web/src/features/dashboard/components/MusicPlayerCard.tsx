import { useEffect, useRef, useState } from 'react';
import type { MusicCommand, MusicState, MusicTrack } from '@tmw/shared';
import { sendMusicCommand } from '@/lib/api';
import { clock } from '@/lib/format';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card, IconButton } from '@/ui';
import { SeekBar } from '@/ui/media/SeekBar';
import { VolumeSlider, volumeIcon } from '@/ui/media/VolumeSlider';
import { MusicManagerModal } from './MusicManagerModal';

/**
 * Background-music transport for the dashboard: play/pause/prev/next plus a scrollable
 * track list (click a track to play it). Presentational — tracks + live state come from
 * useChannelData so it can render in both responsive slots without double-fetching. The
 * actual player lives in the OBS overlay; this is only a remote. Phase 1 is read-only.
 */
export function MusicPlayerCard({
  channelId,
  tracks = [],
  onTracksChange,
  loading,
  musicState = { videoId: null, playing: false },
  shuffle,
  onToggleShuffle,
  hidden,
  onToggleHidden,
  volume,
  onVolumeChange,
}: {
  channelId: string;
  tracks: MusicTrack[];
  onTracksChange: (tracks: MusicTrack[]) => void;
  loading: boolean;
  musicState: MusicState;
  shuffle: boolean;
  onToggleShuffle: (v: boolean) => void;
  /** Hide the compact player in OBS (audio keeps playing). */
  hidden: boolean;
  onToggleHidden: (v: boolean) => void;
  /** Overlay music volume 0-100 (persisted in settings, pushed live via music:config). */
  volume: number;
  onVolumeChange: (v: number) => void;
}) {
  const { t } = useI18n();
  const [manageOpen, setManageOpen] = useState(false);

  const cmd = (c: MusicCommand) => void sendMusicCommand(channelId, c).catch(() => {});
  const current = tracks.find((tr) => tr.videoId === musicState.videoId);

  // Volume: local while dragging; commits to settings debounced (each PUT re-emits music:config).
  const [vol, setVol] = useState(volume);
  const volTimer = useRef(0);
  useEffect(() => setVol(volume), [volume]);
  const changeVolume = (v: number) => {
    setVol(v);
    window.clearTimeout(volTimer.current);
    volTimer.current = window.setTimeout(() => onVolumeChange(v), 400);
  };

  // Seek: the overlay reports position ~1/s; while scrubbing (and briefly after, until a fresh
  // report lands) show the local value so the bar doesn't jump back.
  const [seekPos, setSeekPos] = useState<number | null>(null);
  const scrubbing = useRef(false);
  const seekClear = useRef(0);
  // Fall back to the track's own duration so the bar shows the right length before the overlay's
  // first position tick — keeps the bar's height stable instead of appearing on play.
  const duration = musicState.durationSec || current?.durationSec || 0;
  const shownPos = seekPos ?? musicState.positionSec ?? 0;
  // Seeking needs a live overlay (it reports a position); disabled otherwise, but still rendered.
  const seekLive = musicState.positionSec != null && duration > 0;
  const commitSeek = (v: number) => {
    cmd({ action: 'seek', seconds: Math.round(v) });
    seekClear.current = window.setTimeout(() => setSeekPos(null), 1500);
  };
  // SeekBar fires onSeek continuously during a scrub — send the command only on release.
  const lastSeek = useRef(0);
  const onSeek = (v: number) => {
    window.clearTimeout(seekClear.current);
    lastSeek.current = v;
    setSeekPos(v);
    if (!scrubbing.current) commitSeek(v);
  };
  const onScrubStart = () => {
    scrubbing.current = true;
  };
  const onScrubEnd = () => {
    scrubbing.current = false;
    commitSeek(lastSeek.current);
  };
  useEffect(
    () => () => {
      window.clearTimeout(volTimer.current);
      window.clearTimeout(seekClear.current);
    },
    [],
  );

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
            disabled={tracks.length === 0}
            onClick={() => cmd({ action: 'prev' })}
          />
          <IconButton
            name={musicState.playing ? 'pause' : 'play'}
            size="sm"
            label={musicState.playing ? t('dash.musicPause') : t('dash.musicPlay')}
            disabled={tracks.length === 0}
            onClick={() => cmd({ action: musicState.playing ? 'pause' : 'play' })}
          />
          <IconButton
            name="skip-forward"
            size="sm"
            variant="ghost"
            label={t('dash.musicNext')}
            disabled={tracks.length === 0}
            onClick={() => cmd({ action: 'next' })}
          />
          <IconButton
            name="settings"
            size="sm"
            variant="ghost"
            label={t('music.manage')}
            onClick={() => setManageOpen(true)}
          />
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm text-muted">
          {current ? current.title : t('dash.musicIdle')}
        </p>
        <Icon
          name={volumeIcon(false, vol / 100)}
          size={15}
          className="shrink-0 text-muted"
          aria-hidden
        />
        <VolumeSlider
          volume={vol / 100}
          muted={false}
          onChange={(v) => changeVolume(Math.round(v * 100))}
          label={t('dash.musicVolume')}
        />
      </div>

      {/* Always rendered (interactive only when the overlay is live) so the row never appears or
          disappears between tracks and shifts the card height. */}
      <div className="mt-2 flex items-center gap-2">
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {clock(Math.floor(shownPos))}
        </span>
        <SeekBar
          current={shownPos}
          duration={duration}
          onSeek={onSeek}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
          label={t('dash.musicSeek')}
          disabled={!seekLive}
        />
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {clock(Math.floor(duration))}
        </span>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-muted">{t('common.loading')}</p>
      ) : tracks.length === 0 ? (
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-border py-4 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Icon name="gift" size={16} />
          {t('music.emptyCta')}
        </button>
      ) : (
        <ul className="mt-3 flex max-h-[8.5rem] flex-col gap-0.5 overflow-y-auto">
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

      <MusicManagerModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        channelId={channelId}
        tracks={tracks}
        onTracksChange={onTracksChange}
        shuffle={shuffle}
        onToggleShuffle={onToggleShuffle}
        hidden={hidden}
        onToggleHidden={onToggleHidden}
      />
    </Card>
  );
}
