import { useEffect, useState } from 'react';
import type { LivePresence } from '@tmw/shared';
import { getLivePresence } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Card, Icon } from '@/ui';

const POLL_MS = 30_000;

/** "Who's on stream now": OBS-overlay live signal + current chatters (Twitch for now). */
export function LivePresenceCard({ channelId }: { channelId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<LivePresence | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getLivePresence(channelId)
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {});
    void load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [channelId]);

  const live = data?.live ?? false;
  const viewers = data?.viewers ?? [];

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 label-mono text-text">
          <Icon name="eye" size={15} className="text-accent" />
          {t('stats.liveTitle')}
        </h3>
        <span className={`flex items-center gap-1.5 label-mono ${live ? 'text-ok' : 'text-muted'}`}>
          <span className={`size-2 rounded-full ${live ? 'animate-pulse bg-ok' : 'bg-muted'}`} />
          {live ? t('stats.live') : t('stats.offline')}
        </span>
      </div>

      {viewers.length > 0 ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl tabular-nums text-text">{viewers.length}</span>
            <span className="text-sm text-muted">{t('stats.inChat')}</span>
          </div>
          <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {viewers.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-1 py-1 text-sm text-text">
                <Icon name="twitch" size={13} className="shrink-0 text-[#9147ff]" />
                <span className="truncate">{v.name}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-4 text-center text-sm text-muted">
          {live ? t('stats.noViewers') : t('stats.offlineHint')}
        </p>
      )}
    </Card>
  );
}
