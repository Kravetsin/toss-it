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

export function SettingsCard({
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
  const [position, setPosition] = useState<OverlayPosition>(settings.overlayPosition);
  const [mediaSize, setMediaSize] = useState(settings.overlaySize);
  const [margin, setMargin] = useState(settings.overlayMargin);
  const [musicSeparate, setMusicSeparate] = useState(settings.musicSeparate);
  const [musicPos, setMusicPos] = useState<OverlayPosition>(settings.musicPosition);
  const [musicMargin, setMusicMargin] = useState(settings.musicMargin);
  // Карточка настроек большая и заслоняет очередь модерации — по умолчанию свёрнута.
  // Состояние помним в localStorage, чтобы не сворачивалось при каждом заходе.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('tmw_settings_open') === '1';
    } catch {
      return false;
    }
  });
  const toggleOpen = () =>
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem('tmw_settings_open', next ? '1' : '0');
      } catch {
        /* приватный режим — не критично */
      }
      return next;
    });

  return (
    <Card>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className="flex cursor-pointer items-center gap-2"
        >
          <Icon
            name="play"
            size={13}
            className={`transition-transform text-muted ${open ? 'rotate-90' : ''}`}
          />
          <h2>{t('dash.settings')}</h2>
        </button>
        <label
          className={`flex cursor-pointer items-center gap-2 border-2 px-3 py-1.5 text-sm font-semibold ${
            settings.accepting ? 'border-ok/40 bg-ok/15 text-ok' : 'border-danger/40 bg-danger/15 text-danger'
          }`}
        >
          <input
            type="checkbox"
            checked={settings.accepting}
            onChange={(e) => onSave({ accepting: e.target.checked })}
            className="accent-current"
          />
          {settings.accepting ? t('dash.accepting') : t('dash.acceptingOff')}
        </label>
      </div>
      {open && (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
          <div className="mt-6 border-t-2 border-line pt-4">
            <h3 className="mb-3">{t('dash.layout')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="text-sm text-muted">{t('dash.position')}</span>
                <PositionGrid value={position} onChange={setPosition} />
              </div>
              <LayoutPreview position={position} size={mediaSize} margin={margin} label={t('dash.previewMedia')} />
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
              <Toggle checked={musicSeparate} onChange={setMusicSeparate} label={t('dash.musicSeparate')} />
            </div>
            {musicSeparate && (
              <div className="mt-3 border-l-2 border-twitch/40 pl-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-twitch-light">
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
        </>
      )}
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
        className="accent-twitch"
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
        className="mt-1 w-full accent-twitch"
      />
    </label>
  );
}

/** Сетка 3×3 якорей. Точка в каждой кнопке стоит в соответствующем углу (через positionToFlex). */
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
            className={`flex h-9 w-9 cursor-pointer border-2 p-1.5 ${
              active
                ? 'border-twitch-dark bg-twitch/30'
                : 'border-line bg-surface-2 hover:border-twitch-light'
            }`}
          >
            <span className={`h-2 w-2 ${active ? 'bg-twitch-light' : 'bg-muted'}`} />
          </button>
        );
      })}
    </div>
  );
}

/** Мини-превью 16:9: плейсхолдер медиа в текущей позиции/размере/отступе (тот же positionToFlex). */
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
        className="scanlines mt-1 flex aspect-[16/9] w-full overflow-hidden border-2 border-line bg-surface-2"
        style={{ justifyContent: justify, alignItems: align }}
      >
        <div
          className="flex shrink-0 items-center justify-center border border-twitch-light bg-twitch/60 text-[10px] text-white"
          style={{
            // Размер — от всего бокса (как медиа от вьюпорта), не от области внутри отступа.
            width: `${size}%`,
            height: `${size}%`,
            // Отступ прижимает к краю, НЕ меняя размер. % margin относителен ширины,
            // поэтому для вертикали умножаем на 9/16, чтобы попасть в vh-отступ оверлея.
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
