import { useState } from 'react';
import { createPromoCodes } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { Icon } from '@/ui/icons';
import { Button, Card, Input } from '@/ui';

/** Форма генерации промокодов первопроходца (admin-only). */
export function PromoGenerateForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      await createPromoCodes(count, note);
      setNote('');
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <h2>{t('admin.generate')}</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm text-muted">
          <span>{t('admin.count')}</span>
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
            className="mt-1 block w-20 bg-surface-2 px-2 py-1"
          />
        </label>
        <label className="flex-1 text-sm text-muted">
          <span>{t('admin.note')}</span>
          <Input
            type="text"
            value={note}
            placeholder={t('admin.notePlaceholder')}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 block w-full bg-surface-2 px-2 py-1"
          />
        </label>
        <Button variant="primary" disabled={busy} onClick={() => void generate()}>
          <Icon name="sparkles" size={16} />
          {t('admin.generate')}
        </Button>
      </div>
    </Card>
  );
}
