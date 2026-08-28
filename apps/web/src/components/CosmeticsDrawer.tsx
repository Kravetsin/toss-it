import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  COSMETICS,
  DUST_POINTS,
  cosmeticModule,
  entranceModule,
  frameEffectClass,
  frameTintVar,
  nickEffectClass,
  nickEffectModule,
  isBreadthMetric,
  breadthProgress,
  type BreadthTotals,
  type CosmeticEarn,
  type CosmeticItem,
  type CosmeticMetric,
  type CosmeticType,
} from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useConfirm } from '@/providers/ConfirmProvider';
import { Badge, Button, Card, Drawer, IconButton, Tooltip } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';
import { DustMark } from '@/components/DustMark';
import { NewDot, NewDotGroup } from '@/components/NewDot';
import { SealMark } from '@/components/UserMarks';
import { CardEffect } from '@/components/CardEffect';
import { buyCosmetic, equipCosmetic } from '@/lib/api/shop';
import { nickProps } from '@/lib/nick';
import { playVoicePreview } from '@/lib/voicePreview';

const DEFAULT_COLOR = '#8df0cc';
const DEFAULT_COLOR_2 = '#ff9ed8';
const NICK_COLOR_ID = 'nick-color';
const NICK_GRADIENT_ID = 'nick-gradient';
const NICK_FLOW_ID = 'nick-flow';
// Entrance colour: the id is historical (it began as a portal-only upgrade) but it now tints ANY
// equipped entrance — kept unchanged so existing buyers keep what they own. See entrance-portal-color.
const PORTAL_COLOR_ID = 'entrance-portal-color';
// A colourable card effect (butterflies, eyes) carries its OWN colour upgrade (CardEffectModule
// .colorUpgrade), bought separately and rendered INSIDE that effect's own card — see effectRow.
const DEFAULT_CARD_COLOR = '#ff2e9a';
/** The runners' own mint: a frame picker should open on the colour the frame is showing right now. */
const DEFAULT_FRAME_COLOR = '#8df0cc';
// The second picker of a dual-colour effect starts on a DIFFERENT hue: two swatches opening on the
// same colour read as one control duplicated by mistake.
const DEFAULT_CARD_COLOR2 = '#5ac8ff';
const DEFAULT_PORTAL_COLOR = '#8df0cc';

/** The whole viewer economy, in catalog order (biggest first) — see DUST_POINTS. Donations are
 *  absent on purpose: they fire an overlay effect but pay no dust yet, and promising a payout we
 *  don't make is worse than staying quiet. Add the row when the Donatello webhook credits it. */
const EARN_ROWS = [
  { icon: 'send', key: 'wallet.earnPost', n: DUST_POINTS.send },
  { icon: 'clock', key: 'wallet.earnWatch', n: DUST_POINTS.watchMinute },
  { icon: 'message-circle', key: 'wallet.earnChat', n: DUST_POINTS.message },
] as const;

type ShopCategory = 'nick' | 'card' | 'frame' | 'seal' | 'entrance' | 'voices';

/** Per-metric presentation for earned items. A table rather than a branch per metric, so the next
 *  axis is one line here. `unit` divides the raw count for display (watch time is stored in minutes,
 *  shown in hours). */
type EarnMeta = {
  icon: IconName;
  unit: number;
  lockedKey: string;
  /** Breadth metrics only: how the per-channel bar reads under a rung, and the unit it is shown in. */
  barKey?: string;
  barUnit?: number;
};
const EARN_META: Record<CosmeticMetric, EarnMeta> = {
  messages: { icon: 'message-circle', unit: 1, lockedKey: 'shop.earnLocked' },
  watchMinutes: { icon: 'clock', unit: 60, lockedKey: 'shop.earnLockedWatch' },
  submissions: { icon: 'send', unit: 1, lockedKey: 'shop.earnLockedSends' },
  dustEarned: { icon: 'sparkles', unit: 1, lockedKey: 'shop.earnLockedDust' },
  dustSpent: { icon: 'sparkles', unit: 1, lockedKey: 'shop.earnLockedSpent' },
  // The breadth axis counts CHANNELS, so the unit is always 1 and the icon is a stream, whatever the
  // per-channel bar happens to be. `barKey` is what that bar reads as under the rung; the bar's own
  // unit lives in `barUnit` (minutes shown as hours, as everywhere else).
  channelsMessaged: {
    icon: 'monitor',
    unit: 1,
    lockedKey: 'shop.earnLockedChannels',
    barKey: 'shop.barMessages',
    barUnit: 1,
  },
  channelsSent: {
    icon: 'monitor',
    unit: 1,
    lockedKey: 'shop.earnLockedChannels',
    barKey: 'shop.barSends',
    barUnit: 1,
  },
  channelsWatched: {
    icon: 'monitor',
    unit: 1,
    lockedKey: 'shop.earnLockedChannels',
    barKey: 'shop.barHours',
    barUnit: 60,
  },
  channelsModerated: { icon: 'monitor', unit: 1, lockedKey: 'shop.earnLockedChannels' },
};

/** The empty payload an anonymous view falls back to, so the progress code never branches on null. */
const NO_BREADTH: BreadthTotals = { messages: [], submissions: [], watchMinutes: [], moderated: 0 };

/** Which tab an item lands in. Exhaustive by type, so a new cosmetic type can't quietly miss its
 *  "new" dot — adding one to the registry fails typecheck until it's placed here. */
const CATEGORY_OF: Record<CosmeticType, ShopCategory> = {
  nick_color: 'nick',
  nick_effect: 'nick',
  card_effect: 'card',
  frame: 'frame',
  seal: 'seal',
  entrance: 'entrance',
  tts_voice: 'voices',
};
const CATEGORY_IDS: Record<ShopCategory, string[]> = {
  nick: [],
  card: [],
  frame: [],
  seal: [],
  entrance: [],
  voices: [],
};
for (const c of COSMETICS) CATEGORY_IDS[CATEGORY_OF[c.type]].push(c.id);

