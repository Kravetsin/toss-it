import { useState } from 'react';
import type { ChannelSettings } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Button, Card } from '@/ui';
import { Slider } from './settings/controls';

/** What viewers may send: max video / image display time, audio length, file size. */
export function SubmissionLimits({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: (patch: Partial<ChannelSettings>) => void;
}) {
  const { t } = useI18n();
  const [maxDurS, setMaxDurS] = useState(Math.round(settings.maxDurationMs / 1000));
  const [imgDurS, setImgDurS] = useState(Math.round(settings.imageDurationMs / 1000));
  const [maxAudioMin, setMaxAudioMin] = useState(
    Math.min(10, Math.max(1, Math.round(settings.maxAudioDurationMs / 60_000))),
  );
  const [maxSizeMb, setMaxSizeMb] = useState(Math.round(settings.maxFileSizeBytes / 1024 / 1024));
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="label-mono text-muted">{t('settings.limits')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          icon="play"
          label={t('dash.sliderVideo', { n: maxDurS })}
          min={1}
          max={60}
          value={maxDurS}
          onChange={setMaxDurS}
        />
        <Slider
          icon="image"
          label={t('dash.sliderImage', { n: imgDurS })}
          min={1}
          max={60}
          value={imgDurS}
          onChange={setImgDurS}
        />
        <Slider
          icon="volume-2"
          label={t('dash.sliderAudio', { n: maxAudioMin })}
          min={1}
          max={10}
          value={maxAudioMin}
          onChange={setMaxAudioMin}
        />
        <Slider
          icon="save"
          label={t('dash.sliderSize', { n: maxSizeMb })}
          min={1}
          max={50}
          value={maxSizeMb}
          onChange={setMaxSizeMb}
        />
      </div>
      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() =>
            onSave({
              maxDurationMs: maxDurS * 1000,
              imageDurationMs: imgDurS * 1000,
              maxAudioDurationMs: maxAudioMin * 60_000,
              maxFileSizeBytes: maxSizeMb * 1024 * 1024,
            })
          }
        >
          {t('dash.save')}
        </Button>
      </div>
    </Card>
  );
}
