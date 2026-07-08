import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { COSMETICS, cosmeticModule, nickEffectClass, type CosmeticItem } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useConfirm } from '@/providers/ConfirmProvider';
import { Badge, Button, Card, Drawer, IconButton } from '@/ui';
import { Icon } from '@/ui/icons';
import { DustMark } from '@/components/DustMark';
import { CardEffect } from '@/components/CardEffect';
import { buyCosmetic, equipCosmetic } from '@/lib/api/shop';
import { playVoicePreview } from '@/lib/voicePreview';

const DEFAULT_COLOR = '#8df0cc';
const NICK_COLOR_ID = 'nick-color';

type ShopCategory = 'nick' | 'card' | 'voices';

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

/** Cosmetics shop, opened from the stardust wallet. Everything is bought with stardust, never money. */
export function CosmeticsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { me, refresh } = useMe();
  const act = useApiAction();
  const confirm = useConfirm();
  const user = me?.user;

  const colorItem = COSMETICS.find((c) => c.id === NICK_COLOR_ID)!;
  const nickEffects = COSMETICS.filter((c) => c.type === 'nick_effect');
  const cardEffects = COSMETICS.filter((c) => c.type === 'card_effect');
  // Every specific voice is a purchase; the free path is the "auto" option in the compose form.
  const voiceItems = COSMETICS.filter((c) => c.type === 'tts_voice');
  const ownsColor = user?.ownedCosmetics.includes(NICK_COLOR_ID) ?? false;
  const equippedColor = user?.equipped.nickColor ?? null;
  const equippedNickEffect = user?.equipped.nickEffect ?? null;
  const equippedCardEffect = user?.equipped.cardEffect ?? null;
  const balance = user?.stardust ?? 0;
  const previewName = user?.displayName ?? 'nickname';

  const [category, setCategory] = useState<ShopCategory>('nick');
  const [color, setColor] = useState(equippedColor ?? DEFAULT_COLOR);
  // Reflect the saved color when it changes (e.g. after a refresh) without fighting active edits.
  useEffect(() => {
    if (equippedColor) setColor(equippedColor);
  }, [equippedColor]);

  const buy = async (id: string, label: string, cost: number) => {
    const ok = await confirm({
      title: t('shop.confirmTitle'),
      message: t('shop.confirmBuy', { item: label, n: cost }),
      confirmLabel: t('shop.buy'),
    });
    if (!ok) return;
    void act(() => buyCosmetic(id), { after: refresh, success: t('shop.bought') });
  };
  const applyColor = () =>
    void act(() => equipCosmetic({ nickColor: color }), {
      after: refresh,
      success: t('shop.equipped'),
    });
  const removeColor = () =>
    void act(() => equipCosmetic({ nickColor: null }), {
      after: () => {
        setColor(DEFAULT_COLOR);
        return refresh();
      },
    });
  // One slot per effect category; equipping another replaces it, null unequips.
  const equipEffect = (patch: { nickEffect?: string | null; cardEffect?: string | null }) =>
    void act(() => equipCosmetic(patch), {
      after: refresh,
      success: t('shop.equipped'),
    });

  // Glow demo uses the equipped nick color (or mint), without recoloring the demo text.
  const glowVar = { ['--nick-glow']: equippedColor || 'var(--color-accent)' } as CSSProperties;

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
            <span
              className={`font-medium text-text ${isNick ? nickEffectClass(e.id) : ''}`}
              style={isNick ? glowVar : undefined}
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
          <p className="text-sm text-muted">{t(labels.desc)}</p>
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
              <Button variant="secondary" size="sm" onClick={() => onEquip(e.id)}>
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

  const section = (title: string, body: ReactNode) => (
    <Card corners>
      <h3 className="font-display">{title}</h3>
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

        {/* Earn explainer used to hide in a hover tooltip — keep it always visible here. */}
        <div className="rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          <span className="font-medium text-text">{t('wallet.howTitle')}</span>{' '}
          {t('wallet.earnPost')} · {t('wallet.earnChat')} · {t('wallet.earnDonate')}
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
                <p className="text-sm text-muted">{t('shop.nickColorDesc')}</p>
                {ownsColor ? (
                  <Badge>{t('shop.owned')}</Badge>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1.5 label-mono text-accent">
                    <DustMark size={14} />
                    {colorItem.costDust}
                  </span>
                )}
              </div>
              {/* Demo: the nick in the picked colour (or mint for a not-yet-bought teaser). */}
              <b className="text-lg" style={{ color: ownsColor ? color : DEFAULT_COLOR }}>
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
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={applyColor}
                    disabled={color.toLowerCase() === (equippedColor ?? '').toLowerCase()}
                  >
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
