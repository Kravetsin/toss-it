import { useEffect, useState } from 'react';
import { CHANNEL_POINTS, type ChannelPointsStatus } from '@tmw/shared';
import {
  addChannelPointsYoutube,
  channelPointsConnectUrl,
  disconnectChannelPoints,
  getChannelPointsStatus,
  removeChannelPointsYoutube,
} from '@/lib/api';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Slider } from '@/features/dashboard/components/settings/controls';
import { Button, Card, Switch } from '@/ui';

/**
 * Channel-points → stardust opt-in. Our app creates and owns a Twitch reward on the streamer's
 * channel (streamer authorizes channel:manage:redemptions once). On redemption we credit fixed dust
 * (cost / 2) to the viewer and fire the donation overlay effect. Connect is a full-page OAuth
 * redirect; disconnect deletes the reward.
 */
export function ChannelPointsCard() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<ChannelPointsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [cost, setCost] = useState<number>(CHANNEL_POINTS.defaultCost);

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

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectChannelPoints();
      setStatus({ connected: false, externalName: null, hasYoutube: false });
    } finally {
      setBusy(false);
    }
  };

  const toggleYoutube = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) await addChannelPointsYoutube(lang);
      else await removeChannelPointsYoutube();
      setStatus((s) => (s ? { ...s, hasYoutube: next } : s));
    } finally {
      setBusy(false);
    }
  };

  const dust = CHANNEL_POINTS.dustFor(cost);

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-display">
        <Icon name="sparkles" size={16} className="text-accent" />
        {t('dash.channelPoints')}
      </h3>
      <p className="text-sm text-muted">{t('dash.channelPointsDesc', { cost, dust })}</p>

      {status?.connected ? (
        <div className="mt-1 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm text-ok">
              <Icon name="check" size={14} />
              {t('dash.channelPointsConnectedAs', { name: status.externalName ?? '' })}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void disconnect()} disabled={busy}>
              {t('dash.channelPointsDisconnect')}
            </Button>
          </div>
          {/* Optional add-on reward: viewers spend points to put a YouTube link in the предложка. */}
          <Switch
            icon="youtube"
            label={t('dash.channelPointsYoutube')}
            description={t('dash.channelPointsYoutubeNote')}
            checked={status.hasYoutube}
            onChange={(v) => void toggleYoutube(v)}
          />
        </div>
      ) : (
        <>
          <Slider
            icon="star"
            label={t('dash.channelPointsCost', { cost, dust })}
            min={CHANNEL_POINTS.minCost}
            max={CHANNEL_POINTS.maxCost}
            step={CHANNEL_POINTS.costStep}
            value={cost}
            onChange={setCost}
          />
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              window.location.href = channelPointsConnectUrl(window.location.pathname, cost, lang);
            }}
          >
            {t('dash.channelPointsConnect')}
          </Button>
        </>
      )}
    </Card>
  );
}
