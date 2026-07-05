import { useState } from 'react';
import {
  OVERLAY_POSITIONS,
  positionToFlex,
  type ChannelSettings,
  type OverlayPosition,
} from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Card } from '@/ui';

/** Configure overlay display: duration, size, position, volume, TTS, alerts. */
export function OverlaySettings({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: (patch: Partial<ChannelSettings>) => void;
}) {
  const { t } = useI18n();
  const [maxDurS, setMaxDurS] = useState(Math.round(settings.maxDurationMs / 1000));
  const [maxAudioMin, setMaxAudioMin] = useState(
    Math.min(10, Math.max(1, Math.round(settings.maxAudioDurationMs / 60_000))),
  );
  const [maxSizeMb, setMaxSizeMb] = useState(Math.round(settings.maxFileSizeBytes / 1024 / 1024));
  const [volume, setVolume] = useState(settings.volume);
  const [showSender, setShowSender] = useState(settings.showSenderName);
  const [soundAlert, setSoundAlert] = useState(settings.soundAlert);
  const [ttsName, setTtsName] = useState(settings.ttsName);
  const [ttsMessage, setTtsMessage] = useState(settings.ttsMessage);
  const [chatOverlay, setChatOverlay] = useState(settings.chatOverlayEnabled);
  const [chatFont, setChatFont] = useState(settings.chatFontSize);
  const [chatFade, setChatFade] = useState(settings.chatFadeSeconds);
  const [position, setPosition] = useState<OverlayPosition>(settings.overlayPosition);
  const [mediaSize, setMediaSize] = useState(settings.overlaySize);
  const [margin, setMargin] = useState(settings.overlayMargin);
  const [musicSeparate, setMusicSeparate] = useState(settings.musicSeparate);
  const [musicPos, setMusicPos] = useState<OverlayPosition>(settings.musicPosition);
  const [musicMargin, setMusicMargin] = useState(settings.musicMargin);

  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          icon="image"
          label={t('dash.sliderVideo', { n: maxDurS })}
          min={1}
          max={60}
          value={maxDurS}
          onChange={setMaxDurS}
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
        <Slider
          icon="volume-3"
          label={t('dash.sliderVolume', { n: volume })}
          min={0}
          max={100}
          value={volume}
          onChange={setVolume}
        />
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <h3 className="mb-3">{t('dash.layout')}</h3>
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
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
        <div className="mt-4">
          <Toggle
            checked={musicSeparate}
            onChange={setMusicSeparate}
            label={t('dash.musicSeparate')}
          />
        </div>
        {musicSeparate && (
          <div className="mt-3 border-l border-accent/40 pl-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-accent">
              <Icon name="volume-2" size={15} />
              {t('dash.musicLayout')}
            </h4>
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
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Slider
                icon="monitor"
                label={t('dash.sliderMargin', { n: musicMargin })}
                min={0}
                max={25}
                value={musicMargin}
                onChange={setMusicMargin}
              />
            </div>
            <p className="mt-2 text-xs text-muted">{t('dash.musicSizeNote')}</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Toggle checked={showSender} onChange={setShowSender} label={t('dash.showSender')} />
        <Toggle checked={soundAlert} onChange={setSoundAlert} label={t('dash.soundAlert')} />
        <Toggle checked={ttsName} onChange={setTtsName} label={t('dash.tts')} />
        <Toggle checked={ttsMessage} onChange={setTtsMessage} label={t('dash.ttsMessage')} />
        <Toggle checked={chatOverlay} onChange={setChatOverlay} label={t('dash.chatOverlay')} />
        <p className="pl-6 text-xs text-muted">{t('dash.chatOverlayNote')}</p>
        {chatOverlay && (
          <div className="mt-2 grid gap-4 border-l border-accent/40 pl-4 sm:grid-cols-2">
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
              label={
                chatFade === 0 ? t('dash.chatFadeOff') : t('dash.chatFade', { n: chatFade })
              }
              min={0}
              max={120}
              value={chatFade}
              onChange={setChatFade}
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          onClick={() =>
            onSave({
              maxDurationMs: maxDurS * 1000,
              maxAudioDurationMs: maxAudioMin * 60_000,
              maxFileSizeBytes: maxSizeMb * 1024 * 1024,
              volume,
              showSenderName: showSender,
              soundAlert,
              ttsName,
              ttsMessage,
              chatOverlayEnabled: chatOverlay,
              chatFontSize: chatFont,
              chatFadeSeconds: chatFade,
              overlayPosition: position,
              overlaySize: mediaSize,
              overlayMargin: margin,
              musicSeparate,
              musicPosition: musicPos,
              musicMargin,
            })
          }
        >
          {t('dash.save')}
        </Button>
      </div>
    </Card>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
}

function Slider({
  icon,
  label,
  min,
  max,
  value,
  onChange,
}: {
  icon: IconName;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-sm text-muted">
      <span className="flex items-center gap-1.5">
        <Icon name={icon} size={15} />
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}

/** 3×3 position anchor grid; dot position matches corner via positionToFlex. */
function PositionGrid({
  value,
  onChange,
}: {
  value: OverlayPosition;
  onChange: (p: OverlayPosition) => void;
}) {
  return (
    <div className="mt-1 grid w-max grid-cols-3 gap-1">
      {OVERLAY_POSITIONS.map((p) => {
        const { justify, align } = positionToFlex(p);
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            aria-label={p}
            aria-pressed={active}
            onClick={() => onChange(p)}
            style={{ justifyContent: justify, alignItems: align }}
            className={`flex h-9 w-9 cursor-pointer border p-1.5 transition-colors ${
              active
                ? 'border-accent bg-accent-soft'
                : 'border-border bg-surface-2 hover:border-accent'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${active ? 'bg-accent' : 'bg-muted'}`} />
          </button>
        );
      })}
    </div>
  );
}

/** 16:9 preview of media placeholder with current position/size/margin. */
function LayoutPreview({
  position,
  size,
  margin,
  label,
}: {
  position: OverlayPosition;
  size: number;
  margin: number;
  label: string;
}) {
  const { t } = useI18n();
  const { justify, align } = positionToFlex(position);
  return (
    <div>
      <span className="text-sm text-muted">{t('dash.preview')}</span>
      <div
        className="mt-1 flex aspect-[16/9] w-full overflow-hidden border border-border bg-surface-2"
        style={{ justifyContent: justify, alignItems: align }}
      >
        <div
          className="flex shrink-0 items-center justify-center border border-accent bg-accent-soft text-[10px] text-accent"
          style={{
            width: `${size}%`,
            height: `${size}%`,
            marginInline: `${margin}%`,
            marginBlock: `${(margin * 9) / 16}%`,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
