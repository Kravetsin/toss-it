import { useCallback, useEffect, useState } from 'react';
import type { AdminCosmeticOwner, AdminCosmeticRow } from '@tmw/shared';
import { cosmeticModule } from '@tmw/shared';
import { addUserStardust, listAdminCosmetics, listCosmeticOwners } from '@/lib/api';
import { useApiAction } from '@/hooks/useApiAction';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Badge, Card, Input } from '@/ui';
import { DustMark } from '@/components/DustMark';

/** One buyer, with their live balance and a one-click refund (adds to the balance atomically). */
function OwnerRow({
  owner,
  defaultAmount,
  onRefunded,
}: {
  owner: AdminCosmeticOwner;
  defaultAmount: number | null;
  onRefunded: (userId: string, stardust: number) => void;
}) {
  const { t } = useI18n();
  const act = useApiAction();
  const [amount, setAmount] = useState(defaultAmount != null ? String(defaultAmount) : '');

  const refund = () => {
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n) || n === 0) return;
    void act(
      async () => {
        const res = await addUserStardust(owner.userId, n);
        onRefunded(owner.userId, res.stardust);
      },
      { success: t('admin.refunded') },
    );
  };

  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-border py-1.5 last:border-0">
      {owner.avatarUrl ? (
        <img src={owner.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full" />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs">
          {owner.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <b className="truncate">{owner.displayName}</b>
      <span className="truncate text-muted">@{owner.login}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1 tabular-nums text-muted">
        <DustMark size={13} className="text-accent" />
        {owner.stardust}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('admin.refundAmount')}
          className="w-24 py-0.5 text-sm"
        />
        <button
          type="button"
          onClick={refund}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border px-2 py-1 text-sm text-accent transition-colors hover:border-accent"
        >
          <Icon name="gift" size={13} />
          {t('admin.refund')}
        </button>
      </span>
    </li>
  );
}

/** One cosmetic: id, resolved name/price, owner count; expand to load buyers and refund them. */
function CosmeticRow({ row }: { row: AdminCosmeticRow }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [owners, setOwners] = useState<AdminCosmeticOwner[] | null>(null);
  // Undefined = the item was removed from the catalog (its buyers are still owed a refund).
  const mod = cosmeticModule(row.itemId);
  const name = mod ? t(mod.labels.name) : row.itemId;
  const price = mod?.costDust ?? null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && owners == null) {
      void listCosmeticOwners(row.itemId)
        .then(setOwners)
        .catch(() => {});
    }
  };

  const onRefunded = (userId: string, stardust: number) =>
    setOwners((prev) => prev?.map((o) => (o.userId === userId ? { ...o, stardust } : o)) ?? prev);

  return (
    <li className="flex flex-col gap-1.5 border-b border-border pb-2 last:border-0 last:pb-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
        className="flex cursor-pointer items-center gap-2"
      >
        <Icon
          name="chevron-down"
          size={14}
          className={`shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
        <b className="truncate">{name}</b>
        {!mod && <Badge>{t('admin.cosmeticsRemoved')}</Badge>}
        <span className="truncate text-xs text-faint">{row.itemId}</span>
        {price != null && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted tabular-nums">
            <DustMark size={12} />
            {price}
          </span>
        )}
        <span className="ml-auto shrink-0 text-muted tabular-nums">
          {row.owners} <span className="text-faint">{t('admin.owners')}</span>
        </span>
      </div>

      {open && (
        <ul className="flex flex-col pl-8 text-sm">
          {owners == null ? (
            <li className="py-1 text-muted">{t('common.loading')}</li>
          ) : owners.length === 0 ? (
            <li className="py-1 text-muted">{t('admin.noOwners')}</li>
          ) : (
            owners.map((o) => (
              <OwnerRow key={o.userId} owner={o} defaultAmount={price} onRefunded={onRefunded} />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

/** Admin view of who owns which cosmetic, with per-buyer refunds — for price changes and removals. */
export function AdminCosmeticsPanel() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AdminCosmeticRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    void listAdminCosmetics()
      .then((r) => {
        setRows(r);
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        {loaded ? t('admin.cosmeticsEmpty') : t('common.loading')}
      </p>
    );
  }
  return (
    <Card>
      <ul className="flex flex-col gap-2 text-sm">
        {rows.map((r) => (
          <CosmeticRow key={r.itemId} row={r} />
        ))}
      </ul>
    </Card>
  );
}
