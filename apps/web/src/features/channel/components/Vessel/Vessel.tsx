import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { LiveStatus } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { disintegrate } from '@/lib/burst';
import { inhaleStars, launchKeepsake } from '@/components/BackgroundStars';
import { useFidgetEnabled } from '@/hooks/useFidgetEnabled';
import { IS_THEME_PREVIEW } from '../../lib/themeQuery';
import type { Phase } from '../../hooks/useMediaSubmission';
import { SCENE, sceneFromProps } from './phaseConfig';
import { lighten, rgba, rgbStr, tokens } from './tokens';
import { useLiquidEngine, type LiquidTarget } from './useLiquidEngine';

interface VesselProps {
  phase: Phase;
  status: LiveStatus | null;
  cooldownSec: number;
  /** Full cooldown window (sec) — normalizes the fill so a refresh shows the real fraction, not full. */
  cooldownWindowSec?: number;
  /** Form substrate under the liquid. */
  children: ReactNode;
}

/**
 * Vessel: submission lifecycle as animated liquid state.
 * Upload/processing fills card over form; peak (result arrived) bloats, bursts, reopens form.
 * Status phase: frame color/glow; cooldown: frame fill level top-down with shimmer. Physics gated by useFidgetEnabled + prefers-reduced-motion.
 */
