import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CHANNEL_POINTS, CHAT_TEXT_MAX_LEN, type ChannelPointsStatus } from '@tmw/shared';
import {
  addChannelPointsReward,
  channelPointsConnectUrl,
  disconnectChannelPoints,
  getChannelPointsStatus,
  removeChannelPointsReward,
  type RewardKind,
} from '@/lib/api';
import { useI18n, type TFn } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Card, Slider } from '@/ui';
import { DustMark } from '@/components/DustMark';

/** Which status flag a reward kind owns, as a patch — one place to add the next kind. */
function hasFlag(kind: RewardKind, value: boolean): Partial<ChannelPointsStatus> {
  if (kind === 'stardust') return { hasStardust: value };
  if (kind === 'youtube') return { hasYoutube: value };
  return { hasTts: value };
}

/** Split a translated string on the ⭐ marker and swap it for our own stardust glyph (DustMark) —
 *  the dictionary keeps '⭐' as a language-agnostic placeholder, never rendered as the raw emoji. */
function withDustIcon(text: string): ReactNode {
  const parts = text.split('⭐');
  if (parts.length === 1) return text;
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) {
      out.push(
        <DustMark
          key={`dust-${i}`}
          size={12}
          className="inline-block shrink-0 align-[-1px] text-accent"
        />,
      );
    }
    out.push(part);
  });
  return out;
}

/**
 * Channel-points integration. Fully independent rewards, each its own tile with its own price:
 * stardust (points → dust + overlay effect), a YouTube request, and a line on stream. The Twitch
 * authorization is shared — creating the FIRST reward runs OAuth; the rest reuse the stored token —
 * so a streamer can set up any of them, or none. Disconnect revokes everything.
 */
export function ChannelPointsCard() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<ChannelPointsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [stardustCost, setStardustCost] = useState<number>(CHANNEL_POINTS.defaultCost);
  const [ytCost, setYtCost] = useState<number>(CHANNEL_POINTS.defaultCost);
  const [ttsCost, setTtsCost] = useState<number>(CHANNEL_POINTS.defaultCost);

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
        setStatus({
          connected: false,
          externalName: null,
          hasStardust: false,
          hasYoutube: false,
          hasTts: false,
        });
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
        await addChannelPointsReward(kind, lang, cost);
        patch(hasFlag(kind, true));
      } finally {
        setBusy(false);
      }
    })();
  };
  const remove = (kind: RewardKind) =>
    void (async () => {
      setBusy(true);
      try {
        await removeChannelPointsReward(kind);
        patch(hasFlag(kind, false));
      } finally {
        setBusy(false);
      }
    })();

  const loading = status === null;
  const stardustDust = CHANNEL_POINTS.dustFor(stardustCost);
  const stardustOwner = CHANNEL_POINTS.ownerDustFor(stardustCost);
  // The two halves of a request are priced apart (the viewer spent the points, the streamer didn't),
  // so the slider shows both — otherwise the streamer's own share is a surprise.
  const ytDust = CHANNEL_POINTS.dustForRequest(ytCost);
  const ytMirror = CHANNEL_POINTS.dustForRequest(ytCost, 'owner');
  const ttsDust = CHANNEL_POINTS.dustForRequest(ttsCost);
  const ttsMirror = CHANNEL_POINTS.dustForRequest(ttsCost, 'owner');

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
              label={t('dash.channelPointsCost', { cost: stardustCost })}
              min={CHANNEL_POINTS.minCost}
              max={CHANNEL_POINTS.maxCost}
              step={CHANNEL_POINTS.costStep}
              value={stardustCost}
              onChange={setStardustCost}
            />
            <PayoutBox viewer={stardustDust} owner={stardustOwner} t={t} />
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
        description={withDustIcon(t('dash.channelPointsYoutubeNote'))}
        badge={status?.hasYoutube ? <ActiveBadge t={t} /> : undefined}
        note={<OverlayNote t={t} />}
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
            <PayoutBox viewer={ytDust} owner={ytMirror} t={t} />
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

      <RewardTile
        icon="volume-2"
        title={t('dash.channelPointsTtsTitle')}
        description={withDustIcon(t('dash.channelPointsTtsNote', { n: CHAT_TEXT_MAX_LEN }))}
        badge={status?.hasTts ? <ActiveBadge t={t} /> : undefined}
        note={<OverlayNote t={t} />}
      >
        {status?.hasTts ? (
          <RemoveRow t={t} busy={busy} onRemove={() => remove('tts')} />
        ) : (
          <>
            <Slider
              icon="volume-2"
              label={t('dash.channelPointsTtsCost', { cost: ttsCost })}
              min={CHANNEL_POINTS.minCost}
              max={CHANNEL_POINTS.maxCost}
              step={CHANNEL_POINTS.costStep}
              value={ttsCost}
              onChange={setTtsCost}
            />
            <PayoutBox viewer={ttsDust} owner={ttsMirror} t={t} />
            <Button
              variant="primary"
              disabled={busy || loading}
              onClick={() => create('tts', ttsCost)}
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
  note,
  children,
}: {
  icon: IconName;
  title: string;
  description: ReactNode;
  badge?: ReactNode;
  /** Optional requirement/hint under the description (e.g. "needs the media overlay"). */
  note?: ReactNode;
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
          {note}
          {children && <div className="mt-3 flex flex-col gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * What the current slider position pays out, as a fixed two-column plate. The numbers used to ride
 * inside the slider's own label, where every drag reflowed the line and the text jumped; here the
 * layout is fixed and only the digits change (tabular figures, so even those hold their width).
 */
function PayoutBox({ viewer, owner, t }: { viewer: number; owner: number; t: TFn }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-sm)] border border-border bg-border">
      <PayoutCell label={t('dash.payoutViewer')} dust={viewer} />
      <PayoutCell label={t('dash.payoutOwner')} dust={owner} />
    </div>
  );
}

function PayoutCell({ label, dust }: { label: string; dust: number }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface-2/60 px-3 py-2">
      <span className="label-mono text-[11px] text-faint">{label}</span>
      <span className="flex items-center gap-1.5 text-sm text-text tabular-nums">
        <DustMark size={12} className="shrink-0 text-accent" />
        {dust}
      </span>
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

/** Playback needs a connected media overlay — remind the streamer and link to the overlay links. */
function OverlayNote({ t }: { t: TFn }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-faint">
      <Icon name="monitor" size={13} className="mt-px shrink-0" />
      <span>
        {t('dash.channelPointsOverlayNote')}{' '}
        <Link
          to="/dashboard/settings/overlay"
          className="text-accent underline-offset-2 outline-none hover:underline focus-visible:underline"
        >
          {t('dash.channelPointsOverlaySetup')}
        </Link>
      </span>
    </p>
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
