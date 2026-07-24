import {
  LEVEL_GLOW_FROM,
  levelTier,
  type PlaybackProgress,
  toRoman,
  type SubmissionSummary,
} from '@tmw/shared';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card, LinkedText } from '@/ui';
import { SeekBar } from '@/ui/media/SeekBar';
import { VolumeSlider, volumeIcon } from '@/ui/media/VolumeSlider';
import { PlatformIcon } from '@/components/UserMarks';
import { CardEffect } from '@/components/CardEffect';
import { nickProps } from '@/lib/nick';
import { formatTrackDuration } from '../constants';

/** mm:ss */
function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function NowPlayingCard({
  now,
  progress,
  live,
  isOwner,
  volume,
  onVolumeChange,
  onSeek,
  onSkip,
  onPauseResume,
  onOpenTest,
}: {
  now: SubmissionSummary | null;
  /** Live position of the current show, or null (no overlay / not reported yet). */
  progress: PlaybackProgress | null;
  /** Whether an overlay is connected — controls are disabled without one. */
  live: boolean;
  isOwner: boolean;
  /** Content volume 0-100 (channel setting); the slider shows only when this + onVolumeChange are set. */
  volume?: number;
  /** Commit a new content volume (persist + push live). Debounced by the card. */
  onVolumeChange?: (v: number) => void;
  /** Seek the current show to a position (seconds). Enables the scrub bar for video/audio/YouTube. */
  onSeek?: (seconds: number) => void;
  onSkip: () => void;
  onPauseResume: (paused: boolean) => void;
  onOpenTest: () => void;
}) {
  const { t } = useI18n();

  // Content volume: track locally while dragging; commit (persist + live push) debounced, so it
  // applies once the streamer settles — same feel as the background-music slider.
  const showVolume = volume != null && !!onVolumeChange;
  const [vol, setVol] = useState(volume ?? 100);
  const volTimer = useRef(0);
  useEffect(() => {
    if (volume != null) setVol(volume);
  }, [volume]);
  useEffect(() => () => window.clearTimeout(volTimer.current), []);
  const changeVolume = (v: number) => {
    setVol(v);
    window.clearTimeout(volTimer.current);
    volTimer.current = window.setTimeout(() => onVolumeChange?.(v), 300);
  };

  // Scrub the current show (video/audio/YouTube only — image/gif/text run on a fixed timer). Local
  // position while dragging; commit on release, then hold it briefly so the bar doesn't snap back
  // before a fresh progress tick lands.
  const seekable =
    !!now && !!onSeek && (now.kind === 'video' || now.kind === 'audio' || now.kind === 'youtube');
  const [seekPos, setSeekPos] = useState<number | null>(null);
  const scrubbing = useRef(false);
  const seekClear = useRef(0);
  const lastSeek = useRef(0);
  useEffect(() => () => window.clearTimeout(seekClear.current), []);
  useEffect(() => setSeekPos(null), [now?.id]); // drop a stale scrub value when the show changes
  const durationSec = (progress?.durationMs ?? 0) / 1000;
  const shownSec = seekPos ?? (progress?.positionMs ?? 0) / 1000;
  const commitSeek = (v: number) => {
    onSeek?.(Math.round(v));
    window.clearTimeout(seekClear.current);
    seekClear.current = window.setTimeout(() => setSeekPos(null), 1500);
  };
  const handleSeek = (v: number) => {
    window.clearTimeout(seekClear.current);
    lastSeek.current = v;
    setSeekPos(v);
    if (!scrubbing.current) commitSeek(v);
  };

  const tier = now?.senderLevel ? levelTier(now.senderLevel) : null;
  const levelGlow = !!tier && (now?.senderLevel ?? 0) >= LEVEL_GLOW_FROM;
  const nick = nickProps({
    color: now?.senderColor,
    color2: now?.senderColor2,
    flow: now?.senderNickFlow,
    effect: now?.senderEffect,
  });

  return (
    <Card>
      <CardEffect effect={now?.senderCardEffect} color={now?.senderCardEffectColor} />
      {tier && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 z-[1] w-[3px] ${tier.iris ? 'lvl-iris' : ''}`}
          style={{
            background: tier.color,
            boxShadow: levelGlow ? `0 0 7px ${tier.color}` : undefined,
          }}
        />
      )}
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="label-mono text-muted">{t('dash.nowPlaying')}</h2>
            {now ? (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                {tier && (
                  <span
                    className={`shrink-0 text-xs font-bold ${tier.iris ? 'lvl-iris' : ''}`}
                    style={{
                      color: tier.color,
                      textShadow: levelGlow ? `0 0 6px ${tier.color}` : undefined,
                    }}
                  >
                    {toRoman(now.senderLevel!)}
                  </span>
                )}
                <b className={`truncate text-text ${nick.className}`} style={nick.style}>
                  {now.senderName ?? t('common.anon')}
                </b>
                <PlatformIcon userId={now.senderUserId} size={13} />
                <span className="truncate">
                  · {now.kind === 'youtube' ? 'YouTube' : now.mime} ·{' '}
                  {formatTrackDuration(now.kind, now.durationMs, t)}
                </span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted">{t('dash.nothingPlaying')}</p>
            )}
          </div>
          {now && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!live}
                onClick={() => onPauseResume(!(progress?.paused ?? false))}
                title={progress?.paused ? t('dash.resume') : t('dash.pause')}
              >
                <Icon name={progress?.paused ? 'play' : 'pause'} size={16} />
              </Button>
              <Button variant="danger" size="sm" onClick={onSkip}>
                <Icon name="forward" size={16} />
                {t('dash.skip')}
              </Button>
            </div>
          )}
        </div>

        {/* The message currently on screen: the streamer reads it live, so links must be reachable here. */}
        {now?.text && (
          <p className="mt-3 max-h-28 select-text overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-accent/40 py-0.5 pl-3 text-sm text-text">
            <LinkedText text={now.text} />
          </p>
        )}

        {now && (
          <div className="mt-3 flex items-center gap-2">
            <SeekBar
              current={shownSec}
              duration={durationSec}
              onSeek={handleSeek}
              onScrubStart={() => {
                scrubbing.current = true;
              }}
              onScrubEnd={() => {
                scrubbing.current = false;
                commitSeek(lastSeek.current);
              }}
              label={t('dash.seek')}
              disabled={!seekable}
            />
            <span className="label-mono shrink-0 text-xs text-faint">
              {clock(shownSec * 1000)}
              {durationSec ? ` / ${clock(durationSec * 1000)}` : ''}
            </span>
            {showVolume && (
              <div className="flex shrink-0 items-center gap-1.5">
                <Icon
                  name={volumeIcon(false, vol / 100)}
                  size={14}
                  className="text-muted"
                  aria-hidden
                />
                <VolumeSlider
                  volume={vol / 100}
                  muted={false}
                  onChange={(v) => changeVolume(Math.round(v * 100))}
                  label={t('dash.contentVolume')}
                />
              </div>
            )}
          </div>
        )}

        {isOwner && (
          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={onOpenTest}
              className="flex cursor-pointer items-center gap-1.5 label-mono text-muted outline-none transition-colors duration-[var(--dur-fast)] ease-out hover:text-text focus-visible:text-text"
            >
              <Icon name="send" size={14} />
              {t('dash.testSend')}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