/** Card effects split into themed shop sub-tabs: only the active group's previews mount at once, so a
 *  growing catalog doesn't run a dozen live particle layers and drop the shop's FPS. A card effect not
 *  listed here still shows (absorbed into the last group), so nothing hides silently. */
const CARD_GROUPS = [
  {
    key: 'cosmic',
    ids: ['card-stardust', 'card-constellation', 'card-levitation', 'card-claws', 'card-aurora'],
  },
  {
    key: 'elements',
    ids: ['card-rain', 'card-snow', 'card-lightning', 'card-embers', 'card-ripples'],
  },
  { key: 'nature', ids: ['card-sakura', 'card-bubbles', 'card-butterflies', 'card-jelly'] },
  {
    key: 'arcane',
    ids: ['card-wisp', 'card-runes', 'card-web', 'card-eyes', 'card-candles', 'card-hextech'],
  },
  {
    key: 'pop',
    ids: [
      'card-blade-duel',
      'card-code-rain',
      'card-well',
      'card-portals',
      'card-spellclash',
      'card-runner',
    ],
  },
] as const;
type CardGroupKey = (typeof CARD_GROUPS)[number]['key'];
const GROUP_LABEL: Record<CardGroupKey, string> = {
  cosmic: 'shop.groupCosmic',
  elements: 'shop.groupElements',
  nature: 'shop.groupNature',
  arcane: 'shop.groupArcane',
  pop: 'shop.groupPop',
};

/** Demo for a frame: a stand-in message card wearing the frame, so the border effect shows on a
 *  realistic small card (the frame lives on the border, not a swarm — nothing to look at otherwise).
 *  Roomier than a chat pill on purpose: an ornament frame draws a band along each edge, and on a
 *  tighter box the top and bottom bands nearly meet and read as clutter rather than a border. */
function FrameDemo({ id, label, color }: { id: string; label: string; color?: string }) {
  const cls = frameEffectClass(id);
  const tint = frameTintVar(color);
  return (
    <div className="flex justify-start">
      <div
        className={`relative inline-flex items-center gap-1.5 rounded-[10px] border border-[rgba(141,240,204,0.5)] bg-[#0e1413] px-4 py-2.5 ${cls}`}
        style={tint ? ({ '--frame-rgb': tint } as CSSProperties) : undefined}
      >
        <span className="text-sm font-medium text-accent">{label}</span>
        <span className="text-sm text-muted">gg</span>
      </div>
    </div>
  );
}

/**
 * Demo for an entrance: a stand-in for the thing that arrives, replaying the effect on demand.
 *
 * Every other row in this drawer demos itself by just existing — a swarm drifts, a name pulses. An
 * entrance is an EVENT, so there is nothing to stand and look at, and the drawer already has a word
 * for that: the voice rows have a preview button. This is the same idea with a different sense.
 */
