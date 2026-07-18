import { useEffect, useState, type ReactNode } from 'react';
import { CHANNEL_POINTS, type ChannelPointsStatus } from '@tmw/shared';
import {
  addChannelPointsStardust,
  addChannelPointsYoutube,
  channelPointsConnectUrl,
  disconnectChannelPoints,
  getChannelPointsStatus,
  removeChannelPointsStardust,
  removeChannelPointsYoutube,
} from '@/lib/api';
import { useI18n, type TFn } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { Slider } from '@/features/dashboard/components/settings/controls';
import { Button, Card } from '@/ui';

type RewardKind = 'stardust' | 'youtube';

/**
 * Channel-points integration. Two fully independent rewards, each its own tile with its own price:
 * stardust (points → dust + overlay effect) and a YouTube request (link into the inbox). The Twitch
 * authorization is shared — creating the FIRST reward runs OAuth; the rest reuse the stored token —
 * so a streamer can set up either, both, or neither. Disconnect revokes everything.
 */
export function ChannelPointsCard() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<ChannelPointsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [stardustCost, setStardustCost] = useState<number>(CHANNEL_POINTS.defaultCost);
  const [ytCost, setYtCost] = useState<number>(CHANNEL_POINTS.defaultCost);

  useEffect(() => {
    let cancelled = false;
    void getChannelPointsStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (p: Partial<ChannelPointsStatus>) => setStatus((s) => (s ? { ...s, ...p } : s));

  const disconnect = () =>
    void (async () => {
      setBusy(true);
      try {
        await disconnectChannelPoints();
        setStatus({ connected: false, externalName: null, hasStardust: false, hasYoutube: false });
      } finally {
        setBusy(false);
      }
    })();

  // Create a reward. Already connected → direct REST; otherwise a full-page OAuth that creates it on
  // return. Either path leaves the two rewards independent.
  const create = (kind: RewardKind, cost: number) => {
    if (!status?.connected) {
      window.location.href = channelPointsConnectUrl(window.location.pathname, kind, cost, lang);
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        if (kind === 'stardust') await addChannelPointsStardust(lang, cost);
        else await addChannelPointsYoutube(lang, cost);
        patch(kind === 'stardust' ? { hasStardust: true } : { hasYoutube: true });
      } finally {
        setBusy(false);
      }
    })();
  };
  const remove = (kind: RewardKind) =>
    void (async () => {
      setBusy(true);
      try {
        if (kind === 'stardust') await removeChannelPointsStardust();
        else await removeChannelPointsYoutube();
        patch(kind === 'stardust' ? { hasStardust: false } : { hasYoutube: false });
      } finally {
        setBusy(false);
      }
    })();

  const loading = status === null;
  const stardustDust = CHANNEL_POINTS.dustFor(stardustCost);

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="flex items-center gap-2 font-display">
          <Icon name="sparkles" size={16} className="text-accent" />
          {t('dash.channelPoints')}
        </h3>
        <p className="mt-1 text-sm text-muted">{t('dash.channelPointsDesc')}</p>
      </div>

      {status?.connected && (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-surface-2/60 px-3 py-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-ok">
            <Icon name="check" size={14} className="shrink-0" />
            <span className="truncate">
              {t('dash.channelPointsConnectedAs', { name: status.externalName ?? '' })}
            </span>
          </span>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>
            {t('dash.channelPointsDisconnect')}
          </Button>
        </div>
      )}

      <RewardTile
        icon="sparkles"
        title={t('dash.channelPointsStardustTitle')}
        description={t('dash.channelPointsStardustDesc')}
        badge={status?.hasStardust ? <ActiveBadge t={t} /> : undefined}
      >
        {status?.hasStardust ? (
          <RemoveRow t={t} busy={busy} onRemove={() => remove('stardust')} />
        ) : (
          <>
            <Slider
              icon="star"
              label={t('dash.channelPointsCost', { cost: stardustCost, dust: stardustDust })}
              min={CHANNEL_POINTS.minCost}
              max={CHANNEL_POINTS.maxCost}
              step={CHANNEL_POINTS.costStep}
              value={stardustCost}
              onChange={setStardustCost}
            />
            <Button
              variant="primary"
              disabled={busy || loading}
              onClick={() => create('stardust', stardustCost)}
            >
              {t('dash.channelPointsRewardCreate')}
            </Button>
          </>
        )}
      </RewardTile>

      <RewardTile
        icon="youtube"
        title={t('dash.channelPointsYoutubeTitle')}
        description={t('dash.channelPointsYoutubeNote')}
        badge={status?.hasYoutube ? <ActiveBadge t={t} /> : undefined}
      >
        {status?.hasYoutube ? (
          <RemoveRow t={t} busy={busy} onRemove={() => remove('youtube')} />
        ) : (
          <>
            <Slider
              icon="youtube"
              label={t('dash.channelPointsYoutubeCost', { cost: ytCost })}
              min={CHANNEL_POINTS.minCost}
              max={CHANNEL_POINTS.maxCost}
              step={CHANNEL_POINTS.costStep}
              value={ytCost}
              onChange={setYtCost}
            />
            <Button
              variant="primary"
              disabled={busy || loading}
              onClick={() => create('youtube', ytCost)}
            >
              {t('dash.channelPointsRewardCreate')}
            </Button>
          </>
        )}
      </RewardTile>

      {/* Explain the one-time Twitch authorization that the first reward triggers. */}
      {!loading && !status?.connected && (
        <p className="text-xs text-faint">{t('dash.channelPointsAuthNote')}</p>
      )}
    </Card>
  );
}

/** One reward as a self-contained tile: icon badge + title (+ optional status badge) + description,
 *  with its controls (cost slider / create / remove) as a footer. */
function RewardTile({
  icon,
  title,
  description,
  badge,
  children,
}: {
  icon: IconName;
  title: string;
  description: string;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-surface-2/40 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
          <Icon name={icon} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <b className="text-sm text-text">{title}</b>
            {badge}
          </div>
          <p className="mt-0.5 text-xs leading-snug text-muted">{description}</p>
          {children && <div className="mt-3 flex flex-col gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/** Small "active" pill for a live reward. */
function ActiveBadge({ t }: { t: TFn }) {
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-ok-soft px-2 py-0.5 text-[11px] text-ok">
      <Icon name="check" size={11} />
      {t('dash.channelPointsRewardActive')}
    </span>
  );
}

/** Right-aligned remove action for an active reward. */
function RemoveRow({ t, busy, onRemove }: { t: TFn; busy: boolean; onRemove: () => void }) {
  return (
    <div className="flex justify-end">
      <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
        {t('dash.channelPointsRewardRemove')}
      </Button>
    </div>
  );
}
