import { useState } from 'react';
import type { ChannelSettings } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useConfirm } from '@/providers/ConfirmProvider';
import { Slider } from '@/features/dashboard/components/settings/controls';
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
  const [ytMax, setYtMax] = useState(settings.youtubeAutoMaxMinutes);

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
      <div className="flex flex-col gap-3 pt-4">
        <Switch
          icon="youtube"
          label={t('mod.ytAutoApprove')}
          description={t('mod.ytAutoApproveNote')}
          checked={ytAuto}
          onChange={(v) => void toggleYt(v)}
        />
        {/* The cap only matters while auto-approve is on — longer videos fall to moderation. */}
        {ytAuto && (
          <Slider
            icon="youtube"
            label={t('mod.ytMaxMinutes', { n: ytMax })}
            min={1}
            max={10}
            step={1}
            value={ytMax}
            onChange={setYtMax}
            onCommit={(n) => onSave({ youtubeAutoMaxMinutes: n })}
          />
        )}
      </div>
    </Card>
  );
}
