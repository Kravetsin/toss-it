import { useState } from 'react';
import type { ChannelSettings, OverlayPosition } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Button, Switch } from '@/ui';
import { LayoutPreview, PositionGrid, Slider } from './controls';

type Save = (patch: Partial<ChannelSettings>) => void;

function SaveRow({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex justify-end">
      <Button variant="primary" onClick={onClick}>
        {t('dash.save')}
      </Button>
    </div>
  );
}

/** Where media appears on the overlay: position anchor, size, margin, playback volume. */
export function MediaLayoutSettings({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: Save;
}) {
  const { t } = useI18n();
  const [position, setPosition] = useState<OverlayPosition>(settings.overlayPosition);
  const [mediaSize, setMediaSize] = useState(settings.overlaySize);
  const [margin, setMargin] = useState(settings.overlayMargin);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="text-sm text-muted">{t('dash.position')}</span>
          <PositionGrid value={position} onChange={setPosition} />
        </div>
        <LayoutPreview
          position={position}
          size={mediaSize}
          margin={margin}
          label={t('dash.previewMedia')}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          icon="image"
          label={t('dash.sliderMediaSize', { n: mediaSize })}
          min={10}
          max={100}
          value={mediaSize}
          onChange={setMediaSize}
        />
        <Slider
          icon="monitor"
          label={t('dash.sliderMargin', { n: margin })}
          min={0}
          max={25}
          value={margin}
          onChange={setMargin}
        />
      </div>
      <SaveRow
        onClick={() =>
          onSave({ overlayPosition: position, overlaySize: mediaSize, overlayMargin: margin })
        }
      />
    </div>
  );
}

/** Background music player: its own on-screen position (default) or shared with media. */
export function MusicSettings({ settings, onSave }: { settings: ChannelSettings; onSave: Save }) {
  const { t } = useI18n();
  const [separate, setSeparate] = useState(settings.musicSeparate);
  const [musicPos, setMusicPos] = useState<OverlayPosition>(settings.musicPosition);
  const [musicMargin, setMusicMargin] = useState(settings.musicMargin);
  return (
    <div className="flex flex-col gap-4">
      <Switch
        icon="volume-2"
        label={t('dash.musicSeparate')}
        description={t('settings.musicSeparateNote')}
        checked={separate}
        onChange={setSeparate}
      />
      {separate && (
        <div className="flex flex-col gap-4 border-l border-accent/40 pl-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="text-sm text-muted">{t('dash.positionShort')}</span>
              <PositionGrid value={musicPos} onChange={setMusicPos} />
            </div>
            <LayoutPreview
              position={musicPos}
              size={22}
              margin={musicMargin}
              label={t('dash.previewMusic')}
            />
          </div>
          <Slider
            icon="monitor"
            label={t('dash.sliderMargin', { n: musicMargin })}
            min={0}
            max={25}
            value={musicMargin}
            onChange={setMusicMargin}
          />
          <p className="text-xs text-muted">{t('dash.musicSizeNote')}</p>
        </div>
      )}
      <SaveRow
        onClick={() => onSave({ musicSeparate: separate, musicPosition: musicPos, musicMargin })}
      />
    </div>
  );
}

/** Chat overlay toggle + its font size and fade. (Grows over time.) */
export function ChatSettings({ settings, onSave }: { settings: ChannelSettings; onSave: Save }) {
  const { t } = useI18n();
  const [chatOverlay, setChatOverlay] = useState(settings.chatOverlayEnabled);
  const [chatFont, setChatFont] = useState(settings.chatFontSize);
  const [chatFade, setChatFade] = useState(settings.chatFadeSeconds);
  return (
    <div className="flex flex-col gap-4">
      <Switch
        icon="message-circle"
        label={t('dash.chatOverlay')}
        description={t('dash.chatOverlayNote')}
        checked={chatOverlay}
        onChange={setChatOverlay}
      />
      {chatOverlay && (
        <div className="grid gap-4 border-l border-accent/40 pl-4 sm:grid-cols-2">
          <Slider
            icon="message-circle"
            label={t('dash.chatFont', { n: chatFont })}
            min={12}
            max={40}
            value={chatFont}
            onChange={setChatFont}
          />
          <Slider
            icon="clock"
            label={chatFade === 0 ? t('dash.chatFadeOff') : t('dash.chatFade', { n: chatFade })}
            min={0}
            max={120}
            value={chatFade}
            onChange={setChatFade}
          />
        </div>
      )}
      <SaveRow
        onClick={() =>
          onSave({
            chatOverlayEnabled: chatOverlay,
            chatFontSize: chatFont,
            chatFadeSeconds: chatFade,
          })
        }
      />
    </div>
  );
}
