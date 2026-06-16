import { useEffect, useRef, useState } from 'react';
import { ICONS, Icon, type IconName } from './icons';
import { useI18n } from './i18n';

/**
 * Анимация «как это работает» под кнопками входа: пиксельный объект стоит по центру,
 * а «дорожка» этапов проезжает под ним (загрузка → обработка → модерация → на стриме).
 * Объект собирается из облака пикселей и держит форму на каждом этапе.
 *
 * Авто-проигрыш по времени с плавным easing: проход вперёд (загрузка → эфир) с развилкой
 * у модерации, затем быстрый возврат кучки одной дугой прямо в начало (без отмотки станций).
 * Одинаково на десктопе и мобиле, без привязки к скроллу (поэтому никаких рывков от колеса).
 * Крутится только пока секция в зоне видимости; при prefers-reduced-motion — статичная полоса.
 */

const STAGE_ICONS: IconName[] = ['upload', 'loader', 'shield', 'play'];
const SVGNS = 'http://www.w3.org/2000/svg';

const CX = 340;
const BASE_Y = 128;
const WS = [0, 220, 440, 660, 900]; // мировые X станций: [кучка, загрузка, обработка, модерация, на стриме]
const STATION_X = [220, 440, 660, 900];
const N = 46;
// Чередование «пауза на этапе» (h) и «перелёт» (t). Паузы дают форме собраться и читаться.
const PHASES: Array<['h', number] | ['t', number, number]> = [
  ['h', 0], ['t', 0, 1], ['h', 1], ['t', 1, 2], ['h', 2], ['t', 2, 3], ['h', 3], ['t', 3, 4], ['h', 4],
];
const WEIGHTS = [0.7, 1.15, 0.95, 1.15, 0.95, 1.15, 0.95, 1.15, 1.05];
const FWD_DUR = 6500; // длительность прохода вперёд (загрузка → эфир), мс
const RETURN_DUR = 1000; // быстрый возврат кучки прямо в начало (без станций), мс
const RETURN_HOP = 64; // высота дуги возврата
const END_PAUSE = 900; // пауза на результате (в эфире / отклонено) перед возвратом, мс
const START_PAUSE = 400; // короткая пауза в начале перед новым проходом, мс

// Развилка на станции модерации: исход выбирается раз за проход (forward), держится
// весь forward+reverse, поэтому frame(p, verdict) остаётся чистой функцией и реверс
// (ping-pong) проигрывается без рывка. Порядок подобран так, что первый показ гостю —
// всегда «одобрено», а «отклонено» выпадает раз в 4 прохода.
const APPROVE = 0;
const REJECT = 1;
const TRUST = 2;
const ORDER = [APPROVE, TRUST, APPROVE, REJECT];
const TRUST_HOP = 92; // высота дуги, по которой «свой» перелетает ПОВЕРХ щита
const REJECT_RECOIL = 40; // отскок влево от щита
const REJECT_DIP = 14; // просадка к дорожке на отскоке
const REJECT_SCAT = 34; // как сильно пиксели рассыпаются и собираются обратно

/** Трапеция 0→1→0: плавный заход [a,b], плато, плавный выход [c,d]. Для прозрачности стампов. */
const pulse = (x: number, a: number, b: number, c: number, d: number) =>
  x < a ? 0 : x < b ? (x - a) / (b - a) : x < c ? 1 : x < d ? 1 - (x - c) / (d - c) : 0;

type Pt = [number, number];

function buildTimeline() {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  const cum = [0];
  let run = 0;
  for (const w of WEIGHTS) {
    run += w / total;
    cum.push(run);
  }
  return cum;
}

