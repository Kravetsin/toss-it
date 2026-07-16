import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BRAND_HUE, hexToHue, type ChannelSettings, type ChannelTheme } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { Button, Card, Input } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';

const BRAND_HUE_INT = Math.round(BRAND_HUE);
// The channel page's real layout size. Height reaches past the send button (its bottom sits at
// ~765), since that button is the biggest accent surface on the page.
const PREVIEW_W = 1180;
const PREVIEW_H = 880;

/** Page-color constructor: the streamer moves hues, we own lightness (see @tmw/shared resolveTheme).
 *  The preview is the real /c/:login in an iframe, themed live over postMessage — so it's exactly
 *  what viewers get, with no separate mock to drift out of sync.
 *
 *  No on/off switches: a hue only applies once it's moved (accentHue stays null until then), the
 *  strength slider's own 0 is the backdrop's off, and Reset clears both. */
export function ChannelThemeSettings({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: (patch: Partial<ChannelSettings>) => void;
}) {
  const { t } = useI18n();
  const { me } = useMe();
  const login = me?.user?.login ?? '';
  const [accentHue, setAccentHue] = useState<number | null>(settings.theme.accentHue);
  const [bgHue, setBgHue] = useState<number | null>(settings.theme.bgHue);
  const [bgTint, setBgTint] = useState(settings.theme.bgTint);

  const theme: ChannelTheme = { accentHue, bgHue: bgTint > 0 ? (bgHue ?? 210) : null, bgTint };

  // iframe src is fixed at the initially-saved theme (correct first paint); live edits go over
  // postMessage so the frame never reloads mid-drag.
  const srcRef = useRef<string | null>(null);
  if (srcRef.current === null && login) {
    const p = new URLSearchParams({ themePreview: '1' });
    if (settings.theme.accentHue !== null) p.set('accentHue', String(settings.theme.accentHue));
    if (settings.theme.bgHue !== null) p.set('bgHue', String(settings.theme.bgHue));
    p.set('bgTint', String(settings.theme.bgTint));
    srcRef.current = `/c/${login}?${p}`;
  }

  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Throttle to ~1 post per frame, always carrying the newest value: a dragged range input fires
  // faster than the preview can repaint, and that backlog is what made fast drags stutter.
  // Deliberately a timestamp + trailing timeout rather than rAF: rAF never fires in a background
  // tab, so an "already scheduled" guard could latch on forever and freeze the preview for good.
  const nextTheme = useRef(theme);
  nextTheme.current = theme;
  const lastPostRef = useRef(0);
  const timerRef = useRef(0);
  const postTheme = () => {
    const send = () => {
      lastPostRef.current = performance.now();
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'tossit:theme', theme: nextTheme.current },
        window.location.origin,
      );
    };
    window.clearTimeout(timerRef.current);
    const since = performance.now() - lastPostRef.current;
    if (since >= 16) send();
    else timerRef.current = window.setTimeout(send, 16 - since);
  };
  useEffect(postTheme, [accentHue, bgHue, bgTint]);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const reset = () => {
    setAccentHue(null);
    setBgHue(null);
    setBgTint(0);
  };
  const pasteHex = (raw: string) => {
    const hue = hexToHue(raw);
    if (hue !== null) setAccentHue(Math.round(hue));
  };

  return (
    <Card>
      <div className="mb-3">
        <span className="block text-sm text-text">{t('theme.title')}</span>
        <span className="mt-0.5 block text-xs text-muted">{t('theme.subtitle')}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="flex flex-col gap-4">
          <Section icon="star" title={t('theme.accentOn')} hint={t('theme.accentHint')}>
            <HueSlider
              label={t('theme.hue')}
              value={accentHue ?? BRAND_HUE_INT}
              onChange={setAccentHue}
            />
            <div className="flex items-center gap-2">
              <Input
                className="w-32"
                placeholder="#8df0cc"
                aria-label={t('theme.hexPaste')}
                onChange={(e) => {
                  if (e.target.value.replace('#', '').length >= 6) pasteHex(e.target.value);
                }}
              />
              <span className="text-xs text-muted">{t('theme.hexPaste')}</span>
            </div>
          </Section>

          <Section icon="image" title={t('theme.backdropOn')} hint={t('theme.backdropHint')}>
            <HueSlider label={t('theme.hue')} value={bgHue ?? 210} onChange={setBgHue} />
            <RangeRow
              label={t('theme.tint')}
              min={0}
              max={100}
              value={bgTint}
              onChange={setBgTint}
            />
          </Section>

          <div className="flex items-center gap-2">
            <Button onClick={reset}>{t('theme.reset')}</Button>
            <Button variant="primary" className="ml-auto" onClick={() => onSave({ theme })}>
              {t('dash.save')}
            </Button>
          </div>
        </div>

        <PreviewFrame
          ref={iframeRef}
          src={srcRef.current}
          onReady={postTheme}
          label={t('theme.previewLabel')}
        />
      </div>
    </Card>
  );
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: IconName;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-text">{title}</span>
          <span className="mt-0.5 block text-xs text-muted">{hint}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-2 pl-1">{children}</div>
    </div>
  );
}

/** The real channel page, scaled to fit the settings column; sticky so it stays in view while the
 *  controls are adjusted. */
function PreviewFrame({
  ref,
  src,
  onReady,
  label,
}: {
  ref: React.Ref<HTMLIFrameElement>;
  src: string | null;
  onReady: () => void;
  label: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => setScale(box.clientWidth / PREVIEW_W));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="lg:sticky lg:top-3 lg:self-start">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div
        ref={boxRef}
        className="relative overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-2"
        style={{ height: PREVIEW_H * scale }}
      >
        {src && (
          <iframe
            ref={ref}
            src={src}
            title={label}
            tabIndex={-1}
            onLoad={onReady}
            // Absolutely positioned so its full 1180px width doesn't inflate the grid column
            // (transform: scale keeps the layout box at 1180px); the box clips the scaled result.
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: PREVIEW_W,
              height: PREVIEW_H,
              border: 0,
              transform: `scale(${scale})`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}

function HueSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-sm text-muted">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="text-xs">{value}°</span>
      </span>
      <input
        type="range"
        min={0}
        max={359}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background:
            'linear-gradient(to right, oklch(0.8 0.12 0), oklch(0.8 0.12 60), oklch(0.8 0.12 120), oklch(0.8 0.12 180), oklch(0.8 0.12 240), oklch(0.8 0.12 300), oklch(0.8 0.12 360))',
        }}
      />
    </label>
  );
}

function RangeRow({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <label className="text-sm text-muted">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="text-xs">{value}%</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-star mt-1"
        style={{ ['--val' as string]: `${pct}%` }}
      />
    </label>
  );
}
