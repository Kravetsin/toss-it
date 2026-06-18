import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Icon } from '@/ui/icons';
import { ScrollFlowStatic } from './ScrollFlowStatic';
import {
  END_PAUSE,
  type Frame,
  FWD_DUR,
  NODE_R,
  NODE_X,
  ORDER,
  RETURN_DUR,
  STAGE_ICONS,
  START_PAUSE,
  TRACK_Y,
  TRUST_HOP,
  frameReturn,
  frameState,
} from './engine';

// Цвета — строки CSS-переменных (резолвятся и в темах, и при смене акцента). Никаких хардкод-hex.
const C = {
  accent: 'var(--color-accent)',
  accentHover: 'var(--color-accent-hover)',
  accentSoft: 'var(--color-accent-soft)',
  border: 'var(--color-border)',
  muted: 'var(--color-muted)',
  faint: 'var(--color-faint)',
  nodeFill: 'var(--color-bg-elevated)',
  ok: 'var(--color-ok)',
  danger: 'var(--color-danger)',
  warn: 'var(--color-warn)',
};

// Геометрия связей: линия идёт между краями соседних узлов.
const SEG = [0, 1, 2].map((k) => ({ sx: NODE_X[k]! + NODE_R, ex: NODE_X[k + 1]! - NODE_R }));

/**
 * Анимация «как это работает» под кнопками входа: «токен» отправки едет по треку через
 * 4 узла-этапа (загрузка → обработка → модерация → на стриме). На модерации — развилка:
 * одобрено (✓, едет дальше), отклонено (✕, рассеивается), свой (★, перелёт поверх щита).
 *
 * Авто-проигрыш по времени с easing: проход вперёд → пауза на исходе → быстрый возврат
 * токена дугой в начало → следующий проход (исход берётся из ORDER). Связи заливаются мятным
 * по мере прохода, узлы подсвечиваются. Крутится только пока секция видна (IntersectionObserver);
 * при prefers-reduced-motion — статичная полоса этапов (ScrollFlowStatic).
 */