/** Пиксельные точки формы — сэмплируем заливку path иконки на офскрин-канвасе. */
function sampleShape(ctx: CanvasRenderingContext2D, d: string): Pt[] {
  const path = new Path2D(d);
  const raw: Pt[] = [];
  for (let y = 1; y < 24; y += 1.15) {
    for (let x = 1; x < 24; x += 1.15) {
      if (ctx.isPointInPath(path, x, y)) raw.push([x, y]);
    }
  }
  const step = Math.max(1, Math.ceil(raw.length / N));
  const out: Pt[] = [];
  for (let i = 0; i < raw.length; i += step) {
    const pt = raw[i]!;
    out.push([(pt[0] - 12) * 1.65, (pt[1] - 12) * 1.65]);
  }
  if (out.length < 6) return [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, 0], [0, -6]];
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export function ScrollFlow() {
  const { t } = useI18n();
  const [reduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const stages = [1, 2, 3, 4].map((n) => ({ name: t(`flow.s${n}`), cap: t(`flow.c${n}`) }));

  const sectionRef = useRef<HTMLElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const partsRef = useRef<SVGGElement>(null);
  const monRef = useRef<SVGRectElement>(null);
  const nameRefs = useRef<(SVGTextElement | null)[]>([]);
  const tickRefs = useRef<(SVGRectElement | null)[]>([]);
  // Стампы-вердикты, всплывающие над щитом: ✓ одобрено, ✕ отклонено, ★ свой (без проверки).
  const checkRef = useRef<SVGGElement>(null);
  const closeRef = useRef<SVGGElement>(null);
  const starRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (reduced) return;
    const world = worldRef.current;
    const parts = partsRef.current;
    const section = sectionRef.current;
    if (!world || !parts || !section) return;

    const cv = document.createElement('canvas');
    cv.width = 24;
    cv.height = 24;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const cluster: Pt[] = [];
    for (let c = 0; c < 42; c++) {
      const ang = c * 2.39996;
      const rad = 13.5 * Math.sqrt((c + 1) / 42);
      cluster.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
    }
    const shapes: Pt[][] = [cluster, ...STAGE_ICONS.map((name) => sampleShape(ctx, ICONS[name]!.join(' ')))];
    const cum = buildTimeline();
    // Регион «модерации»: TRUST перелетает 440→900 поверх щита (фазы 5–7);
    // REJECT отскакивает у щита и не идёт к монитору (фазы 6–8).
    const tStart = cum[5]!,
      tEnd = cum[8]!;
    const rStart = cum[6]!,
      rEnd = cum[9]!;

    const rects: SVGRectElement[] = [];
    const rnd: Pt[] = [];
    for (let k = 0; k < N; k++) {
      const r = document.createElementNS(SVGNS, 'rect');
      r.setAttribute('width', '2.7');
      r.setAttribute('height', '2.7');
      r.setAttribute('fill', k % 4 === 0 ? '#22d3ee' : '#67e8f9');
      r.style.animation = `flow-shim ${(0.9 + (k % 6) * 0.11).toFixed(2)}s ease-in-out infinite`;
      parts.appendChild(r);
      rects.push(r);
      rnd.push([Math.random() * 2 - 1, Math.random() * 2 - 1]);
    }

    function frame(p: number, verdict: number) {
      if (p < 0) p = 0;
      if (p > 1) p = 1;
      let i = 0;
      for (; i < PHASES.length; i++) if (p < cum[i + 1]!) break;
      if (i >= PHASES.length) i = PHASES.length - 1;
      let lt = (p - cum[i]!) / (cum[i + 1]! - cum[i]!);
      if (lt < 0) lt = 0;
      if (lt > 1) lt = 1;
      const ph = PHASES[i]!;
      let from: Pt[], to: Pt[], e: number, wsCur: number, hop: number, scat: number, active: number;
      if (ph[0] === 'h') {
        const s = ph[1];
        from = to = shapes[s]!;
        e = 0;
        wsCur = WS[s]!;
        hop = 0;
        scat = 0;
        active = s;
      } else {
        const f = ph[1];
        const tt = ph[2];
        from = shapes[f]!;
        to = shapes[tt]!;
        e = smooth(lt);
        wsCur = WS[f]! + (WS[tt]! - WS[f]!) * e;
        hop = 46 * Math.sin(Math.PI * lt);
        scat = 27 * Math.sin(Math.PI * lt);
        active = tt;
      }
      // Развилка у щита — перезаписываем геометрию по вердикту. Оба ветвления
      // непрерывны на границах региона, поэтому реверс ping-pong не дёргается.
      if (verdict === TRUST && p >= tStart && p <= tEnd) {
        // «Свой» — перелёт ПОВЕРХ щита одной дугой 440→900, в щит не превращается.
        const q = (p - tStart) / (tEnd - tStart);
        wsCur = WS[2]! + (WS[4]! - WS[2]!) * smooth(q);
        hop = TRUST_HOP * Math.sin(Math.PI * q);
        scat = 0;
        if (q < 0.25) {
          from = shapes[2]!; // спиннер → кучка на взлёте
          to = shapes[0]!;
          e = smooth(q / 0.25);
        } else {
          from = shapes[0]!; // кучка → play на снижении к монитору
          to = shapes[4]!;
          e = smooth((q - 0.25) / 0.75);
        }
        active = q >= 0.85 ? 4 : 0; // щит не подсвечиваем; монитор зажигаем под конец
      } else if (verdict === REJECT && p >= rStart) {
        // Отклонено — отскок у щита, рассыпание и сбор обратно в нейтральную кучку.
        const r = (p - rStart) / (rEnd - rStart);
        const b = Math.sin(Math.PI * r);
        wsCur = WS[3]! - REJECT_RECOIL * b;
        hop = -REJECT_DIP * b;
        scat = REJECT_SCAT * b;
        from = shapes[3]!; // щит → кучка
        to = shapes[0]!;
        e = smooth(Math.min(r / 0.5, 1));
        active = r < 0.25 ? 3 : 0; // коротко горит щит, монитор остаётся тёмным
      }
      world!.setAttribute('transform', `translate(${(CX - wsCur).toFixed(1)} 0)`);
      const y = BASE_Y - hop;
      for (let k = 0; k < N; k++) {
        const a = from[k % from.length]!;
        const b = to[k % to.length]!;
        const bx = a[0] + (b[0] - a[0]) * e;
        const by = a[1] + (b[1] - a[1]) * e;
        const rv = rnd[k]!;
        rects[k]!.setAttribute('x', (CX + bx + rv[0] * scat - 1.35).toFixed(1));
        rects[k]!.setAttribute('y', (y + by + rv[1] * scat - 1.35).toFixed(1));
      }
      const li = active - 1;
      nameRefs.current.forEach((el, idx) => el?.setAttribute('fill', idx === li ? '#67e8f9' : '#8b8b96'));
      tickRefs.current.forEach((el, idx) => el?.setAttribute('fill', idx === li ? '#22d3ee' : '#33333d'));
      monRef.current?.setAttribute('stroke', active === 4 ? '#67e8f9' : '#0e7490');
      // Стампы-вердикты над щитом (экранные координаты, не едут с миром).
      const cp6 = (p - cum[6]!) / (cum[7]! - cum[6]!); // прогресс паузы на щите
      const sq = (p - tStart) / (tEnd - tStart);
      const sr = (p - rStart) / (rEnd - rStart);
      checkRef.current?.setAttribute('opacity', String(verdict === APPROVE ? pulse(cp6, 0.15, 0.4, 0.85, 1) : 0));
      closeRef.current?.setAttribute(
        'opacity',
        String(verdict === REJECT && p >= rStart ? pulse(sr, 0.1, 0.3, 0.75, 0.95) : 0),
      );
      starRef.current?.setAttribute(
        'opacity',
        String(verdict === TRUST && p >= tStart && p <= tEnd ? pulse(sq, 0.3, 0.42, 0.62, 0.74) : 0),
      );
    }

    // Возврат: кучка не отматывается через станции, а одной быстрой дугой летит из
    // конечной точки (монитор / щит при отказе) прямо в начало и собирается в кучку.
    function frameReturn(rp: number) {
      const e = smooth(rp);
      const endWorld = verdict === REJECT ? WS[3]! : WS[4]!;
      const fromShape = verdict === REJECT ? shapes[0]! : shapes[4]!;
      const to = shapes[0]!;
      const wsCur = endWorld * (1 - e);
      const y = BASE_Y - RETURN_HOP * Math.sin(Math.PI * rp);
      world!.setAttribute('transform', `translate(${(CX - wsCur).toFixed(1)} 0)`);
      for (let k = 0; k < N; k++) {
        const a = fromShape[k % fromShape.length]!;
        const b = to[k % to.length]!;
        rects[k]!.setAttribute('x', (CX + a[0] + (b[0] - a[0]) * e - 1.35).toFixed(1));
        rects[k]!.setAttribute('y', (y + a[1] + (b[1] - a[1]) * e - 1.35).toFixed(1));
      }
      // На возврате ничего не подсвечиваем, монитор гасим, стампы прячем.
      nameRefs.current.forEach((el) => el?.setAttribute('fill', '#8b8b96'));
      tickRefs.current.forEach((el) => el?.setAttribute('fill', '#33333d'));
      monRef.current?.setAttribute('stroke', '#0e7490');
      checkRef.current?.setAttribute('opacity', '0');
      closeRef.current?.setAttribute('opacity', '0');
      starRef.current?.setAttribute('opacity', '0');
    }

    // Вердикт держим весь цикл; новый исход выбираем в начале каждого прохода.
    // Первый проход — ORDER[0] = APPROVE.
    let cycleIdx = 0;
    let verdict = ORDER[0]!;
    frame(0, verdict);

    // Авто-проигрыш: проход вперёд (FWD_DUR) → пауза на результате → быстрый возврат
    // дугой в начало (RETURN_DUR) → короткая пауза → следующий проход.
    let raf = 0;
    let mode: 'forward' | 'return' = 'forward';
    let p = 0;
    let rp = 0;
    let holdUntil = 0;
    let last = 0;
    let running = false;
    const loop = (now: number) => {
      if (!last) last = now;
      const dt = now - last;
      last = now;
      if (now >= holdUntil) {
        if (mode === 'forward') {
          p += dt / FWD_DUR;
          if (p >= 1) {
            p = 1;
            frame(1, verdict);
            mode = 'return';
            rp = 0;
            holdUntil = now + END_PAUSE; // даём прочитать исход
          } else {
            frame(p, verdict);
          }
        } else {
          rp += dt / RETURN_DUR;
          if (rp >= 1) {
            mode = 'forward';
            p = 0;
            cycleIdx = (cycleIdx + 1) % ORDER.length;
            verdict = ORDER[cycleIdx]!;
            frame(0, verdict);
            holdUntil = now + START_PAUSE;
          } else {
            frameReturn(rp);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    // Крутим только пока секция видна (экономим CPU/батарею).
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]!.isIntersecting) start();
        else stop();
      },
      { threshold: 0.35 },
    );
    io.observe(section);

    return () => {
      io.disconnect();
      stop();
      rects.forEach((r) => r.remove());
    };
  }, [reduced]);

  if (reduced) {
    return (
      <section className="py-8">
        <p className="mb-5 text-center font-display text-xs uppercase tracking-wide text-muted">
          {t('flow.title')}
        </p>
        <div className="mx-auto flex max-w-2xl flex-wrap items-start justify-center gap-x-6 gap-y-4 px-4">
          {STAGE_ICONS.map((name, i) => (
            <div key={name} className="flex w-28 flex-col items-center text-center">
              <Icon name={name} size={30} className="text-twitch-light" />
              <span className="mt-2 font-body text-sm text-text">{stages[i]!.name}</span>
              <span className="text-xs text-muted">{stages[i]!.cap}</span>
              {/* Модерация — это развилка: одобрить ✓ / отклонить ✕ / свой без проверки ★. */}
              {i === 2 && (
                <span className="mt-1 flex gap-1.5">
                  <Icon name="check" size={16} className="text-ok" />
                  <Icon name="close" size={16} className="text-danger" />
                  <Icon name="star" size={16} className="text-warn" />
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="py-8">
      <div className="mx-auto w-full max-w-2xl px-4">
        <p className="mb-3 text-center font-display text-xs uppercase tracking-wide text-muted">
          {t('flow.title')}
        </p>
        <svg
          width="100%"
          viewBox="0 0 680 210"
          shapeRendering="crispEdges"
          role="img"
          aria-label={t('flow.title')}
          style={{ imageRendering: 'pixelated' }}
        >
          <g ref={worldRef} transform="translate(340 0)">
            <line x1={-60} y1={150} x2={980} y2={150} stroke="#33333d" strokeWidth={2} strokeDasharray="2 5" />
            {/* Тусклый ориентир fast-lane: «свои» уходят этой дугой поверх щита. */}
            <path d="M 580 100 Q 660 -28 740 100" fill="none" stroke="#67e8f9" strokeWidth={2} strokeDasharray="3 5" opacity={0.18} />
            {[218, 438, 658].map((x, i) => (
              <rect
                key={i}
                ref={(el) => {
                  tickRefs.current[i] = el;
                }}
                x={x}
                y={148}
                width={4}
                height={4}
                fill="#33333d"
              />
            ))}
            <rect ref={monRef} x={864} y={104} width={72} height={48} fill="#16161a" stroke="#0e7490" strokeWidth={2} />
            <rect x={894} y={154} width={12} height={6} fill="#0e7490" />
            {STATION_X.map((x, i) => (
              <g key={i}>
                <text
                  ref={(el) => {
                    nameRefs.current[i] = el;
                  }}
                  x={x}
                  y={176}
                  textAnchor="middle"
                  fill="#8b8b96"
                  className="font-body"
                  style={{ fontSize: 18 }}
                >
                  {stages[i]!.name}
                </text>
                <text x={x} y={192} textAnchor="middle" fill="#5f5e5a" className="font-body" style={{ fontSize: 14 }}>
                  {stages[i]!.cap}
                </text>
              </g>
            ))}
          </g>
          <g ref={partsRef} />
          {/* Стампы-вердикты в экранных координатах — всплывают над щитом (центр CX, y≈84). */}
          <g ref={checkRef} opacity={0} fill="#34d399" transform="translate(330.4 74.4) scale(0.8)">
            {ICONS.check!.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <g ref={closeRef} opacity={0} fill="#f87171" transform="translate(330.4 74.4) scale(0.8)">
            {ICONS.close!.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <g ref={starRef} opacity={0} fill="#fbbf24" transform="translate(330.4 74.4) scale(0.8)">
            {ICONS.star!.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </svg>
      </div>
    </section>
  );
}
