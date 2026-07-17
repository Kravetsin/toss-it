import { LEVEL_GLOW_FROM, levelTier, toRoman, type SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card } from '@/ui';
import { PlatformIcon } from '@/components/UserMarks';
import { CardEffect } from '@/components/CardEffect';
import { nickProps } from '@/lib/nick';
import { formatTrackDuration } from '../constants';

export function NowPlayingCard({
  now,
  isOwner,
  onSkip,
  onOpenTest,
}: {
  now: SubmissionSummary | null;
  isOwner: boolean;
  onSkip: () => void;
  onOpenTest: () => void;
}) {
  const { t } = useI18n();
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
      <CardEffect effect={now?.senderCardEffect} />
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
            <Button variant="danger" size="sm" className="shrink-0" onClick={onSkip}>
              <Icon name="forward" size={16} />
              {t('dash.skip')}
            </Button>
          )}
        </div>

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
