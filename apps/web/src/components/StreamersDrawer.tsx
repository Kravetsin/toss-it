import { useCallback, useEffect, useState } from 'react';
import type { DirectoryChannel } from '@tmw/shared';
import { listDirectory } from '@/lib/api';
import { mb } from '@/lib/format';
import { nickProps } from '@/lib/nick';
import { formatDuration, useI18n } from '@/i18n';
import { Avatar, Chip, Drawer, Loader } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';
import { CardEffect } from '@/components/CardEffect';
import { StarMark } from '@/components/StarMark';
import { UserBadges } from '@/components/UserMarks';

const POLL_MS = 30_000;

/**
 * Who is on top rotates per visitor instead of following login order, so a small channel isn't
 * permanently last. One seed per page load: the list re-polls while open, and a fresh seed each
 * time would make rows jump under the cursor.
 */
const SEED = Math.floor(Math.random() * 0xffff);
function rotation(login: string): number {
  let h = SEED;
  for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) | 0;
  return h;
}

const ACTION_CLS =
  'flex flex-1 items-center justify-center gap-2 border px-3 py-2.5 text-center label-mono outline-none transition-colors duration-[var(--dur-fast)] focus-visible:[box-shadow:var(--shadow-focus)]';

/** An opt-in worth naming on the card — shown only when it's on, so the list reads as a promise. */
type OptIn =
  | 'autoApproveGifs'
  | 'autoApproveYoutube'
  | 'autoApproveText'
  | 'ttsEnabled'
  | 'allowViewerPosition';
const OPT_INS: { key: OptIn; icon: IconName; label: string }[] = [
  { key: 'autoApproveGifs', icon: 'image', label: 'dir.chipGifs' },
  { key: 'autoApproveYoutube', icon: 'youtube', label: 'dir.chipYoutube' },
  { key: 'autoApproveText', icon: 'send', label: 'dir.chipText' },
  { key: 'ttsEnabled', icon: 'volume-2', label: 'dir.chipTts' },
  { key: 'allowViewerPosition', icon: 'monitor', label: 'dir.chipPosition' },
];

function Card({ channel: c }: { channel: DirectoryChannel }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const nick = nickProps({
    color: c.nickColor,
    color2: c.nickColor2,
    flow: c.nickFlow,
    effect: c.nickEffect,
  });
  const min =
    c.lastLiveAt == null ? 0 : Math.max(1, Math.round((Date.now() - c.lastLiveAt) / 60_000));
  const state = c.live
    ? t('dir.live')
    : min >= 60
      ? t('dir.agoH', { h: Math.floor(min / 60) })
      : t('dir.agoM', { m: min });

  return (
    <li className="relative overflow-hidden border border-border bg-surface-2 transition-colors duration-[var(--dur-fast)] hover:border-accent">
      {/* The streamer's own card effect, same as on their channel header — compact while the card is
          a single row (particles would look sparse crossing it), full once it opens. */}
      <CardEffect effect={c.cardEffect} color={c.cardEffectColor} compact={!open} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="relative flex w-full cursor-pointer items-center gap-3 p-2.5 text-left outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
      >
        <Avatar url={c.avatarUrl} name={c.displayName} size={34} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={`truncate text-sm font-semibold text-text ${nick.className}`}
              style={nick.style}
            >
              {c.displayName}
            </span>
            {c.streamPlatform && (
              <Icon name={c.streamPlatform} size={12} className="shrink-0 text-faint" />
            )}
            {/* Row is a button, so the badge must not become a focus stop of its own. */}
            <UserBadges isFounder={c.isFounder} size={20} focusable={false} />
          </span>
          <span className={`text-xs text-muted ${open ? '' : 'truncate'}`}>
            {c.description || t('dir.noDescription')}
          </span>
        </span>
        <span
          className={`shrink-0 label-mono ${c.live ? 'flex items-center gap-1.5 text-ok' : 'text-faint'}`}
        >
          {c.live && <span className="size-2 shrink-0 animate-pulse rounded-full bg-ok" />}
          {state}
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className={`shrink-0 text-faint transition-transform duration-[var(--dur)] ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="relative flex flex-col gap-3 border-t border-border p-3">
          {/* Same star the leaderboard puts next to a sends count — one mark for "aired on stream". */}
          <span className="flex items-center gap-2 text-sm text-muted">
            <StarMark size={15} className="text-accent" />
            {t('dir.aired', { n: c.aired })}
          </span>
          <div className="flex flex-wrap gap-2">
            <Chip
              icon="image"
              text={t('channel.limitVideo', { dur: formatDuration(c.maxDurationMs, t) })}
            />
            <Chip
              icon="volume-2"
              text={t('channel.limitAudio', { dur: formatDuration(c.maxAudioDurationMs, t) })}
            />
            <Chip icon="save" text={t('channel.limitSize', { mb: mb(c.maxFileSizeBytes) })} />
            {OPT_INS.filter((o) => c[o.key]).map((o) => (
              <Chip key={o.key} icon={o.icon} text={t(o.label)} />
            ))}
          </div>
          <div className="flex gap-2">
            {/* Plain <a>: the provider lives outside the router, and landing on the channel page
                fresh is what we want anyway. */}
            <a
              href={`/c/${encodeURIComponent(c.login)}`}
              className={`${ACTION_CLS} border-accent bg-accent-soft text-accent hover:bg-accent hover:text-accent-contrast`}
            >
              <Icon name="send" size={15} />
              {t('dir.send')}
            </a>
            {c.streamUrl && (
              <a
                href={c.streamUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={`${ACTION_CLS} border-border bg-surface text-muted hover:border-accent hover:text-text`}
              >
                <Icon name={c.streamPlatform ?? 'external-link'} size={15} />
                {t('dir.watch')}
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** Channels taking sends right now — the one cross-channel discovery surface (see /api/directory). */
export function StreamersDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<DirectoryChannel[] | null>(null);

  const refresh = useCallback(() => {
    void listDirectory()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  useEffect(() => {
    if (!open) return;
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  const live = (rows ?? [])
    .filter((r) => r.live)
    .sort((a, b) => rotation(a.login) - rotation(b.login));
  const recent = (rows ?? []).filter((r) => !r.live);

  return (
    <Drawer open={open} onClose={onClose} title={t('dir.title')} closeLabel={t('common.close')}>
      {/* Said up front rather than in a tooltip: an overlay stays connected while OBS is open, so
          "taking sends" is what we actually know — see the streamer-directory copy. */}
      <p className="mb-4 text-sm text-muted">{t('dir.subtitle')}</p>
      {rows == null ? (
        <Loader label={t('common.loading')} />
      ) : (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="label-mono text-muted">
              {t('dir.liveGroup')}{' '}
              {live.length > 0 && <span className="text-faint">({live.length})</span>}
            </h3>
            {live.length === 0 ? (
              <p className="text-xs text-muted">{t('dir.noneLive')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {live.map((c) => (
                  <Card key={c.login} channel={c} />
                ))}
              </ul>
            )}
          </section>
          {recent.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="label-mono text-muted">{t('dir.recentGroup')}</h3>
              <ul className="flex flex-col gap-2">
                {recent.map((c) => (
                  <Card key={c.login} channel={c} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