export function ScrollFlow() {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const stages = [1, 2, 3, 4].map((n) => ({ name: t(`flow.s${n}`), cap: t(`flow.c${n}`) }));

  const sectionRef = useRef<HTMLElement>(null);
  const tokenRef = useRef<SVGGElement>(null);
  const circleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const iconRefs = useRef<(SVGGElement | null)[]>([]);
  const nameRefs = useRef<(SVGTextElement | null)[]>([]);
  const segRefs = useRef<(SVGLineElement | null)[]>([]);
  const streamRingRef = useRef<SVGCircleElement>(null);
  const checkRef = useRef<SVGGElement>(null);
  const closeRef = useRef<SVGGElement>(null);
  const starRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    if (!section) return;

    const apply = (f: Frame) => {
      const tk = tokenRef.current;
      if (tk) {
        tk.setAttribute('transform', `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) scale(${f.sc.toFixed(3)})`);
        tk.setAttribute('opacity', f.op.toFixed(2));
      }
      for (let i = 0; i < 4; i++) {
        const lit = f.lit[i];
        const c = circleRefs.current[i];
        if (c) {
          c.style.stroke = lit ? C.accent : C.border;
          c.style.fill = lit ? C.accentSoft : C.nodeFill;
        }
        const g = iconRefs.current[i];
        if (g) g.style.color = lit ? C.accent : C.muted;
        const nm = nameRefs.current[i];
        if (nm) nm.style.fill = lit ? C.accentHover : C.muted;
      }
      for (let k = 0; k < 3; k++) {
        const ov = segRefs.current[k];
        const g = SEG[k]!;
        if (ov) ov.setAttribute('x2', (g.sx + f.seg[k]! * (g.ex - g.sx)).toFixed(1));
      }
      checkRef.current?.setAttribute('opacity', f.stampApprove.toFixed(2));
      closeRef.current?.setAttribute('opacity', f.stampReject.toFixed(2));
      starRef.current?.setAttribute('opacity', f.stampTrust.toFixed(2));
      const sr = streamRingRef.current;
      if (sr) {
        sr.setAttribute('r', (NODE_R + f.live * 16).toFixed(1));
        sr.setAttribute('opacity', (f.live > 0 ? 0.5 * (1 - f.live) : 0).toFixed(2));
      }
    };

    let cycleIdx = 0;
    let verdict = ORDER[0]!;
    apply(frameState(0, verdict));

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
            apply(frameState(1, verdict));
            mode = 'return';
            rp = 0;
            holdUntil = now + END_PAUSE;
          } else {
            apply(frameState(p, verdict));
          }
        } else {
          rp += dt / RETURN_DUR;
          if (rp >= 1) {
            mode = 'forward';
            p = 0;
            cycleIdx = (cycleIdx + 1) % ORDER.length;
            verdict = ORDER[cycleIdx]!;
            apply(frameState(0, verdict));
            holdUntil = now + START_PAUSE;
          } else {
            apply(frameReturn(rp, verdict));
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
    // Запускаем сразу; IntersectionObserver лишь ПРИОСТАНАВЛИВАЕТ, когда секция уехала из вида
    // (экономим CPU/батарею). Гейт не «на старт», чтобы анимация не зависела от срабатывания IO.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]!.isIntersecting) start();
        else stop();
      },
      { threshold: 0.35 },
    );
    io.observe(section);
    start();

    return () => {
      io.disconnect();
      stop();
    };
  }, [reduced]);

  if (reduced) {
    return <ScrollFlowStatic stages={stages} />;
  }

  return (
    <section ref={sectionRef} className="py-8">
      <div className="mx-auto w-full max-w-2xl px-4">
        <p className="mb-5 text-center label-mono text-muted">{t('flow.title')}</p>
        <svg width="100%" viewBox="0 0 680 150" role="img" aria-label={t('flow.title')}>
          {/* Базовые связи между узлами. */}
          {SEG.map((g, k) => (
            <line
              key={`b${k}`}
              x1={g.sx}
              y1={TRACK_Y}
              x2={g.ex}
              y2={TRACK_Y}
              style={{ stroke: C.border }}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
          {/* Тусклый ориентир fast-lane: «свои» уходят этой дугой поверх щита. */}
          <path
            d={`M ${NODE_X[1]} ${TRACK_Y} Q ${NODE_X[2]} ${TRACK_Y - TRUST_HOP} ${NODE_X[3]} ${TRACK_Y}`}
            fill="none"
            style={{ stroke: C.accent }}
            strokeWidth={1.5}
            strokeDasharray="3 6"
            opacity={0.14}
          />
          {/* Заливка связей мятным по мере прохода токена. */}
          {SEG.map((g, k) => (
            <line
              key={`f${k}`}
              ref={(el) => {
                segRefs.current[k] = el;
              }}
              x1={g.sx}
              y1={TRACK_Y}
              x2={g.sx}
              y2={TRACK_Y}
              style={{ stroke: C.accent }}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
          {/* Узлы-этапы: круг + Lucide-иконка + подписи. */}
          {STAGE_ICONS.map((name, i) => (
            <g key={i}>
              <circle
                ref={(el) => {
                  circleRefs.current[i] = el;
                }}
                cx={NODE_X[i]}
                cy={TRACK_Y}
                r={NODE_R}
                style={{ fill: C.nodeFill, stroke: C.border }}
                strokeWidth={1.5}
              />
              <g
                ref={(el) => {
                  iconRefs.current[i] = el;
                }}
                transform={`translate(${NODE_X[i]! - 9} ${TRACK_Y - 9})`}
                style={{ color: C.muted }}
              >
                <Icon name={name} size={18} />
              </g>
              <text
                ref={(el) => {
                  nameRefs.current[i] = el;
                }}
                x={NODE_X[i]}
                y={118}
                textAnchor="middle"
                style={{
                  fill: C.muted,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {stages[i]!.name}
              </text>
              <text
                x={NODE_X[i]}
                y={134}
                textAnchor="middle"
                style={{ fill: C.faint, fontFamily: 'var(--font-sans)', fontSize: 11 }}
              >
                {stages[i]!.cap}
              </text>
            </g>
          ))}
          {/* Расходящееся кольцо при попадании «на стрим». */}
          <circle
            ref={streamRingRef}
            cx={NODE_X[3]}
            cy={TRACK_Y}
            r={NODE_R}
            fill="none"
            style={{ stroke: C.accent }}
            strokeWidth={1.5}
            opacity={0}
          />
          {/* Токен отправки: мятный диск с гало. */}
          <g ref={tokenRef} transform={`translate(${NODE_X[0]} ${TRACK_Y})`}>
            <circle r={9} fill="none" style={{ stroke: C.accent }} strokeWidth={1} opacity={0.4} />
            <circle r={4.5} style={{ fill: C.accent }} />
          </g>
          {/* Стампы-вердикты над узлом модерации. */}
          <g ref={checkRef} opacity={0} transform={`translate(${NODE_X[2]! - 9} 22)`} style={{ color: C.ok }}>
            <Icon name="check" size={18} />
          </g>
          <g ref={closeRef} opacity={0} transform={`translate(${NODE_X[2]! - 9} 22)`} style={{ color: C.danger }}>
            <Icon name="close" size={18} />
          </g>
          <g ref={starRef} opacity={0} transform={`translate(${NODE_X[2]! - 9} 22)`} style={{ color: C.warn }}>
            <Icon name="star" size={18} />
          </g>
        </svg>
      </div>
    </section>
  );
}
