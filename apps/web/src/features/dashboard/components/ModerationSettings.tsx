import { useState } from 'react';
import type { ChannelSettings } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useConfirm } from '@/providers/ConfirmProvider';
import { Icon } from '@/ui/icons';
import { Card } from '@/ui';

/** Moderation policy: bypass rules for trusted content (YouTube auto-approve, etc.). */
export function ModerationSettings({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: (patch: Partial<ChannelSettings>) => void;
}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [ytAuto, setYtAuto] = useState(settings.autoApproveYoutube);

  // Enabling skips moderation — gate it behind a risk reminder; disabling is instant.
  const toggleYt = async (next: boolean) => {
    if (next) {
      const ok = await confirm({
        title: t('mod.ytConfirmTitle'),
        message: t('mod.ytConfirmMsg'),
        confirmLabel: t('mod.ytConfirmOk'),
        danger: true,
      });
      if (!ok) return;
    }
    setYtAuto(next);
    onSave({ autoApproveYoutube: next });
  };

  return (
    <Card>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={ytAuto}
          onChange={(e) => void toggleYt(e.target.checked)}
          className="mt-0.5 accent-[var(--color-accent)]"
        />
        <span>
          <span className="flex items-center gap-1.5 text-sm text-text">
            <Icon name="youtube" size={15} />
            {t('mod.ytAutoApprove')}
          </span>
          <span className="mt-1 block text-xs text-muted">{t('mod.ytAutoApproveNote')}</span>
        </span>
      </label>
    </Card>
  );
}
