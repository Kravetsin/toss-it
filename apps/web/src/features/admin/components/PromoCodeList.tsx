import type { AdminPromoCode } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { Badge, Card, IconButton } from '@/ui';

export function PromoCodeList({ codes }: { codes: AdminPromoCode[] }) {
  const { t } = useI18n();
  const toast = useToast();

  if (codes.length === 0) {
    return <p className="text-sm text-muted">{t('admin.empty')}</p>;
  }

  return (
    <Card>
      <ul className="flex flex-col gap-2 text-sm">
        {codes.map((c) => (
          <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <code className="rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 py-0.5 font-mono text-accent">
              {c.code}
            </code>
            {c.redeemedByLogin ? (
              <span className="text-muted">
                {t('admin.redeemedBy', { login: c.redeemedByLogin })}
              </span>
            ) : (
              <Badge>{t('admin.unused')}</Badge>
            )}
            {c.note && <span className="text-xs text-muted">{c.note}</span>}
            <IconButton
              name="copy"
              label={t('admin.copyCode')}
              size="sm"
              variant="ghost"
              wrapClassName="ml-auto"
              onClick={() => {
                void navigator.clipboard.writeText(c.code);
                toast(t('admin.codeCopied'));
              }}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
