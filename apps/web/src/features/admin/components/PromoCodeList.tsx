import { useEffect, useState } from 'react';
import type { AdminPromoCode, AdminPromoRedemption } from '@tmw/shared';
import { listPromoRedemptions, revokePromoCode } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { Icon } from '@/ui/icons';
import { Badge, Button, Card, IconButton } from '@/ui';

/** Revoked codes carry a past expiry; we never issue a natural one (see admin promo routes). */
const isRevoked = (c: AdminPromoCode) => c.expiresAt != null && c.expiresAt <= Date.now();

function RedemptionLog({ code }: { code: string }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<AdminPromoRedemption[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    void listPromoRedemptions(code)
      .then(setRows)
      .catch(() => setError(true));
  }, [code]);

  if (error) return <p className="text-xs text-danger">{t('admin.logError')}</p>;
  if (!rows) return <p className="text-xs text-faint">{t('common.loading')}</p>;
  if (rows.length === 0) return <p className="text-xs text-faint">{t('admin.noRedemptions')}</p>;

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => (
        <li key={r.login} className="flex items-center gap-2 text-xs text-muted">
          <Icon name="check" size={12} className="text-accent" />
          <span className="text-text">{r.displayName}</span>
          <span className="ml-auto text-faint">{new Date(r.createdAt).toLocaleString(lang)}</span>
        </li>
      ))}
    </ul>
  );
}

export function PromoCodeList({
  codes,
  onChanged,
}: {
  codes: AdminPromoCode[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  if (codes.length === 0) {
    return <p className="text-sm text-muted">{t('admin.empty')}</p>;
  }

  async function revoke(code: string) {
    setRevoking(code);
    try {
      await revokePromoCode(code);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <Card>
      <ul className="flex flex-col gap-2 text-sm">
        {codes.map((c) => {
          const dead = isRevoked(c);
          const exhausted = c.usedCount >= c.maxUses;
          const open = openCode === c.code;
          return (
            <li
              key={c.code}
              className="flex flex-col gap-1.5 border-b border-border/50 pb-2 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => setOpenCode(open ? null : c.code)}
                  aria-expanded={open}
                  className="flex items-center gap-1.5 text-muted transition-colors hover:text-text"
                >
                  <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
                  <code
                    className={`rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 py-0.5 font-mono ${
                      dead ? 'text-faint line-through' : 'text-accent'
                    }`}
                  >
                    {c.code}
                  </code>
                </button>
                <Badge>
                  {c.grant === 'stardust'
                    ? t('admin.grantDustBadge', { n: c.grantAmount ?? 0 })
                    : t('admin.grantFounder')}
                </Badge>
                <span className={exhausted ? 'text-faint' : 'text-muted'}>
                  {t('admin.uses', { used: c.usedCount, max: c.maxUses })}
                </span>
                {dead && <span className="text-xs text-danger">{t('admin.revoked')}</span>}
                {c.note && <span className="text-xs text-muted">{c.note}</span>}
                <div className="ml-auto flex items-center gap-1">
                  {!dead && (
                    <Button
                      variant="ghost"
                      disabled={revoking === c.code}
                      onClick={() => void revoke(c.code)}
                    >
                      <Icon name="close" size={14} />
                      {t('admin.revoke')}
                    </Button>
                  )}
                  <IconButton
                    name="copy"
                    label={t('admin.copyCode')}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(c.code);
                      toast(t('admin.codeCopied'));
                    }}
                  />
                </div>
              </div>
              {open && (
                <div className="pl-6">
                  <RedemptionLog code={c.code} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
