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
  const [ytMusic, setYtMusic] = useState(settings.autoApproveYoutubeMusic);
  const [ytVideo, setYtVideo] = useState(settings.autoApproveYoutubeVideo);
  const [ytMax, setYtMax] = useState(settings.youtubeAutoMaxMinutes);

  const toggleGif = (next: boolean) => {
    setGifAuto(next);
    onSave({ autoApproveGifs: next });
  };

  // Music plays in a compact corner player (low-risk) — toggle instantly.
  const toggleMusic = (next: boolean) => {
    setYtMusic(next);
    onSave({ autoApproveYoutubeMusic: next });
  };

  // Video is full-screen and can take over the stream — gate enabling behind a risk reminder.
  const toggleVideo = async (next: boolean) => {
    if (next) {
      const ok = await confirm({
        title: t('mod.ytConfirmTitle'),
        message: t('mod.ytConfirmMsg'),
        confirmLabel: t('mod.ytConfirmOk'),
        danger: true,
      });
      if (!ok) return;
    }
    setYtVideo(next);
    onSave({ autoApproveYoutubeVideo: next });
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
          label={t('mod.ytMusicAutoApprove')}
          description={t('mod.ytMusicNote')}
          checked={ytMusic}
          onChange={toggleMusic}
        />
        <Switch
          icon="youtube"
          label={t('mod.ytVideoAutoApprove')}
          description={t('mod.ytVideoNote')}
          checked={ytVideo}
          onChange={(v) => void toggleVideo(v)}
        />
        {/* The cap only matters while some auto-approve is on — longer clips fall to moderation. */}
        {(ytMusic || ytVideo) && (
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
