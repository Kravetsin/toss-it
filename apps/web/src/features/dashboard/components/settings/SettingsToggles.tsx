import { useState } from 'react';
import type { ChannelSettings } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Card, Switch } from '@/ui';
import { Slider } from './controls';

/**
 * Overlay display on/off flags as switches, saved instantly (no Save button) — the simple
 * toggles a streamer flips most often. Stays visible (not under an accordion).
 */
export function SettingsToggles({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: (patch: Partial<ChannelSettings>) => void;
}) {
  const { t } = useI18n();
  const [showSender, setShowSender] = useState(settings.showSenderName);
  // Field name still says "chat" — it predates the numeral appearing on the media overlay too. The
  // column keeps the name; the setting does not mean "in chat" any more.
  const [showLevel, setShowLevel] = useState(settings.chatShowLevel);
  const [soundAlert, setSoundAlert] = useState(settings.soundAlert);
  const [ttsName, setTtsName] = useState(settings.ttsName);
  const [ttsMessage, setTtsMessage] = useState(settings.ttsMessage);
  const [volume, setVolume] = useState(settings.volume);

  const flip = (set: (v: boolean) => void, key: keyof ChannelSettings, next: boolean) => {
    set(next);
    onSave({ [key]: next });
  };

  return (
    <Card className="flex flex-col divide-y divide-border">
      <h2 className="pb-3 label-mono text-muted">{t('settings.toggles')}</h2>
      <div className="py-3">
        <Switch
          icon="eye"
          label={t('dash.showSender')}
          checked={showSender}
          onChange={(v) => flip(setShowSender, 'showSenderName', v)}
        />
      </div>
      {/* Next to the sender's name on purpose: both answer "what shows on a viewer's stuff", and
          both overlays honour them. It used to sit inside the chat-overlay section, which hid it
          entirely whenever that overlay was off. */}
      <div className="py-3">
        <Switch
          icon="star"
          label={t('dash.showLevel')}
          checked={showLevel}
          onChange={(v) => flip(setShowLevel, 'chatShowLevel', v)}
        />
      </div>
      <div className="py-3">
        <Switch
          icon="volume-2"
          label={t('dash.soundAlert')}
          checked={soundAlert}
          onChange={(v) => flip(setSoundAlert, 'soundAlert', v)}
        />
      </div>
      <div className="py-3">
        <Switch
          icon="message-circle"
          label={t('dash.tts')}
          checked={ttsName}
          onChange={(v) => flip(setTtsName, 'ttsName', v)}
        />
      </div>
      <div className="py-3">
        <Switch
          icon="message-circle"
          label={t('dash.ttsMessage')}
          checked={ttsMessage}
          onChange={(v) => flip(setTtsMessage, 'ttsMessage', v)}
        />
      </div>
      {/* Volume affects all played media (incl. sent music), so it lives here, not under layout.
          Slider saves on release (onCommit) to match the block's instant-save without spamming. */}
      <div className="pt-3">
        <Slider
          icon="volume-3"
          label={t('dash.sliderVolume', { n: volume })}
          min={0}
          max={100}
          value={volume}
          onChange={setVolume}
          onCommit={(v) => onSave({ volume: v })}
        />
      </div>
    </Card>
  );
}
