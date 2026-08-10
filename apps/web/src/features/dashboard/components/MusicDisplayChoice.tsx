import type { MusicDisplay } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { TogglePill } from '@/ui';
import type { IconName } from '@/ui/icons';

const OPTIONS: { value: MusicDisplay; icon: IconName; key: string }[] = [
  { value: 'full', icon: 'monitor', key: 'music.displayFull' },
  { value: 'compact', icon: 'picture-in-picture', key: 'music.displayCompact' },
  { value: 'hidden', icon: 'eye-off', key: 'music.displayHidden' },
];

/**
 * What each stop does to each surface — spelled out rather than described, because the axis is not
 * symmetric: a paid request never disappears, so 'hidden' leaves it at the strip.
 */
const CONSEQUENCES: Record<MusicDisplay, { bg: string; requests: string }> = {
  full: { bg: 'music.displayValVideo', requests: 'music.displayValVideo' },
  compact: { bg: 'music.displayValStrip', requests: 'music.displayValStrip' },
  hidden: { bg: 'music.displayValNone', requests: 'music.displayValStrip' },
};

/**
 * One axis, three stops: how much of the music player OBS shows. Reachable from two places — the
 * music manager (applies instantly) and the overlay settings (applies on save) — so it lives here
 * rather than being drawn twice.
 */
export function MusicDisplayChoice({
  value,
  onChange,
  className = '',
}: {
  value: MusicDisplay;
  onChange: (v: MusicDisplay) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={className}>
      <span className="label-mono text-muted">{t('music.display')}</span>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {OPTIONS.map((opt) => (
          <TogglePill
            key={opt.value}
            active={value === opt.value}
            icon={opt.icon}
            label={t(opt.key)}
            onClick={() => onChange(opt.value)}
          />
        ))}
      </div>
      <dl className="mt-2 flex flex-col gap-0.5 text-xs text-muted">
        <div className="flex gap-1.5">
          <dt>{t('music.displayBg')}:</dt>
          <dd className="text-text">{t(CONSEQUENCES[value].bg)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>{t('music.displayRequests')}:</dt>
          <dd className="text-text">{t(CONSEQUENCES[value].requests)}</dd>
        </div>
      </dl>
    </div>
  );
}
