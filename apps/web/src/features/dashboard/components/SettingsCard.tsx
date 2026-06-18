import { useState } from 'react';
import {
  CHANNEL_DESCRIPTION_MAX_LEN,
  CHANNEL_LINKS_MAX,
  OVERLAY_POSITIONS,
  positionToFlex,
  SOCIAL_PLATFORMS,
  type ChannelLink,
  type ChannelSettings,
  type OverlayPosition,
  type SocialPlatform,
} from '@tmw/shared';
import { useI18n } from '@/i18n';
import { PLATFORM_LABEL } from '@/lib/social';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Input, Select, Textarea } from '@/ui';

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
  const [description, setDescription] = useState(settings.description ?? '');
  const [links, setLinks] = useState<ChannelLink[]>(settings.links);
  const updateLink = (i: number, patch: Partial<ChannelLink>) =>
    setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLink = (i: number) => setLinks((ls) => ls.filter((_, j) => j !== i));
  const addLink = () => setLinks((ls) => [...ls, { platform: 'link', url: '' }]);
  return (
    <div>
      <label
        className={`flex w-max cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 label-mono ${
          settings.accepting
            ? 'border-ok/30 bg-ok-soft text-ok'
            : 'border-danger/30 bg-danger-soft text-danger'
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
          <div className="mt-6 border-t border-border pt-4">
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
          </div>
          <div className="mt-6 border-t border-border pt-4">
            <h3 className="mb-3">{t('dash.publicPage')}</h3>
            <label className="text-sm text-muted">
              <span>{t('dash.description')}</span>
              <Textarea
                className="mt-1"
                rows={2}
                maxLength={CHANNEL_DESCRIPTION_MAX_LEN}
                value={description}
                placeholder={t('dash.descriptionPlaceholder')}
                onChange={(e) => setDescription(e.target.value)}
              />
              <span className="mt-1 block text-right text-xs text-muted">
                {description.length}/{CHANNEL_DESCRIPTION_MAX_LEN}
              </span>
            </label>

            <div className="mt-3">
              <span className="text-sm text-muted">{t('dash.links')}</span>
              <div className="mt-1 flex flex-col gap-2">
                {links.map((link, i) => (
                  <div key={i} className="flex gap-2">
                    <Select
                      className="w-36 shrink-0"
                      label={t('dash.linkPlatform')}
                      value={link.platform}
                      onChange={(p) => updateLink(i, { platform: p as SocialPlatform })}
                      options={SOCIAL_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))}
                    />
                    <Input
                      className="flex-1"
                      type="url"
                      inputMode="url"
                      placeholder={t('dash.linkUrlPlaceholder')}
                      value={link.url}
                      onChange={(e) => updateLink(i, { url: e.target.value })}
                    />
                    <button
                      type="button"
                      aria-label={t('dash.removeLink')}
                      onClick={() => removeLink(i)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border text-muted transition-colors hover:border-danger hover:text-danger"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
              </div>
              {links.length < CHANNEL_LINKS_MAX && (
                <Button className="mt-2" onClick={addLink}>
                  <Icon name="folder-plus" size={16} />
                  {t('dash.addLink')}
                </Button>
              )}
            </div>
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
                  description: description.trim() || null,
                  links: links.filter((l) => l.url.trim()),
                })
              }
            >
              {t('dash.save')}
            </Button>
          </div>
    </div>
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
        className="mt-1 flex aspect-[16/9] w-full overflow-hidden border border-border bg-surface-2"
        style={{ justifyContent: justify, alignItems: align }}
      >
        <div
          className="flex shrink-0 items-center justify-center border border-accent bg-accent-soft text-[10px] text-accent"
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
