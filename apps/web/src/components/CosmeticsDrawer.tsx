import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { COSMETICS } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useConfirm } from '@/providers/ConfirmProvider';
import { Badge, Button, Card, Drawer } from '@/ui';
import { DustMark } from '@/components/DustMark';
import { buyCosmetic, equipCosmetic } from '@/lib/api/shop';

const DEFAULT_COLOR = '#8df0cc';
const NICK_COLOR_ID = 'nick-color';

/** Cosmetics shop, opened from the stardust wallet. Everything is bought with stardust, never money. */
export function CosmeticsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { me, refresh } = useMe();
  const act = useApiAction();
  const confirm = useConfirm();
  const user = me?.user;

  const item = COSMETICS.find((c) => c.id === NICK_COLOR_ID)!;
  const owns = user?.ownedCosmetics.includes(NICK_COLOR_ID) ?? false;
  const equippedColor = user?.equipped.nickColor ?? null;
  const balance = user?.stardust ?? 0;

  const [color, setColor] = useState(equippedColor ?? DEFAULT_COLOR);
  // Reflect the saved color when it changes (e.g. after a refresh) without fighting active edits.
  useEffect(() => {
    if (equippedColor) setColor(equippedColor);
  }, [equippedColor]);

  // Confirm before spending — a misclick shouldn't burn stardust.
  const buy = async () => {
    const ok = await confirm({
      title: t('shop.confirmTitle'),
      message: t('shop.confirmBuy', { item: t('shop.nickColor'), n: item.costDust }),
      confirmLabel: t('shop.buy'),
    });
    if (!ok) return;
    void act(() => buyCosmetic(NICK_COLOR_ID), { after: refresh, success: t('shop.bought') });
  };
  const apply = () =>
    void act(() => equipCosmetic({ nickColor: color }), {
      after: refresh,
      success: t('shop.equipped'),
    });
  const remove = () =>
    void act(() => equipCosmetic({ nickColor: null }), {
      // Reset the local picker so the preview stops showing the just-removed color.
      after: () => {
        setColor(DEFAULT_COLOR);
        return refresh();
      },
    });

  const previewName = user?.displayName ?? 'nickname';

  // Portal to body: the dashboard topbar has backdrop-filter, which would otherwise become the
  // containing block for the Drawer's `fixed` positioning and clip it to the topbar's height.
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

        <Card corners>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display">{t('shop.nickColor')}</h3>
            {owns ? (
              <Badge>{t('shop.owned')}</Badge>
            ) : (
              <span className="inline-flex items-center gap-1.5 label-mono text-accent">
                <DustMark size={14} />
                {item.costDust}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{t('shop.nickColorDesc')}</p>

          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <span className="label-mono text-faint">{t('shop.preview')}</span>
            <b style={{ color: owns ? color : equippedColor || undefined }}>{previewName}</b>
          </div>

          {owns ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
                onClick={apply}
                disabled={color.toLowerCase() === (equippedColor ?? '').toLowerCase()}
              >
                {t('shop.apply')}
              </Button>
              {equippedColor && (
                <Button variant="ghost" size="sm" onClick={remove}>
                  {t('shop.remove')}
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <Button variant="accent" size="sm" onClick={buy} disabled={balance < item.costDust}>
                {t('shop.buy')}
              </Button>
              {balance < item.costDust && (
                <span className="label-mono text-faint">{t('shop.notEnough')}</span>
              )}
            </div>
          )}
        </Card>
      </div>
    </Drawer>,
    document.body,
  );
}
