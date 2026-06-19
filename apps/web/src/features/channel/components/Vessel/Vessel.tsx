import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { LiveStatus } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { disintegrate } from '@/lib/burst';
import { inhaleStars, launchKeepsake } from '@/components/BackgroundStars';
import { useFidgetEnabled } from '@/hooks/useFidgetEnabled';
import type { Phase } from '../../hooks/useMediaSubmission';
import { SCENE, sceneFromProps } from './phaseConfig';
import { lighten, rgba, rgbStr, tokens } from './tokens';
import { useLiquidEngine, type LiquidTarget } from './useLiquidEngine';

interface VesselProps {
  phase: Phase;
  status: LiveStatus | null;
  cooldownSec: number;
  /** Форма отправки — субстрат под жидкостью. */
  children: ReactNode;
}

/**
 * «Сосуд»: жизненный цикл отправки зрителя как одна жидкость.
 * - Загрузка/обработка — жидкость заливает карточку поверх формы (форма не нужна — пост уже ушёл).
 * - ПИК «результат пришёл» (сразу после обработки — гарантированно виден): вода вздувается в
 *   сплошной мятный цвет → распадается на брызги (+ комета в небо), и форма ОТКРЫВАЕТСЯ.
 * - Дальше — статус = цвет рамки + свечение; таймер кулдауна = уровень рамки, сливающийся
 *   сверху вниз, с бегущим бликом (текущая вода). Форма доступна для ввода всё ожидание.
 * Живая физика за useFidgetEnabled + prefers-reduced-motion (фолбэк — статичная цветная рамка).
 */
export function Vessel({ phase, status, cooldownSec, children }: VesselProps) {
  const { t } = useI18n();
  const fidget = useFidgetEnabled();

  const scene = sceneFromProps(phase, status, cooldownSec);
  const cfg = SCENE[scene];
  const bodyMode = scene === 'uploading' || scene === 'processing';
  // Рамка: пока есть результат отправки (статус) и/или активен кулдаун.
  const frameMode = phase.name === 'done' || cooldownSec > 0;

  // Переходный «пик»: вода вздулась в сплошной цвет и вот-вот распадётся на брызги.
  const [flooding, setFlooding] = useState(false);

  // Окно кулдауна: знаменатель уровня = максимум, увиденный за цикл ожидания.
  const cdWindow = useRef(0);
  if (cooldownSec > cdWindow.current) cdWindow.current = cooldownSec;
  if (cooldownSec === 0) cdWindow.current = 0;
  const cdLevel = cdWindow.current > 0 ? cooldownSec / cdWindow.current : 0;

  const progress = phase.name === 'uploading' && phase.progress !== null ? phase.progress : 0;
  // На пике — уровень поднят ВЫШЕ краёв, волны уходят за верх (сплошная, но прозрачная вода).
  const level = flooding ? 1.15 : bodyMode ? (scene === 'uploading' ? progress : 1) : cooldownSec > 0 ? cdLevel : 0;
  const amp = flooding ? 5 : bodyMode ? (scene === 'processing' ? 6 : 5) : cooldownSec > 0 ? 2.4 : 0;
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

  // viewBox карточки в px → система координат движка (1:1).
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

  // Цель жидкости при смене фазы/уровня/цвета — и будим уснувший движок.
  useEffect(() => {
    const tg = targetRef.current;
    tg.level = level;
    tg.color = color;
    tg.amp = fidget ? amp : 0;
    tg.turb = fidget && turb;
    wake();
  }, [level, color, amp, turb, fidget, wake]);

  // ПИК «результат пришёл»: на входе в done (сразу после обработки) вода вздувается в сплошной
  // цвет и через ~420мс распадается на мятные брызги + комета в небо. Гарантированно виден.
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

  // Очистка таймера пика только при размонтировании.
  useEffect(() => () => { if (peakTimer.current) clearTimeout(peakTimer.current); }, []);

  // Распад на красные/жёлтые осколки при отклонении/истечении (вход в фазу).
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
      {/* Текстовый статус на верхней кромке (цвет рамки несёт основной сигнал). */}
      {frameMode && status && !flooding && (
        <span
          className="pointer-events-none absolute right-3 top-2 z-[6] label-mono text-[10px]"
          style={{ color: rgbStr(color) }}
        >
          {t(`status.${status}`)}
        </span>
      )}

      {/* Форма-субстрат: затемнена и заблокирована ТОЛЬКО на заливке/обработке. */}
      <div
        className={`relative z-[1] transition-opacity duration-[var(--dur)] ${
          bodyMode ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        {children}
      </div>

      {/* Подпись по центру на время заливки/обработки. */}
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

          {/* Полная заливка — загрузка/обработка и пик-вздутие. */}
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

          {/* Жидкая рамка — статус + таймер (форма открыта под ней). */}
          <g
            className="transition-opacity duration-[var(--dur)]"
            style={{ opacity: frameMode && !flooding ? 1 : 0 }}
          >
            {/* Слабый полный контур статуса — виден всегда. */}
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
            {/* Налитый уровень: контур, обрезанный под ватерлинию (слив сверху вниз). */}
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
            {/* Бегущий блик — ощущение текущей воды (только пока есть налитый уровень). */}
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