export function Vessel({
  phase,
  status,
  cooldownSec,
  cooldownWindowSec = 0,
  children,
}: VesselProps) {
  const { t } = useI18n();
  // Static (plain div) inside the theme-preview iframe: the liquid rAF, on a scaled iframe layer,
  // re-composites every frame and tanks the dashboard's perf. Colors still read from tokens.
  const fidget = useFidgetEnabled() && !IS_THEME_PREVIEW;

  const scene = sceneFromProps(phase, status, cooldownSec);
  const cfg = SCENE[scene];
  const bodyMode = scene === 'uploading' || scene === 'processing';
  // Frame visible during status result or active cooldown.
  const frameMode = phase.name === 'done' || cooldownSec > 0;

  // Peak state: liquid bloated solid (before burst).
  const [flooding, setFlooding] = useState(false);

  // Cooldown window: divisor normalizes level 0..1. Prefer the real window (so a refresh with
  // partial time left renders the right fraction); else fall back to max seen this wait cycle.
  const cdWindow = useRef(0);
  if (cooldownSec === 0) {
    cdWindow.current = 0;
  } else {
    if (cooldownWindowSec > cdWindow.current) cdWindow.current = cooldownWindowSec;
    if (cooldownSec > cdWindow.current) cdWindow.current = cooldownSec;
  }
  const cdLevel = cdWindow.current > 0 ? cooldownSec / cdWindow.current : 0;

  const progress = phase.name === 'uploading' && phase.progress !== null ? phase.progress : 0;
  // At peak, level raised above bounds (waves crest, then burst).
  const level = flooding
    ? 1.15
    : bodyMode
      ? scene === 'uploading'
        ? progress
        : 1
      : cooldownSec > 0
        ? cdLevel
        : 0;
  const amp = flooding
    ? 5
    : bodyMode
      ? scene === 'processing'
        ? 6
        : 5
      : cooldownSec > 0
        ? 2.4
        : 0;
  const turb = !flooding && bodyMode && scene === 'processing';
  const color = flooding ? tokens().accent : tokens()[cfg.token];

  const cardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fillRef = useRef<SVGPathElement>(null);
  const clipRef = useRef<SVGPathElement>(null);
  const meniscusRef = useRef<SVGPathElement>(null);
  const stop0Ref = useRef<SVGStopElement>(null);
  const stop1Ref = useRef<SVGStopElement>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);
  const turbRef = useRef<SVGFETurbulenceElement>(null);
  const bubblesRef = useRef<SVGGElement>(null);
  const prevPhaseName = useRef(phase.name);
  const peakTimer = useRef<number | null>(null);

  const targetRef = useRef<LiquidTarget>({
    level: 0,
    color,
    amp: 0,
    turb: false,
    W: 0,
    H: 0,
    kick: false,
  });

  const wake = useLiquidEngine(
    {
      fill: fillRef,
      clip: clipRef,
      meniscus: meniscusRef,
      stop0: stop0Ref,
      stop1: stop1Ref,
      disp: dispRef,
      turbEl: turbRef,
      bubbles: bubblesRef,
    },
    targetRef,
    fidget,
  );

  // Card viewBox in px maps 1:1 to engine coordinate system.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const apply = () => {
      const w = card.clientWidth;
      const h = card.clientHeight;
      targetRef.current.W = w;
      targetRef.current.H = h;
      svgRef.current?.setAttribute('viewBox', `0 0 ${w} ${h}`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

  // Update liquid target on phase/level/color change; wake idle engine.
  useEffect(() => {
    const tg = targetRef.current;
    tg.level = level;
    tg.color = color;
    tg.amp = fidget ? amp : 0;
    tg.turb = fidget && turb;
    wake();
  }, [level, color, amp, turb, fidget, wake]);

  // Peak on done entry (result arrived): bloat ~420ms then burst with disintegrate.
  useEffect(() => {
    const entered = prevPhaseName.current !== 'done' && phase.name === 'done';
    prevPhaseName.current = phase.name;
    if (!entered || !fidget) return;
    setFlooding(true);
    if (peakTimer.current) clearTimeout(peakTimer.current);
    peakTimer.current = window.setTimeout(() => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        disintegrate(rect, 'approve');
        launchKeepsake({ x: rect.left + rect.width / 2, y: rect.top });
        inhaleStars();
      }
      setFlooding(false);
      peakTimer.current = null;
    }, 550);
  }, [phase.name, fidget]);

  // Cleanup peak timer on unmount.
  useEffect(
    () => () => {
      if (peakTimer.current) clearTimeout(peakTimer.current);
    },
    [],
  );

  // Burst disintegrate on reject/expire scene entry.
  useEffect(() => {
    if (!fidget) return;
    const burst = SCENE[scene].burst;
    if (!burst) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) disintegrate(rect, burst);
  }, [scene, fidget]);

  const pct = Math.round(progress * 100);
  const bodyLabel =
    scene === 'processing'
      ? t('channel.processingShort')
      : scene === 'uploading'
        ? t('channel.uploading', { pct })
        : '';

  const cardStyle: CSSProperties = {};
  (cardStyle as Record<string, string>)['--st'] = rgbStr(color);
  if (frameMode) cardStyle.borderColor = rgbStr(color);
  const frameCls = frameMode
    ? fidget
      ? `vessel-frame${scene === 'playing' ? ' vessel-frame-pulse' : ''}`
      : ''
    : 'border-border';

  return (
    <div
      ref={cardRef}
      style={cardStyle}
      className={`relative overflow-hidden rounded-none border p-5 transition-[border-color,box-shadow] duration-[var(--dur)] ${frameCls}`}
    >
      {frameMode && status && !flooding && (
        <span
          className="pointer-events-none absolute right-3 top-2 z-[6] label-mono text-[10px]"
          style={{ color: rgbStr(color) }}
        >
          {t(`status.${status}`)}
        </span>
      )}

      <div
        className={`relative z-[1] transition-opacity duration-[var(--dur)] ${
          bodyMode ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        {children}
      </div>

      {bodyMode && bodyLabel && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[5] -translate-y-1/2 text-center">
          <span className="label-mono text-xs" style={{ color: rgbStr(lighten(color, 0.2)) }}>
            {bodyLabel}
          </span>
        </div>
      )}

      {fidget ? (
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
        >
          <defs>
            <linearGradient id="vsl-grad" x1="0" y1="0" x2="0" y2="1">
              <stop ref={stop0Ref} offset="0" stopColor={rgbStr(color)} stopOpacity="0.6" />
              <stop ref={stop1Ref} offset="1" stopColor={rgbStr(color)} stopOpacity="0.16" />
            </linearGradient>
            <pattern
              id="vsl-hatch"
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(119)"
            >
              <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-accent)" strokeWidth="1" />
            </pattern>
            <filter id="vsl-wobble" x="-12%" y="-12%" width="124%" height="124%">
              <feTurbulence
                ref={turbRef}
                type="fractalNoise"
                baseFrequency="0.012 0.02"
                numOctaves="2"
                seed="4"
                result="n"
              />
              <feDisplacementMap
                ref={dispRef}
                in="SourceGraphic"
                in2="n"
                scale="0"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <clipPath id="vsl-clip">
              <path ref={clipRef} d="" />
            </clipPath>
          </defs>

          <g
            className="transition-opacity duration-[var(--dur)]"
            style={{ opacity: bodyMode || flooding ? 1 : 0 }}
          >
            <g filter={turb ? 'url(#vsl-wobble)' : undefined}>
              <path ref={fillRef} d="" fill="url(#vsl-grad)" />
              <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="url(#vsl-hatch)"
                opacity="0.08"
                clipPath="url(#vsl-clip)"
              />
              <g ref={bubblesRef} clipPath="url(#vsl-clip)" />
              <path
                ref={meniscusRef}
                d=""
                fill="none"
                stroke={rgbStr(lighten(color, 0.35))}
                strokeWidth="1.5"
              />
            </g>
          </g>

          <g
            className="transition-opacity duration-[var(--dur)]"
            style={{ opacity: frameMode && !flooding ? 1 : 0 }}
          >
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="none"
              stroke="var(--st)"
              strokeWidth="2"
              opacity="0.3"
            />
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="none"
              stroke="var(--st)"
              strokeWidth="4"
              clipPath="url(#vsl-clip)"
            />
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="none"
              stroke={rgbStr(lighten(color, 0.4))}
              strokeWidth="2"
              strokeDasharray="14 120"
              clipPath="url(#vsl-clip)"
              className={cooldownSec > 0 ? 'vessel-flow' : ''}
            />
          </g>
        </svg>
      ) : (
        bodyMode && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] transition-[height] duration-[var(--dur)] ease-out"
            style={{
              height: `${Math.round(level * 100)}%`,
              background: rgba(color, 0.42),
              borderTop: `2px solid ${rgbStr(lighten(color, 0.35))}`,
            }}
          />
        )
      )}
    </div>
  );
}