function EntranceDemo({ id, label, color }: { id: string; label: string; color?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  // The effect's canvas is hosted here, so this row must be its OWN stacking context.
  const rowRef = useRef<HTMLDivElement>(null);
  // Cancels an in-flight JS entrance before a replay starts a second one on the same node.
  const teardown = useRef<(() => void) | null>(null);
  const mod = entranceModule(id);
  const play = () => {
    const el = ref.current;
    if (!el || !mod) return;
    teardown.current?.();
    teardown.current = null;
    if (mod.play) {
      // JS entrance (portal): it drives the block out and renders its canvas. On the transparent
      // overlays the canvas goes behind everything, but the shop is opaque — so host it in THIS row,
      // which is an isolated stacking context (`isolate`) with the block lifted above it (z-[1]). That
      // guarantees the block sits in front of the portal regardless of the drawer's nesting.
      const off = mod.play(el, rowRef.current ?? undefined, color);
      teardown.current = typeof off === 'function' ? off : null;
    } else {
      // CSS entrance: retrigger by removing and re-adding data-fx. Force a reflow between the two,
      // or the browser coalesces them into one style change, sees no difference, and never restarts.
      // The tint goes on as a custom property, the same way applyEntrance hands it to a CSS entrance
      // on the overlays — a colourable one paints from it, and glitch (pure geometry) ignores it.
      if (color) el.style.setProperty('--cos-fx-tint', color);
      else el.style.removeProperty('--cos-fx-tint');
      delete el.dataset.fx;
      void el.offsetWidth;
      el.dataset.fx = mod.fx;
    }
  };
  // Play once when the row appears (and replay when the tint changes) so the shop shows the effect
  // rather than describing it. No unmount cleanup for the JS path: the engine drops orphaned effects.
  useEffect(play, [id, color]);
  return (
    <div ref={rowRef} className="relative isolate flex items-center gap-2">
      <div
        ref={ref}
        // relative z-[1]: the JS entrance hosts its canvas in this isolated row at z-0, so the block
        // must sit above it to read as emerging IN FRONT of the effect, not behind the sparks.
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
  category,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  category: ShopCategory;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // min-w-fit + nowrap: flex-1 alone gives every tab a 0 basis, so once the labels stop fitting
      // they get squeezed narrower than their own text and it spills out of the tab. Clamped to the
      // label instead, the strip overflows and scrolls (see the container) rather than clipping.
      className={`flex min-w-fit flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-none px-3 py-1.5 label-mono transition-colors duration-200 ease-out ${
        active ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
      }`}
    >
      {label}
      {/* Not while the tab is open: on an active tab the mint dot lands on the mint fill and the
          rows below carry their own marks anyway. */}
      {!active && <NewDotGroup ids={CATEGORY_IDS[category]} />}
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

  // An admin may equip the whole catalog without buying or grinding for it — the only way to judge a
  // cosmetic is to wear it on real surfaces (see /api/cosmetics/equip, which enforces the same rule).
  // Expressed as owning everything and having limitless activity, so no row below needs a branch.
  const admin = user?.isAdmin ?? false;
  /**
   * What the shop is allowed to list. A `draft` item has neither a price nor a milestone (see
   * CosmeticItem.draft), so its row would offer a purchase the server refuses — admins still see it,
   * because previewing an unreleased cosmetic on real surfaces is exactly what the bypass is for.
   */
  const shopItems = COSMETICS.filter((c) => admin || !c.draft);

  const colorItem = COSMETICS.find((c) => c.id === NICK_COLOR_ID)!;
  const gradientItem = COSMETICS.find((c) => c.id === NICK_GRADIENT_ID)!;
  const flowItem = COSMETICS.find((c) => c.id === NICK_FLOW_ID)!;
  const nickEffects = shopItems.filter((c) => c.type === 'nick_effect');
  // Exclude upgrades (the colour picker) — like `entrances` below. An upgrade renders nothing and is
  // never equipped as an effect; left in, it would leak into the last group as an empty effect row.
  const cardEffects = shopItems.filter((c) => c.type === 'card_effect' && !c.upgrade);
  // Runtime groups with their effects; any card effect not mapped above is absorbed into the last
  // group so a new effect never vanishes from the shop just because it wasn't tagged.
  const cardGroups = (() => {
    const known = new Set<string>(CARD_GROUPS.flatMap((g) => g.ids as readonly string[]));
    const groups = CARD_GROUPS.map((g) => ({
      key: g.key,
      effects: cardEffects.filter((e) => (g.ids as readonly string[]).includes(e.id)),
    }));
    const extra = cardEffects.filter((e) => !known.has(e.id));
    if (extra.length) groups[groups.length - 1]!.effects.push(...extra);
    return groups.filter((g) => g.effects.length > 0);
  })();
  const frames = shopItems.filter((c) => c.type === 'frame' && !c.upgrade);
  // `upgrade` items (the per-seal colours) aren't equippable seals — they render inside their own
  // seal's row, so they must not form a ladder of their own here.
  const seals = shopItems.filter((c) => c.type === 'seal' && !c.upgrade);
  // Rungs of one artifact collapse into a single row (see CosmeticItem.ladder): four full-width
  // blocks per seal would turn this tab into a scroll wall as families are added.
  const sealLadders: CosmeticItem[][] = [];
  for (const s of seals) {
    const key = s.ladder ?? s.id;
    const open = sealLadders.find((g) => (g[0]?.ladder ?? g[0]?.id) === key);
    if (open) open.push(s);
    else sealLadders.push([s]);
  }
  // `upgrade` items (the portal colour) aren't equippable entrances — they're a rung, rendered below.
  const entrances = shopItems.filter((c) => c.type === 'entrance' && !c.upgrade);
  const portalColorItem = COSMETICS.find((c) => c.id === PORTAL_COLOR_ID)!;
  // Every specific voice is a purchase; the free path is the "auto" option in the compose form.
  const voiceItems = shopItems.filter((c) => c.type === 'tts_voice');
  const ownsItem = (id: string) => admin || (user?.ownedCosmetics.includes(id) ?? false);
  const ownsColor = ownsItem(NICK_COLOR_ID);
  const ownsGradient = ownsItem(NICK_GRADIENT_ID);
  const ownsFlow = ownsItem(NICK_FLOW_ID);
  const equippedColor = user?.equipped.nickColor ?? null;
  const equippedColor2 = user?.equipped.nickColor2 ?? null;
  const equippedFlow = user?.equipped.nickFlow ?? false;
  const equippedNickEffect = user?.equipped.nickEffect ?? null;
  const equippedCardEffect = user?.equipped.cardEffect ?? null;
  // Per-effect saved colours (butterflies, eyes) — the picker inside each effect card reads/writes here.
  const equippedCardEffectColors = user?.equipped.cardEffectColors ?? {};
  const equippedCardEffectColors2 = user?.equipped.cardEffectColors2 ?? {};
  const equippedFrameColors = user?.equipped.frameColors ?? {};
  const equippedFrame = user?.equipped.frame ?? null;
  const equippedSeal = user?.equipped.seal ?? null;
  // Per-seal saved colours (butterfly, eye) — the picker inside each seal's row reads/writes here.
  const equippedSealColors = user?.equipped.sealColors ?? {};
  // Account-wide activity — earned cosmetics (frames, seals) unlock at a threshold instead of a price.
  const earnTotals = {
    messages: admin ? Infinity : (user?.messagesTotal ?? 0),
    watchMinutes: admin ? Infinity : (user?.watchMinutesTotal ?? 0),
    submissions: admin ? Infinity : (user?.submissionsTotal ?? 0),
    dustEarned: admin ? Infinity : (user?.dustEarnedTotal ?? 0),
    dustSpent: admin ? Infinity : (user?.dustSpentTotal ?? 0),
  };
  /**
   * How far along ONE milestone the viewer is. A breadth metric answers in CHANNELS — how many clear
   * that rung's own bar — through the shared helper the server's gate also uses, so the number here
   * and the verdict there can never disagree.
   */
  const earnHave = (earn: CosmeticEarn) =>
    isBreadthMetric(earn.metric)
      ? admin
        ? Infinity
        : breadthProgress(earn, user?.breadth ?? NO_BREADTH)
      : earnTotals[earn.metric as keyof typeof earnTotals];
  const equippedEntrance = user?.equipped.entrance ?? null;
  const ownsPortalColor = ownsItem(PORTAL_COLOR_ID);
  const equippedEntranceColor = user?.equipped.entranceColor ?? null;
  const balance = user?.stardust ?? 0;
  const previewName = user?.displayName ?? 'nickname';

  const [category, setCategory] = useState<ShopCategory>('nick');
  const [cardGroup, setCardGroup] = useState<CardGroupKey>('cosmic');
  const [color, setColor] = useState(equippedColor ?? DEFAULT_COLOR);
  const [color2, setColor2] = useState(equippedColor2 ?? DEFAULT_COLOR_2);
  // Whether the viewer is composing a gradient right now — a second stop can be picked and previewed
  // before Apply, so this can't be derived from the saved state alone.
  const [gradient, setGradient] = useState(!!equippedColor2);
  const [flow, setFlow] = useState(equippedFlow);
  const [portalColor, setPortalColor] = useState(equippedEntranceColor ?? DEFAULT_PORTAL_COLOR);
  useEffect(() => {
    if (equippedEntranceColor) setPortalColor(equippedEntranceColor);
  }, [equippedEntranceColor]);
  // Draft colours being picked, keyed by effect id (butterflies, eyes). Seeded lazily from the saved
  // colour on first edit; unset entries fall back to the saved colour (or the default) in effectRow.
  const [cardColorDraft, setCardColorDraft] = useState<Record<string, string>>({});
  // Second picker of a dual-colour effect (the duel's blades, the portal pair). Its own draft map, so
  // dragging one picker never republishes the other's colour.
  const [cardColor2Draft, setCardColor2Draft] = useState<Record<string, string>>({});
  // Same, keyed by seal id (butterfly, eye) — the picker inside each seal's row.
  const [sealColorDraft, setSealColorDraft] = useState<Record<string, string>>({});
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
    frame?: string | null;
    seal?: string | null;
    entrance?: string | null;
  }) =>
    void act(() => equipCosmetic(patch), {
      after: refresh,
      success: t('shop.equipped'),
    });
  // Portal colour rung: a free #rrggbb tint saved to the entranceColor slot. Fires on every colour
  // drag like the nick pickers, so it keeps an Apply button rather than committing on change.
  const applyPortalColor = () =>
    void act(() => equipCosmetic({ entranceColor: portalColor }), {
      after: refresh,
      success: t('shop.equipped'),
    });
  const removePortalColor = () =>
    void act(() => equipCosmetic({ entranceColor: null }), { after: refresh });
  const portalColorDirty =
    portalColor.toLowerCase() !== (equippedEntranceColor ?? '').toLowerCase();
  // Per-effect card colour: set/clear the colour for ONE effect id (the picker lives in its card).
  //
  // BOTH SIDES OF A DUAL EFFECT GO IN ONE REQUEST. /equip is a read-modify-write of the whole equipped
  // blob, so two concurrent calls each start from the state before the other and the second write
  // silently drops the first one's colour. Firing one call per picker looked fine and lost a colour
  // every time both were dirty — which is every first use, since both pickers start off their defaults.
  const applyColorsFor = (type: CosmeticType, id: string, hex?: string, hex2?: string) =>
    void act(
      () =>
        equipCosmetic(
          type === 'frame'
            ? hex !== undefined
              ? { frameColors: { [id]: hex } }
              : {}
            : {
                ...(hex !== undefined ? { cardEffectColors: { [id]: hex } } : {}),
                ...(hex2 !== undefined ? { cardEffectColors2: { [id]: hex2 } } : {}),
              },
        ),
      { after: refresh, success: t('shop.equipped') },
    );
  const removeColorFor = (type: CosmeticType, id: string) =>
    void act(
      () =>
        equipCosmetic(
          type === 'frame'
            ? { frameColors: { [id]: null } }
            : { cardEffectColors: { [id]: null }, cardEffectColors2: { [id]: null } },
        ),
      {
        after: refresh,
      },
    );
  // Per-seal colour. Written for EVERY rung of the ladder at once, not just the one whose row hosts
  // the picker: the tint is stored per seal id, so a family with two rungs would otherwise keep two
  // separate colours and the one you actually wear would come out untinted.
  const sealColorPatch = (ids: string[], hex: string | null) =>
    Object.fromEntries(ids.map((id) => [id, hex]));
  const applySealColorFor = (ids: string[], hex: string) =>
    void act(() => equipCosmetic({ sealColors: sealColorPatch(ids, hex) }), {
      after: refresh,
      success: t('shop.equipped'),
    });
  const removeSealColorFor = (ids: string[]) =>
    void act(() => equipCosmetic({ sealColors: sealColorPatch(ids, null) }), { after: refresh });

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
    // Earned items (frames) count as "owned" once the milestone is met — OR if they were bought
    // back when they had a price. Same rule as the server's unlocked(); see its note.
    const earn = e.earn;
    const earnMeta = earn ? EARN_META[earn.metric] : null;
    const have = earn ? earnHave(earn) : 0;
    const earnUnit = earnMeta?.unit ?? 1;
    const owned = ownsItem(e.id) || (earn ? have >= earn.count : false);
    const on = equippedId === e.id;
    const mod = cosmeticModule(e.id);
    const labels = mod?.labels;
    if (!labels) return null;
    const isCard = e.type === 'card_effect';
    const isNick = e.type === 'nick_effect';
    const isEntrance = e.type === 'entrance';
    const isFrame = e.type === 'frame';
    // Card effects and frames both carry their own colour upgrade, whose buy/picker renders INSIDE
    // this row. The seal ladders have their own row builder — same idea, different layout.
    const colorUp =
      mod?.type === 'card_effect' || mod?.type === 'frame' ? mod.colorUpgrade : undefined;
    const colorMod = colorUp ? cosmeticModule(colorUp) : undefined;
    const colorItem = colorUp ? COSMETICS.find((c) => c.id === colorUp) : undefined;
    // An upgrade is either bought (the card effects) or EARNED on a milestone of its own (the runner
    // frames, whose colour is the next rung of the same chat ladder). Same block either way — only
    // what stands in for the price, and what unlocks the picker, differ.
    const colorEarn = colorItem?.earn;
    const colorEarnMeta = colorEarn ? EARN_META[colorEarn.metric] : null;
    const colorHave = colorEarn ? earnHave(colorEarn) : 0;
    const colorUnit = colorEarnMeta?.unit ?? 1;
    const ownsColorUp =
      (colorUp ? ownsItem(colorUp) : false) || (colorEarn ? colorHave >= colorEarn.count : false);
    // One source of truth for whether the upgrade gets its own block below — the "new" mark on the
    // name covers the upgrade exactly when it does NOT, so the id always has something to clear it.
    const upgradeShown = !!(colorUp && owned && colorItem && colorMod);
    const savedColor = isFrame ? equippedFrameColors[e.id] : equippedCardEffectColors[e.id];
    const draftColor =
      cardColorDraft[e.id] ?? savedColor ?? (isFrame ? DEFAULT_FRAME_COLOR : DEFAULT_CARD_COLOR);
    const colorDirty = draftColor.toLowerCase() !== (savedColor ?? '').toLowerCase();
    // A two-sided effect gets a second picker under the same upgrade (see CardEffectModule.dualColor).
    const dual = mod?.type === 'card_effect' && !!mod.dualColor;
    const savedColor2 = equippedCardEffectColors2[e.id];
    const draftColor2 = cardColor2Draft[e.id] ?? savedColor2 ?? DEFAULT_CARD_COLOR2;
    const color2Dirty = draftColor2.toLowerCase() !== (savedColor2 ?? '').toLowerCase();
    return (
      <div
        key={e.id}
        // Card effects get extra bottom padding so their liquid/drift base sits in a clear strip
        // below the button instead of overlapping it.
        className={`relative min-h-[5.5rem] border-t border-border pt-3 first:border-t-0 first:pt-0 ${
          isCard ? 'pb-6' : ''
        }`}
      >
        {/* Preview shows the SAVED colour, not the live draft: a colour effect regenerates its whole
            particle swarm on a colour change, so previewing every slider tick would respawn it
            frantically. It updates once on Apply (the native picker swatch shows the draft live). */}
        {isCard && <CardEffect effect={e.id} color={savedColor} color2={savedColor2} />}
        <div className="relative flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            {/* The demo needs the effect's `animation` explicitly: nick modules declare it instead
                of putting it in their css (they share one element — see NickEffectModule). */}
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={`font-medium text-text ${isNick ? nickEffectClass(e.id) : ''}`}
                style={
                  isNick
                    ? ({
                        ...glowVar,
                        animation: nickEffectModule(e.id)?.animation,
                      } as CSSProperties)
                    : undefined
                }
              >
                {t(labels.name)}
              </span>
              {/* Picks up the colour upgrade while ITS row is hidden (shown only once the effect is
                  owned) — otherwise that id has no mark anywhere and pins the tab's dot on. */}
              <NewDot id={colorUp && !upgradeShown ? [e.id, colorUp] : e.id} />
              {/* That this effect CAN be recoloured is part of what the buyer is choosing between, and
                  until now it only appeared after the purchase — the upgrade's own block is gated on
                  owning the effect. Drops away once the upgrade is owned: by then the pickers say it. */}
              {colorUp && !ownsColorUp && (
                <Tooltip
                  content={t(
                    colorEarn
                      ? 'shop.colorUpgradeEarnHint'
                      : dual
                        ? 'shop.colorUpgradeDualHint'
                        : 'shop.colorUpgradeHint',
                  )}
                >
                  <Icon name="palette" size={14} className="shrink-0 text-text" />
                </Tooltip>
              )}
            </span>
            {owned ? (
              on ? (
                <Badge>{t('shop.equippedBadge')}</Badge>
              ) : null
            ) : earn && earnMeta ? (
              <span className="inline-flex items-center gap-1.5 label-mono text-muted">
                <Icon name={earnMeta.icon} size={13} />
                {Math.floor(Math.min(have, earn.count) / earnUnit)} /{' '}
                {Math.round(earn.count / earnUnit)}
              </span>
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
          {isEntrance && (
            <EntranceDemo
              id={e.id}
              label={previewName}
              color={equippedEntranceColor ?? undefined}
            />
          )}
          {isFrame && <FrameDemo id={e.id} label={previewName} color={savedColor} />}
          <div className="flex items-center gap-2">
            {!owned ? (
              earn && earnMeta ? (
                // Earned, not bought: no buy button — just how far off the milestone is.
                <span className="label-mono text-faint">
                  {t(earnMeta.lockedKey, { n: Math.ceil((earn.count - have) / earnUnit) })}
                </span>
              ) : (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => buy(e.id, t(labels.name), e.costDust)}
                  disabled={balance < e.costDust}
                >
                  {t('shop.buy')}
                </Button>
              )
            ) : on ? (
              <Button variant="ghost" size="sm" onClick={() => onEquip(null)}>
                {t('shop.unequip')}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => onEquip(e.id)}>
                {t('shop.equip')}
              </Button>
            )}
            {!owned && !e.earn && balance < e.costDust && (
              <span className="label-mono text-faint">{t('shop.notEnough')}</span>
            )}
          </div>
          {/* Colour upgrade — lives INSIDE its effect's card, shown once the effect is owned. Buying it
              merges the picker in; a plain effect (no colorUpgrade) never shows this. */}
          {upgradeShown && colorItem && colorMod && (
            <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {upgradeTag}
                  <span className="font-medium text-text">{t(colorMod.labels.name)}</span>
                  <NewDot id={colorUp} />
                </span>
                {ownsColorUp ? (
                  <Badge>{t('shop.owned')}</Badge>
                ) : colorEarn && colorEarnMeta ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 label-mono text-muted">
                    <Icon name={colorEarnMeta.icon} size={13} />
                    {Math.floor(Math.min(colorHave, colorEarn.count) / colorUnit)} /{' '}
                    {Math.round(colorEarn.count / colorUnit)}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1.5 label-mono text-accent">
                    <DustMark size={14} />
                    {colorItem.costDust}
                  </span>
                )}
              </div>
              {ownsColorUp ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={draftColor}
                    onChange={(ev) => setCardColorDraft((p) => ({ ...p, [e.id]: ev.target.value }))}
                    aria-label={dual ? `${t(colorMod.labels.name)} 1` : t(colorMod.labels.name)}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-border bg-surface"
                  />
                  {dual && (
                    <input
                      type="color"
                      value={draftColor2}
                      onChange={(ev) =>
                        setCardColor2Draft((p) => ({ ...p, [e.id]: ev.target.value }))
                      }
                      aria-label={`${t(colorMod.labels.name)} 2`}
                      className="h-10 w-14 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-border bg-surface"
                    />
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      applyColorsFor(
                        e.type,
                        e.id,
                        colorDirty ? draftColor : undefined,
                        dual && color2Dirty ? draftColor2 : undefined,
                      )
                    }
                    disabled={!colorDirty && !(dual && color2Dirty)}
                  >
                    {t('shop.apply')}
                  </Button>
                  {(savedColor || savedColor2) && (
                    <Button variant="ghost" size="sm" onClick={() => removeColorFor(e.type, e.id)}>
                      {t('shop.resetColor')}
                    </Button>
                  )}
                </div>
              ) : colorEarn && colorEarnMeta ? (
                <span className="label-mono text-faint">
                  {t(colorEarnMeta.lockedKey, {
                    n: Math.ceil((colorEarn.count - colorHave) / colorUnit),
                  })}
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => buy(colorUp, t(colorMod.labels.name), colorItem.costDust)}
                    disabled={balance < colorItem.costDust}
                  >
                    {t('shop.buy')}
                  </Button>
                  {balance < colorItem.costDust && (
                    <span className="label-mono text-faint">{t('shop.notEnough')}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  /**
   * One seal ladder as a single row: shared name/desc on top, then the rungs side by side. Each rung
   * carries only its own state — equip button, or how far off it is — because the TIER is already
   * legible from the artwork, so repeating it in prose would just cost vertical space.
   */
  const sealLadderRow = (rungs: CosmeticItem[]) => {
    const head = rungs[0];
    if (!head) return null;
    const headMod = cosmeticModule(head.id);
    const labels = headMod?.labels;
    if (!labels) return null;
    // Colourable seals carry an EARNED colour upgrade; its picker renders below the
    // ladder, unlocked once the seal itself is earned AND the upgrade's own milestone is met.
    const rungIds = rungs.map((r) => r.id);
    const colorUp = headMod?.type === 'seal' ? headMod.colorUpgrade : undefined;
    const colorItem = colorUp ? COSMETICS.find((c) => c.id === colorUp) : undefined;
    const colorMod = colorUp ? cosmeticModule(colorUp) : undefined;
    const headEarn = head.earn;
    const headOwned =
      ownsItem(head.id) || (headEarn ? earnHave(headEarn) >= headEarn.count : false);
    const colorEarn = colorItem?.earn;
    // Admins get the picker without the milestone, the same bypass `ownsItem` gives them everywhere
    // else here — otherwise an unreleased seal (no `earn` yet) could not be judged in its own colours.
    const colorMet =
      admin ||
      (colorUp ? ownsItem(colorUp) : false) ||
      (colorEarn ? earnHave(colorEarn) >= colorEarn.count : false);
    const colorEarnMeta = colorEarn ? EARN_META[colorEarn.metric] : null;
    const colorHave = colorEarn ? earnHave(colorEarn) : 0;
    const colorUnit = colorEarnMeta?.unit ?? 1;
    // Same rule as the effect rows: the ladder's mark covers the upgrade whenever its own block is
    // absent, so the two together always account for the id.
    const upgradeShown = !!(colorUp && colorItem && colorMod && headOwned);
    const savedSealColor = equippedSealColors[head.id];
    const draftSealColor = sealColorDraft[head.id] ?? savedSealColor ?? DEFAULT_CARD_COLOR;
    const sealColorDirty = draftSealColor.toLowerCase() !== (savedSealColor ?? '').toLowerCase();
    return (
      <div
        key={head.ladder ?? head.id}
        className="relative border-t border-border pt-3 first:border-t-0 first:pt-0"
      >
        <div className="flex flex-col gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="font-medium text-text">{t(labels.name)}</span>
            {/* Answers for the whole ladder: the rungs are tiles with no mark of their own (four
                dots across a 4-up grid would be clutter), and the colour upgrade's row is hidden
                until the seal is earned. A NewDotGroup here would have nothing to dismiss it. */}
            <NewDot
              id={[...rungs.map((r) => r.id), ...(colorUp && !upgradeShown ? [colorUp] : [])]}
            />
          </span>
          <p className="text-sm italic text-muted">{t(labels.desc)}</p>
          {/* Columns follow the rung count (capped at 4): families are no longer all four rungs — a
              fixed 4-up grid left a one- or two-rung family hugging the left edge. */}
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.min(rungs.length, 4)}, minmax(0, 1fr))` }}
          >
            {rungs.map((r) => {
              const earn = r.earn;
              const earnMeta = earn ? EARN_META[earn.metric] : null;
              const have = earn ? earnHave(earn) : 0;
              const unit = earnMeta?.unit ?? 1;
              const owned = ownsItem(r.id) || (earn ? have >= earn.count : false);
              const on = equippedSeal === r.id;
              // A breadth rung's progress reads "2/5" in CHANNELS, which alone doesn't say what a
              // channel has to clear — so the bar goes under it. Without this the rungs of one
              // family look identical: same target, different requirement.
              const barText =
                earn?.per && earnMeta?.barKey
                  ? t(earnMeta.barKey, { n: Math.round(earn.per / (earnMeta.barUnit ?? 1)) })
                  : null;
              return (
                <div key={r.id} className="flex flex-col items-center gap-2 text-center">
                  {/* Locked rungs stay visible but dimmed — the ladder doubles as the roadmap. Goes
                      through SealMark rather than a bare span, so a seal that ships inner markup
                      previews exactly as it will be worn; the saved tint rides along. */}
                  <SealMark
                    seal={r.id}
                    color={savedSealColor}
                    size={44}
                    className={owned ? '' : 'opacity-40'}
                  />
                  {/* Fixed-height slot: a button is 26px tall and a bare progress label 12px, so
                      without one the four rungs' text lands at four different heights — an actual
                      staircase across a row whose whole point is being one line. */}
                  <span className="flex h-7 items-center justify-center">
                    {on ? (
                      <Button variant="ghost" size="sm" onClick={() => equipEffect({ seal: null })}>
                        {t('shop.unequip')}
                      </Button>
                    ) : owned ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => equipEffect({ seal: r.id })}
                      >
                        {t('shop.equip')}
                      </Button>
                    ) : earn && earnMeta ? (
                      <span className="inline-flex items-center gap-1 label-mono text-muted">
                        <Icon name={earnMeta.icon} size={12} />
                        {Math.floor(Math.min(have, earn.count) / unit)}/
                        {Math.round(earn.count / unit)}
                      </span>
                    ) : null}
                  </span>
                  {barText && <span className="label-mono text-[10px] text-faint">{barText}</span>}
                </div>
              );
            })}
          </div>
          {/* Colour upgrade — inside the seal's row, once the seal is earned. Same shape as the card
              effect picker, but the upgrade is EARNED (progress shown), not bought. */}
          {upgradeShown && colorItem && colorMod && (
            <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {upgradeTag}
                  <span className="font-medium text-text">{t(colorMod.labels.name)}</span>
                  <NewDot id={colorUp} />
                </span>
                {!colorMet && colorEarnMeta && colorEarn && (
                  <span className="inline-flex items-center gap-1 label-mono text-muted">
                    <Icon name={colorEarnMeta.icon} size={12} />
                    {Math.floor(Math.min(colorHave, colorEarn.count) / colorUnit)}/
                    {Math.round(colorEarn.count / colorUnit)}
                  </span>
                )}
              </div>
              {colorMet ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={draftSealColor}
                    onChange={(ev) =>
                      setSealColorDraft((p) => ({ ...p, [head.id]: ev.target.value }))
                    }
                    aria-label={t(colorMod.labels.name)}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-border bg-surface"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => applySealColorFor(rungIds, draftSealColor)}
                    disabled={!sealColorDirty}
                  >
                    {t('shop.apply')}
                  </Button>
                  {savedSealColor && (
                    <Button variant="ghost" size="sm" onClick={() => removeSealColorFor(rungIds)}>
                      {t('shop.resetColor')}
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm italic text-muted">{t(colorMod.labels.desc)}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  /** A purchasable TTS voice row: no equip slot — the voice is picked per send in the compose form. */
  const voiceRow = (e: CosmeticItem) => {
    const owned = ownsItem(e.id);
    const labels = cosmeticModule(e.id)?.labels;
    if (!labels) return null;
    return (
      <div key={e.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium text-text">
              {t(labels.name)}
              <NewDot id={e.id} />
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

  // A small tag marking an item as an UPGRADE of another cosmetic (a colour picker, gradient, flow) —
  // it modifies something else rather than standing on its own, so it must not read as a plain effect.
  const upgradeTag = (
    <span className="inline-flex shrink-0 items-center rounded-full border border-[rgba(141,240,204,0.4)] bg-[rgba(141,240,204,0.08)] px-2 py-[3px] label-mono text-accent">
      {t('shop.upgrade')}
    </span>
  );

  return createPortal(
    <Drawer
      open={open}
      onClose={onClose}
      title={t('shop.title')}
      closeLabel={t('common.close')}
      width="max-w-lg"
    >
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

        {/* Scrolls sideways when the tabs stop fitting — a longer word in another locale (or one more
            category) must never push a tab off the edge where it can't be reached. */}
        <div className="flex gap-1 overflow-x-auto border border-border bg-surface-2 p-1">
          <CategoryBtn
            active={category === 'nick'}
            onClick={() => setCategory('nick')}
            label={t('shop.catNick')}
            category="nick"
          />
          <CategoryBtn
            active={category === 'card'}
            onClick={() => setCategory('card')}
            label={t('shop.catCard')}
            category="card"
          />
          <CategoryBtn
            active={category === 'frame'}
            onClick={() => setCategory('frame')}
            label={t('shop.catFrame')}
            category="frame"
          />
          <CategoryBtn
            active={category === 'seal'}
            onClick={() => setCategory('seal')}
            label={t('shop.catSeal')}
            category="seal"
          />
          <CategoryBtn
            active={category === 'entrance'}
            onClick={() => setCategory('entrance')}
            label={t('shop.catEntrance')}
            category="entrance"
          />
          <CategoryBtn
            active={category === 'voices'}
            onClick={() => setCategory('voices')}
            label={t('shop.catVoices')}
            category="voices"
          />
        </div>

        {category === 'nick' &&
          section(
            t('shop.nickColor'),
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="text-sm italic text-muted">{t('shop.nickColorDesc')}</p>
                  <NewDot id={NICK_COLOR_ID} />
                </div>
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

              {/* Gradient rung — an upgrade of the colour above. ALWAYS shown (transparency: the whole
                  ladder is visible so the viewer knows what to save for); the buy is locked with a
                  "needs the previous item" hint until the base colour is owned. */}
              <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-text">
                    {t('shop.nickGradient')}
                    {upgradeTag}
                    <NewDot id={NICK_GRADIENT_ID} />
                  </span>
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
                      disabled={!ownsColor || balance < gradientItem.costDust}
                    >
                      {t('shop.buy')}
                    </Button>
                    {!ownsColor ? (
                      <span className="label-mono text-faint">{t('shop.requiresPrev')}</span>
                    ) : (
                      balance < gradientItem.costDust && (
                        <span className="label-mono text-faint">{t('shop.notEnough')}</span>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Flow rung — modifies the gradient. ALWAYS shown; the buy is locked with a hint until
                  the gradient is owned. Once owned, the toggle additionally needs the gradient turned
                  ON (two stops to drift between) — a usability gate, not a purchase one, so it disables
                  the toggle with its own hint rather than hiding the rung. */}
              <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-text">
                    {t('shop.nickFlow')}
                    {upgradeTag}
                    <NewDot id={NICK_FLOW_ID} />
                  </span>
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
                  <div className="flex items-center gap-2">
                    <Button
                      variant={flow ? 'ghost' : 'primary'}
                      size="sm"
                      onClick={toggleFlow}
                      disabled={!useGradient}
                    >
                      {t(flow ? 'shop.flowOff' : 'shop.flowOn')}
                    </Button>
                    {!useGradient && (
                      <span className="label-mono text-faint">{t('shop.needsGradient')}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() => buy(NICK_FLOW_ID, t('shop.nickFlow'), flowItem.costDust)}
                      disabled={!ownsGradient || balance < flowItem.costDust}
                    >
                      {t('shop.buy')}
                    </Button>
                    {!ownsGradient ? (
                      <span className="label-mono text-faint">{t('shop.requiresPrev')}</span>
                    ) : (
                      balance < flowItem.costDust && (
                        <span className="label-mono text-faint">{t('shop.notEnough')}</span>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>,
          )}

        {category === 'nick' &&
          section(
            t('shop.nickEffects'),
            nickEffects.map((e) =>
              effectRow(e, equippedNickEffect, (id) => equipEffect({ nickEffect: id })),
            ),
          )}

        {category === 'card' && (
          <div className="flex flex-col gap-3">
            {/* Themed sub-tabs: only the active group's rows mount, so at most a few live previews run
                at once instead of the whole catalog. */}
            <div className="flex flex-wrap gap-1">
              {cardGroups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={cardGroup === g.key}
                  onClick={() => setCardGroup(g.key)}
                  className={`flex items-center gap-1.5 rounded-none border px-2.5 py-1 label-mono transition-colors duration-200 ${
                    cardGroup === g.key
                      ? 'border-accent bg-accent text-accent-contrast'
                      : 'border-border text-muted hover:text-text'
                  }`}
                >
                  {t(GROUP_LABEL[g.key])}
                  {cardGroup !== g.key && <NewDotGroup ids={g.effects.map((e) => e.id)} />}
                </button>
              ))}
            </div>
            {section(
              t('shop.cardEffects'),
              (cardGroups.find((g) => g.key === cardGroup) ?? cardGroups[0])?.effects.map((e) =>
                effectRow(e, equippedCardEffect, (id) => equipEffect({ cardEffect: id })),
              ),
            )}
          </div>
        )}

        {category === 'frame' &&
          section(
            t('shop.frames'),
            frames.map((e) => effectRow(e, equippedFrame, (id) => equipEffect({ frame: id }))),
          )}

        {category === 'seal' && section(t('shop.seals'), sealLadders.map(sealLadderRow))}

        {category === 'entrance' &&
          section(
            t('shop.entrances'),
            <>
              {entrances.map((e) =>
                effectRow(e, equippedEntrance, (id) => equipEffect({ entrance: id })),
              )}
            </>,
            // Said once, in the only place a viewer decides to spend on this: the entrance lands on
            // the stream, and the chat pill only exists if the streamer runs that overlay. Selling
            // it without saying so would be a catch, and this product's whole pitch is no catches.
            t('shop.entrancesNote'),
          )}

        {/* Entrance colour — its OWN block, not a rung under the portal: it tints WHICHEVER entrance is
            equipped (see entrance-portal-color), so hanging it off one effect would misdescribe it. No
            purchase gate either — it's bought on its own, whenever the viewer wants it. */}
        {category === 'entrance' &&
          section(
            t('shop.entranceColor'),
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-text">
                    {t('shop.entranceColor')}
                    {upgradeTag}
                    <NewDot id={PORTAL_COLOR_ID} />
                  </span>
                  {ownsPortalColor ? (
                    <Badge>{t('shop.owned')}</Badge>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1.5 label-mono text-accent">
                      <DustMark size={14} />
                      {portalColorItem.costDust}
                    </span>
                  )}
                </div>
                <p className="text-sm italic text-muted">{t('shop.entranceColorDesc')}</p>
                {ownsPortalColor ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="color"
                      value={portalColor}
                      onChange={(e) => setPortalColor(e.target.value)}
                      aria-label={t('shop.entranceColor')}
                      className="h-10 w-14 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-border bg-surface"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={applyPortalColor}
                      disabled={!portalColorDirty}
                    >
                      {t('shop.apply')}
                    </Button>
                    {equippedEntranceColor && (
                      <Button variant="ghost" size="sm" onClick={removePortalColor}>
                        {t('shop.remove')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() =>
                        buy(PORTAL_COLOR_ID, t('shop.entranceColor'), portalColorItem.costDust)
                      }
                      disabled={balance < portalColorItem.costDust}
                    >
                      {t('shop.buy')}
                    </Button>
                    {balance < portalColorItem.costDust && (
                      <span className="label-mono text-faint">{t('shop.notEnough')}</span>
                    )}
                  </div>
                )}
              </div>
            </>,
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
