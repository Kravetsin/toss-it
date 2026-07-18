import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  COSMETICS,
  DUST_POINTS,
  cosmeticModule,
  entranceModule,
  nickEffectClass,
  nickEffectModule,
  type CosmeticItem,
} from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useConfirm } from '@/providers/ConfirmProvider';
import { Badge, Button, Card, Drawer, IconButton } from '@/ui';
import { Icon } from '@/ui/icons';
import { DustMark } from '@/components/DustMark';
import { CardEffect } from '@/components/CardEffect';
import { buyCosmetic, equipCosmetic } from '@/lib/api/shop';
import { nickProps } from '@/lib/nick';
import { playVoicePreview } from '@/lib/voicePreview';

const DEFAULT_COLOR = '#8df0cc';
const DEFAULT_COLOR_2 = '#ff9ed8';
const NICK_COLOR_ID = 'nick-color';
const NICK_GRADIENT_ID = 'nick-gradient';
const NICK_FLOW_ID = 'nick-flow';

/** The whole viewer economy, in catalog order (biggest first) — see DUST_POINTS. Donations are
 *  absent on purpose: they fire an overlay effect but pay no dust yet, and promising a payout we
 *  don't make is worse than staying quiet. Add the row when the Donatello webhook credits it. */
const EARN_ROWS = [
  { icon: 'send', key: 'wallet.earnPost', n: DUST_POINTS.send },
  { icon: 'clock', key: 'wallet.earnWatch', n: DUST_POINTS.watchMinute },
  { icon: 'message-circle', key: 'wallet.earnChat', n: DUST_POINTS.message },
] as const;

type ShopCategory = 'nick' | 'card' | 'entrance' | 'voices';

/**
 * Demo for an entrance: a stand-in for the thing that arrives, replaying the effect on demand.
 *
 * Every other row in this drawer demos itself by just existing — a swarm drifts, a name pulses. An
 * entrance is an EVENT, so there is nothing to stand and look at, and the drawer already has a word
 * for that: the voice rows have a preview button. This is the same idea with a different sense.
 */
