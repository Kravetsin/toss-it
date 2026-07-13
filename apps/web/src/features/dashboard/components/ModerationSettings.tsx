import { useState } from 'react';
import type { ChannelSettings } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useConfirm } from '@/providers/ConfirmProvider';
import { Card, Switch } from '@/ui';

/** Moderation policy: bypass rules for trusted content (GIF / YouTube auto-approve). Saved instantly. */
export function ModerationSettings({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: (patch: Partial<ChannelSettings>) => void;
}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [gifAuto, setGifAuto] = useState(settings.autoApproveGifs);
  const [ytAuto, setYtAuto] = useState(settings.autoApproveYoutube);

  const toggleGif = (next: boolean) => {
    setGifAuto(next);
    onSave({ autoApproveGifs: next });
  };

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
    <Card className="flex flex-col divide-y divide-border">
      <div className="pb-4">
        <Switch
          icon="image"
          label={t('mod.gifAutoApprove')}
          description={t('mod.gifAutoApproveNote')}
          checked={gifAuto}
          onChange={toggleGif}
        />
      </div>
      <div className="pt-4">
        <Switch
          icon="youtube"
          label={t('mod.ytAutoApprove')}
          description={t('mod.ytAutoApproveNote')}
          checked={ytAuto}
          onChange={(v) => void toggleYt(v)}
        />
      </div>
    </Card>
  );
}
