import { useEffect, useRef, useState } from 'react';
import { ICONS, Icon, type IconName } from './icons';
import { useI18n } from './i18n';

/**
 * Скролл-история на странице входа: пиксельный объект стоит по центру,
 * а «дорожка» этапов проезжает под ним. Объект собирается из облака пикселей
 * и держит форму на каждом этапе (загрузка → обработка → модерация → на стриме).
 *
 * - десктоп: прогресс привязан к скроллу (sticky-секция);
 * - мобайл: авто-проигрыш один раз при появлении (скролл-привязка капризна на тач);
 * - prefers-reduced-motion: статичная полоса из 4 этапов, без движения.
 */

// Иконки этапов (берём формы прямо из общего набора — частицы собираются по их пикселям).
const STAGE_ICONS: IconName[] = ['upload', 'loader', 'shield', 'play'];
const SVGNS = 'http://www.w3.org/2000/svg';

// Геометрия «мира»: объект всегда в CX, станции стоят в мировых координатах ws.
const CX = 340;
const BASE_Y = 128;
const WS = [0, 220, 440, 660, 900]; // [кучка, загрузка, обработка, модерация, на стриме]
const STATION_X = [220, 440, 660, 900];
const N = 46;
// Тайминг: чередование «пауза на этапе» (h) и «перелёт» (t). Паузы дают форме собраться и читаться.
const PHASES: Array<['h', number] | ['t', number, number]> = [
  ['h', 0], ['t', 0, 1], ['h', 1], ['t', 1, 2], ['h', 2], ['t', 2, 3], ['h', 3], ['t', 3, 4], ['h', 4],
];
const WEIGHTS = [0.7, 1.15, 0.95, 1.15, 0.95, 1.15, 0.95, 1.15, 1.05];

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
  const [mobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  const stages = [1, 2, 3, 4].map((n) => ({ name: t(`flow.s${n}`), cap: t(`flow.c${n}`) }));

  const sectionRef = useRef<HTMLElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const partsRef = useRef<SVGGElement>(null);
  const hintRef = useRef<SVGTextElement>(null);
  const monRef = useRef<SVGRectElement>(null);
  const nameRefs = useRef<(SVGTextElement | null)[]>([]);
  const tickRefs = useRef<(SVGRectElement | null)[]>([]);

  useEffect(() => {
    if (reduced) return;
    const world = worldRef.current;
    const parts = partsRef.current;
    const section = sectionRef.current;
    if (!world || !parts || !section) return;

    // Формы: кучка (спираль-диск) + 4 иконки этапов.
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

    // Частицы создаём в JS (чтобы не плодить разметку и не мигать на старте).
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

    function frame(p: number) {
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
      if (hintRef.current) hintRef.current.style.opacity = active === 0 ? '1' : '0';
      nameRefs.current.forEach((el, idx) => el?.setAttribute('fill', idx === li ? '#67e8f9' : '#8b8b96'));
      tickRefs.current.forEach((el, idx) => el?.setAttribute('fill', idx === li ? '#22d3ee' : '#33333d'));
      monRef.current?.setAttribute('stroke', active === 4 ? '#67e8f9' : '#0e7490');
    }

    frame(0);

    if (mobile) {
      // Авто-проигрыш один раз при появлении секции (тач: скролл-привязка капризна).
      let raf = 0;
      let played = false;
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries[0]!.isIntersecting || played) return;
          played = true;
          const DUR = 4600;
          const t0 = performance.now();
          const step = (now: number) => {
            const k = Math.min(1, (now - t0) / DUR);
            frame(k);
            if (k < 1) raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
        },
        { threshold: 0.5 },
      );
      io.observe(section);
      return () => {
        io.disconnect();
        cancelAnimationFrame(raf);
        rects.forEach((r) => r.remove());
      };
    }

    // Десктоп: прогресс = насколько прокрутили sticky-секцию. Один rect-read на событие —
    // дёшево для одного элемента и надёжнее, чем откладывать в rAF (тот спит в фоновых вкладках).
    const update = () => {
      const rect = section!.getBoundingClientRect();
      const distance = section!.offsetHeight - window.innerHeight;
      frame(distance > 0 ? -rect.top / distance : 0);
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      rects.forEach((r) => r.remove());
    };
  }, [reduced, mobile]);

  if (reduced) {
    // Статичная альтернатива без анимации.
    return (
      <section className="py-12">
        <p className="mb-5 text-center font-display text-sm uppercase tracking-wide text-muted">
          {t('flow.title')}
        </p>
        <div className="mx-auto flex max-w-2xl flex-wrap items-start justify-center gap-x-6 gap-y-4 px-4">
          {STAGE_ICONS.map((name, i) => (
            <div key={name} className="flex w-28 flex-col items-center text-center">
              <Icon name={name} size={30} className="text-twitch-light" />
              <span className="mt-2 font-display text-sm text-text">{stages[i]!.name}</span>
              <span className="text-xs text-muted">{stages[i]!.cap}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const Stage = (
    <div className="mx-auto w-full max-w-2xl px-4">
      <p className="mb-3 text-center font-display text-sm uppercase tracking-wide text-muted">
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
                className="font-display"
                style={{ fontSize: 15 }}
              >
                {stages[i]!.name}
              </text>
              <text x={x} y={192} textAnchor="middle" fill="#5f5e5a" className="font-display" style={{ fontSize: 12 }}>
                {stages[i]!.cap}
              </text>
            </g>
          ))}
        </g>
        <text
          ref={hintRef}
          x={340}
          y={104}
          textAnchor="middle"
          fill="#67e8f9"
          className="font-display"
          style={{ fontSize: 16 }}
        >
          {t('flow.scrollHint')}
        </text>
        <g ref={partsRef} />
      </svg>
    </div>
  );

  if (mobile) {
    return (
      <section ref={sectionRef} className="py-12">
        {Stage}
      </section>
    );
  }

  // Десктоп: высокая секция + залипающая сцена по центру экрана.
  return (
    <section ref={sectionRef} style={{ height: '240vh', position: 'relative' }}>
      <div className="sticky top-0 flex h-screen items-center justify-center">{Stage}</div>
    </section>
  );
}