function EntranceDemo({ id, label }: { id: string; label: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  // Cancels an in-flight JS entrance before a replay starts a second one on the same node.
  const teardown = useRef<(() => void) | null>(null);
  const mod = entranceModule(id);
  const play = () => {
    const el = ref.current;
    if (!el || !mod) return;
    teardown.current?.();
    teardown.current = null;
    if (mod.play) {
      // JS entrance (portal): it drives the block out and renders its canvas. Host that canvas inside
      // the drawer panel — the effect's default body layer would hide behind the opaque drawer.
      const mount = el.closest('[data-drawer-panel]');
      const off = mod.play(el, mount instanceof HTMLElement ? mount : undefined);
      teardown.current = typeof off === 'function' ? off : null;
    } else {
      // CSS entrance: retrigger by removing and re-adding data-fx. Force a reflow between the two,
      // or the browser coalesces them into one style change, sees no difference, and never restarts.
      delete el.dataset.fx;
      void el.offsetWidth;
      el.dataset.fx = mod.fx;
    }
  };
  // Play once when the row appears, so the shop shows the effect rather than describing it. No unmount
  // cleanup needed for the JS path: the swarm engine drops any swarm whose node has left the DOM.
  useEffect(play, [id]);
  return (
    <div className="flex items-center gap-2">
      <div
        ref={ref}
        // relative z-[1]: a JS entrance hosts its canvas at the drawer's base (z-0), so the block must
        // sit above it to read as emerging IN FRONT of the effect.
        className="relative z-[1] rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-1.5 text-sm text-text"
      >
        {label}
      </div>
      <IconButton name="reload" size="sm" variant="ghost" label={t('shop.replay')} onClick={play} />
    </div>
  );
}

function CategoryBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-none px-3 py-1.5 label-mono transition-colors duration-200 ease-out ${
        active ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Cosmetics shop, opened from the stardust wallet. Everything is bought with stardust, never money.
 *
 * Buttons follow the app's language rather than a shop dialect: `primary` (hatched) is "make it so"
 * — the same variant as Save/Create everywhere else, so Apply and Equip stop looking like different
 * kinds of action. `accent` is reserved for the one thing only this drawer does: spend dust.
 * `ghost` undoes. Keep new rows on those three.
 */
export function CosmeticsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { me, refresh } = useMe();
  const act = useApiAction();
  const confirm = useConfirm();
  const user = me?.user;

  const colorItem = COSMETICS.find((c) => c.id === NICK_COLOR_ID)!;
  const gradientItem = COSMETICS.find((c) => c.id === NICK_GRADIENT_ID)!;
  const flowItem = COSMETICS.find((c) => c.id === NICK_FLOW_ID)!;
  const nickEffects = COSMETICS.filter((c) => c.type === 'nick_effect');
  const cardEffects = COSMETICS.filter((c) => c.type === 'card_effect');
  const entrances = COSMETICS.filter((c) => c.type === 'entrance');
  // Every specific voice is a purchase; the free path is the "auto" option in the compose form.
  const voiceItems = COSMETICS.filter((c) => c.type === 'tts_voice');
  const ownsColor = user?.ownedCosmetics.includes(NICK_COLOR_ID) ?? false;
  const ownsGradient = user?.ownedCosmetics.includes(NICK_GRADIENT_ID) ?? false;
  const ownsFlow = user?.ownedCosmetics.includes(NICK_FLOW_ID) ?? false;
  const equippedColor = user?.equipped.nickColor ?? null;
  const equippedColor2 = user?.equipped.nickColor2 ?? null;
  const equippedFlow = user?.equipped.nickFlow ?? false;
  const equippedNickEffect = user?.equipped.nickEffect ?? null;
  const equippedCardEffect = user?.equipped.cardEffect ?? null;
  const equippedEntrance = user?.equipped.entrance ?? null;
  const balance = user?.stardust ?? 0;
  const previewName = user?.displayName ?? 'nickname';

  const [category, setCategory] = useState<ShopCategory>('nick');
  const [color, setColor] = useState(equippedColor ?? DEFAULT_COLOR);
  const [color2, setColor2] = useState(equippedColor2 ?? DEFAULT_COLOR_2);
  // Whether the viewer is composing a gradient right now — a second stop can be picked and previewed
  // before Apply, so this can't be derived from the saved state alone.
  const [gradient, setGradient] = useState(!!equippedColor2);
  const [flow, setFlow] = useState(equippedFlow);
  // Reflect the saved colors when they change (e.g. after a refresh) without fighting active edits.
  useEffect(() => {
    if (equippedColor) setColor(equippedColor);
  }, [equippedColor]);
  useEffect(() => {
    if (equippedColor2) {
      setColor2(equippedColor2);
      setGradient(true);
    }
  }, [equippedColor2]);
  useEffect(() => {
    if (equippedFlow) setFlow(true);
  }, [equippedFlow]);

  const buy = async (id: string, label: string, cost: number) => {
    const ok = await confirm({
      title: t('shop.confirmTitle'),
      message: t('shop.confirmBuy', { item: label, n: cost }),
      confirmLabel: t('shop.buy'),
    });
    if (!ok) return;
    void act(() => buyCosmetic(id), { after: refresh, success: t('shop.bought') });
  };
  // The whole name colour always goes in ONE call: colour → gradient → flow is one ladder in one
  // slot (the server validates it as such), so sending the rungs apart would let an upgrade land
  // without its foundation. `next` overrides a rung that a toggle is flipping right now — React
  // state is still the old value at that point.
  const useGradient = gradient && ownsGradient;
  const useFlow = useGradient && flow && ownsFlow;
  const applyNick = (next?: { gradient?: boolean; flow?: boolean }) => {
    const g = (next?.gradient ?? gradient) && ownsGradient;
    // Flow rides on the gradient, so dropping the gradient drops it — same rule the server holds.
    const f = g && (next?.flow ?? flow) && ownsFlow;
    void act(
      () => equipCosmetic({ nickColor: color, nickColor2: g ? color2 : null, nickFlow: f }),
      { after: refresh, success: t('shop.equipped') },
    );
  };
  const applyColor = () => applyNick();
  // A rung's own button IS the action. These used to only stage local state, so "Оживить" lit up,
  // nothing was saved, and the viewer had to know to scroll back to an Apply button in the SECTION
  // ABOVE — a toggle that looks done and isn't is worse than no toggle. The colour keeps its Apply
  // because a colour input fires on every drag frame; a toggle fires once, so it can just commit.
  // Both send the composition the preview is showing, pending colour edits and all: saving a name
  // the viewer is not looking at would be its own surprise.
  const toggleGradient = () => {
    const next = !gradient;
    setGradient(next);
    applyNick({ gradient: next });
  };
  const toggleFlow = () => {
    const next = !flow;
    setFlow(next);
    applyNick({ flow: next });
  };
  // Dropping the base colour drops the upgrades with it (the server enforces the same invariant).
  const removeColor = () =>
    void act(() => equipCosmetic({ nickColor: null }), {
      after: () => {
        setColor(DEFAULT_COLOR);
        setColor2(DEFAULT_COLOR_2);
        setGradient(false);
        setFlow(false);
        return refresh();
      },
    });
  // In practice this now only fires for the two colour pickers, since the rungs commit themselves.
  // They stay in the comparison anyway: if a toggle's request fails, Apply lights back up and is the
  // way out — dropping them would leave the drawer showing a state the server never took.
  const colorDirty =
    color.toLowerCase() !== (equippedColor ?? '').toLowerCase() ||
    (useGradient ? color2.toLowerCase() : '') !== (equippedColor2 ?? '').toLowerCase() ||
    useFlow !== equippedFlow;
  // One slot per effect category; equipping another replaces it, null unequips.
  const equipEffect = (patch: {
    nickEffect?: string | null;
    cardEffect?: string | null;
    entrance?: string | null;
  }) =>
    void act(() => equipCosmetic(patch), {
      after: refresh,
      success: t('shop.equipped'),
    });

  // Glow demo uses the equipped nick color (or mint), without recoloring the demo text.
  const glowVar = { ['--nick-glow']: equippedColor || 'var(--color-accent)' } as CSSProperties;
  // Preview the name through the same helper every surface uses — no separate shop-only styling.
  const colorPreview = nickProps({
    color: ownsColor ? color : DEFAULT_COLOR,
    color2: useGradient ? color2 : null,
    flow: useFlow,
  });

  /** One purchasable effect row that DEMOS its own effect (so unowned items are previewable). */
  const effectRow = (
    e: CosmeticItem,
    equippedId: string | null,
    onEquip: (id: string | null) => void,
  ) => {
    const owned = user?.ownedCosmetics.includes(e.id) ?? false;
    const on = equippedId === e.id;
    const labels = cosmeticModule(e.id)?.labels;
    if (!labels) return null;
    const isCard = e.type === 'card_effect';
    const isNick = e.type === 'nick_effect';
    const isEntrance = e.type === 'entrance';
    return (
      <div
        key={e.id}
        // Card effects get extra bottom padding so their liquid/drift base sits in a clear strip
        // below the button instead of overlapping it.
        className={`relative min-h-[5.5rem] border-t border-border pt-3 first:border-t-0 first:pt-0 ${
          isCard ? 'pb-6' : ''
        }`}
      >
        {isCard && <CardEffect effect={e.id} />}
        <div className="relative flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            {/* The demo needs the effect's `animation` explicitly: nick modules declare it instead
                of putting it in their css (they share one element — see NickEffectModule). */}
            <span
              className={`font-medium text-text ${isNick ? nickEffectClass(e.id) : ''}`}
              style={
                isNick
                  ? ({ ...glowVar, animation: nickEffectModule(e.id)?.animation } as CSSProperties)
                  : undefined
              }
            >
              {t(labels.name)}
            </span>
            {owned ? (
              on ? (
                <Badge>{t('shop.equippedBadge')}</Badge>
              ) : null
            ) : (
              <span className="inline-flex items-center gap-1.5 label-mono text-accent">
                <DustMark size={14} />
                {e.costDust}
              </span>
            )}
          </div>
          {/* Flavor, not instruction: the row already animates the effect, so describing it would
              only restate what's on screen — and risk contradicting what the viewer sees. */}
          <p className="text-sm italic text-muted">{t(labels.desc)}</p>
          {isEntrance && <EntranceDemo id={e.id} label={previewName} />}
          <div className="flex items-center gap-2">
            {!owned ? (
              <Button
                variant="accent"
                size="sm"
                onClick={() => buy(e.id, t(labels.name), e.costDust)}
                disabled={balance < e.costDust}
              >
                {t('shop.buy')}
              </Button>
            ) : on ? (
              <Button variant="ghost" size="sm" onClick={() => onEquip(null)}>
                {t('shop.unequip')}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => onEquip(e.id)}>
                {t('shop.equip')}
              </Button>
            )}
            {!owned && balance < e.costDust && (
              <span className="label-mono text-faint">{t('shop.notEnough')}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  /** A purchasable TTS voice row: no equip slot — the voice is picked per send in the compose form. */
  const voiceRow = (e: CosmeticItem) => {
    const owned = user?.ownedCosmetics.includes(e.id) ?? false;
    const labels = cosmeticModule(e.id)?.labels;
    if (!labels) return null;
    return (
      <div key={e.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium text-text">
              {t(labels.name)}
              <IconButton
                name="play"
                size="sm"
                variant="ghost"
                label={t('shop.voicePreview')}
                onClick={() => playVoicePreview(e.id)}
              />
            </span>
            {owned ? (
              <Badge>{t('shop.owned')}</Badge>
            ) : (
              <span className="inline-flex items-center gap-1.5 label-mono text-accent">
                <DustMark size={14} />
                {e.costDust}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">{t(labels.desc)}</p>
          {!owned && (
            <div className="flex items-center gap-2">
              <Button
                variant="accent"
                size="sm"
                onClick={() => buy(e.id, t(labels.name), e.costDust)}
                disabled={balance < e.costDust}
              >
                {t('shop.buy')}
              </Button>
              {balance < e.costDust && (
                <span className="label-mono text-faint">{t('shop.notEnough')}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  /** `note`: a caveat the whole category shares — said once at the top, not per row. */
  const section = (title: string, body: ReactNode, note?: string) => (
    <Card corners>
      <h3 className="font-display">{title}</h3>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      <div className="mt-3 flex flex-col gap-3">{body}</div>
    </Card>
  );

  return createPortal(
    <Drawer open={open} onClose={onClose} title={t('shop.title')} closeLabel={t('common.close')}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">{t('shop.subtitle')}</p>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted">
            <DustMark size={15} className="text-accent" />
            <span className="tabular-nums">{balance}</span>
          </span>
        </div>

        {/* Earn explainer used to hide in a hover tooltip — keep it always visible here (no hover
            on mobile, and this is the only place the economy is spelled out). */}
        <div className="rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2">
          <span className="block text-xs font-medium text-text">{t('wallet.howTitle')}</span>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
            {EARN_ROWS.map(({ icon, key, n }) => (
              <span key={key} className="flex items-center gap-1.5 text-xs text-muted">
                <Icon name={icon} size={13} className="text-faint" />
                <span className="truncate">{t(key)}</span>
                <span className="ml-auto label-mono text-accent">+{n}</span>
              </span>
            ))}
          </div>
        </div>

        {user && !user.hasTwitch && (
          <Card className="flex flex-col gap-2 border-accent/40">
            <span className="flex items-center gap-1.5 text-sm text-text">
              <Icon name="sparkles" size={15} className="text-accent" />
              {t('link.bannerText')}
            </span>
            <a
              href={`/api/auth/link/twitch?returnTo=${encodeURIComponent(
                window.location.pathname + window.location.search,
              )}`}
              className="self-start"
            >
              <Button variant="primary" size="sm">
                {t('link.bannerCta')}
              </Button>
            </a>
          </Card>
        )}

        <div className="flex gap-1 border border-border bg-surface-2 p-1">
          <CategoryBtn
            active={category === 'nick'}
            onClick={() => setCategory('nick')}
            label={t('shop.catNick')}
          />
          <CategoryBtn
            active={category === 'card'}
            onClick={() => setCategory('card')}
            label={t('shop.catCard')}
          />
          <CategoryBtn
            active={category === 'entrance'}
            onClick={() => setCategory('entrance')}
            label={t('shop.catEntrance')}
          />
          <CategoryBtn
            active={category === 'voices'}
            onClick={() => setCategory('voices')}
            label={t('shop.catVoices')}
          />
        </div>

        {category === 'nick' &&
          section(
            t('shop.nickColor'),
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm italic text-muted">{t('shop.nickColorDesc')}</p>
                {ownsColor ? (
                  <Badge>{t('shop.owned')}</Badge>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1.5 label-mono text-accent">
                    <DustMark size={14} />
                    {colorItem.costDust}
                  </span>
                )}
              </div>
              {/* Demo: the nick exactly as the surfaces paint it (same nickProps), or a mint
                  teaser before the colour is bought. */}
              {/* self-start: a stretched flex item would be far wider than the name, and the
                  gradient ramps across the box — the preview would hide the second colour. */}
              <b
                className={`self-start text-lg ${colorPreview.className}`}
                style={colorPreview.style}
              >
                {previewName}
              </b>
              {ownsColor ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    aria-label={t('shop.nickColor')}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-border bg-surface"
                  />
                  {useGradient && (
                    <input
                      type="color"
                      value={color2}
                      onChange={(e) => setColor2(e.target.value)}
                      aria-label={t('shop.color2')}
                      className="h-10 w-14 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-border bg-surface"
                    />
                  )}
                  <Button variant="primary" size="sm" onClick={applyColor} disabled={!colorDirty}>
                    {t('shop.apply')}
                  </Button>
                  {equippedColor && (
                    <Button variant="ghost" size="sm" onClick={removeColor}>
                      {t('shop.remove')}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => buy(NICK_COLOR_ID, t('shop.nickColor'), colorItem.costDust)}
                    disabled={balance < colorItem.costDust}
                  >
                    {t('shop.buy')}
                  </Button>
                  {balance < colorItem.costDust && (
                    <span className="label-mono text-faint">{t('shop.notEnough')}</span>
                  )}
                </div>
              )}

              {/* The gradient is an upgrade of the colour above, so it lives in this section and
                  only once the base colour is owned — buying a second stop with nothing to ramp
                  from would be a dead purchase (the server drops it). */}
              {ownsColor && (
                <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-text">{t('shop.nickGradient')}</span>
                    {ownsGradient ? (
                      <Badge>{t('shop.owned')}</Badge>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1.5 label-mono text-accent">
                        <DustMark size={14} />
                        {gradientItem.costDust}
                      </span>
                    )}
                  </div>
                  <p className="text-sm italic text-muted">{t('shop.nickGradientDesc')}</p>
                  {ownsGradient ? (
                    <Button
                      variant={gradient ? 'ghost' : 'primary'}
                      size="sm"
                      className="self-start"
                      onClick={toggleGradient}
                    >
                      {t(gradient ? 'shop.gradientOff' : 'shop.gradientAdd')}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() =>
                          buy(NICK_GRADIENT_ID, t('shop.nickGradient'), gradientItem.costDust)
                        }
                        disabled={balance < gradientItem.costDust}
                      >
                        {t('shop.buy')}
                      </Button>
                      {balance < gradientItem.costDust && (
                        <span className="label-mono text-faint">{t('shop.notEnough')}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Top rung: flow needs two stops to drift between, so it only appears once the
                  gradient is actually on — otherwise there is nothing to animate. */}
              {useGradient && (
                <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-text">{t('shop.nickFlow')}</span>
                    {ownsFlow ? (
                      <Badge>{t('shop.owned')}</Badge>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1.5 label-mono text-accent">
                        <DustMark size={14} />
                        {flowItem.costDust}
                      </span>
                    )}
                  </div>
                  <p className="text-sm italic text-muted">{t('shop.nickFlowDesc')}</p>
                  {ownsFlow ? (
                    <Button
                      variant={flow ? 'ghost' : 'primary'}
                      size="sm"
                      className="self-start"
                      onClick={toggleFlow}
                    >
                      {t(flow ? 'shop.flowOff' : 'shop.flowOn')}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => buy(NICK_FLOW_ID, t('shop.nickFlow'), flowItem.costDust)}
                        disabled={balance < flowItem.costDust}
                      >
                        {t('shop.buy')}
                      </Button>
                      {balance < flowItem.costDust && (
                        <span className="label-mono text-faint">{t('shop.notEnough')}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>,
          )}

        {category === 'nick' &&
          section(
            t('shop.nickEffects'),
            nickEffects.map((e) =>
              effectRow(e, equippedNickEffect, (id) => equipEffect({ nickEffect: id })),
            ),
          )}

        {category === 'card' &&
          section(
            t('shop.cardEffects'),
            cardEffects.map((e) =>
              effectRow(e, equippedCardEffect, (id) => equipEffect({ cardEffect: id })),
            ),
          )}

        {category === 'entrance' &&
          section(
            t('shop.entrances'),
            entrances.map((e) =>
              effectRow(e, equippedEntrance, (id) => equipEffect({ entrance: id })),
            ),
            // Said once, in the only place a viewer decides to spend on this: the entrance lands on
            // the stream, and the chat pill only exists if the streamer runs that overlay. Selling
            // it without saying so would be a catch, and this product's whole pitch is no catches.
            t('shop.entrancesNote'),
          )}

        {category === 'voices' &&
          section(
            t('shop.voices'),
            <>
              <p className="text-sm text-muted">{t('shop.voicesDesc')}</p>
              {voiceItems.map(voiceRow)}
            </>,
          )}
      </div>
    </Drawer>,
    document.body,
  );
}
