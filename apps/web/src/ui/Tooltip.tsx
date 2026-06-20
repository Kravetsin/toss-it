import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Лёгкий тултип-пояснение для функционала. Показывается по наведению И фокусу (a11y),
 * содержимое — произвольный ReactNode. `align` управляет горизонтальной привязкой к триггеру,
 * `placement` — стороной (снизу/сверху).
 *
 * Плашка рендерится ПОРТАЛОМ в `document.body` и позиционируется `fixed` по координатам
 * триггера — так она не обрезается `overflow: hidden` родительских контейнеров (карточки,
 * drawer, таблицы) и всегда поверх. Позиция пересчитывается на scroll/resize, пока тултип
 * открыт (в скроллящихся контейнерах плашка иначе оторвалась бы от кнопки).
 *
 * Появление — «жидкостью»: плашка целиком (фон, рамка, текст) клипуется растущим `circle()`
 * из точки касания у кромки, обращённой к триггеру, так что буквы проявляются по мере того,
 * как заливка до них доходит. Та же идиома, что у круговой заливки кнопок (useFillEffect).
 * Тень — `drop-shadow`, чтобы следовала за формой капли. Под `prefers-reduced-motion`
 * глобальное правило (index.css) гасит длительность — тултип появляется мгновенно.
 */

// Заливка: мягкий старт → быстрая середина → медленный конец (как у кнопок, чуть короче).
const REVEAL_GROW = 'clip-path .5s cubic-bezier(.25, 0, .1, 1)';
const REVEAL_SHRINK = 'clip-path .28s cubic-bezier(.25, 0, 0, 1)';
// Через сколько после сжатия снимаем плашку с DOM (длительность SHRINK + запас).
// На таймере, а не на transitionend: событие clip-path не всегда приходит (прерванная
// анимация, reduced-motion с почти нулевой длительностью) — иначе плашка зависла бы в DOM.
const HIDE_MS = 320;
// Зазор между триггером и плашкой.
const GAP = 8;

// circle() проценты считаются относительно sqrt((w² + h²) / 2). Радиус подбираем так,
// чтобы круг из точки (xPct, yPct) у кромки накрыл дальний угол.
function targetPct(w: number, h: number, xPct: number, yPct: number) {
  const xPx = (xPct / 100) * w;
  const yPx = (yPct / 100) * h;
  const farPx = Math.sqrt(Math.max(xPx, w - xPx) ** 2 + Math.max(yPx, h - yPx) ** 2);
  const refLen = Math.sqrt((w ** 2 + h ** 2) / 2);
  return Math.ceil((farPx / refLen) * 100) + 2; // +2 — мини-запас
}

export function Tooltip({
  content,
  children,
  align = 'center',
  placement = 'bottom',
  className = '',
  focusable = true,
}: {
  content: ReactNode;
  children: ReactNode;
  /** Горизонтальная привязка для placement top/bottom (для left/right игнорируется). */
  align?: 'center' | 'start' | 'end';
  /**
   * Сторона триггера, с которой раскрывается тултип. 'top' — для кнопок у нижнего края,
   * 'right'/'left' — для вертикальных меню (свёрнутый сайдбар), где снизу/сверху перекрыло
   * бы соседние пункты. Для left/right плашка центрируется по вертикали триггера.
   */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  /**
   * true (по умолч.) — триггер сам по себе не фокусируем (текст/чип): оборачиваем его
   * в `span[tabIndex=0]`, чтобы тултип открывался и с клавиатуры.
   * false — триггер УЖЕ фокусируем (кнопка, ссылка): обёртку не добавляем, иначе
   * получится двойной фокус-таргет. Фокус ловим через всплытие (focusin/out) на контейнере.
   */
  focusable?: boolean;
}) {
  // open — целевое состояние (растём/сжимаемся); render — смонтирована ли плашка в DOM
  // (держим её на время exit-анимации сжатия).
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);
  const id = useId();
  const reduced = useReducedMotion();

  const triggerRef = useRef<HTMLSpanElement>(null);
  const plateRef = useRef<HTMLSpanElement>(null);
  // clientX курсора в момент наведения (null = вход с клавиатуры → старт от привязки align).
  const cursorX = useRef<number | null>(null);
  // Точка входа в % по горизонтали — переиспользуется при сжатии (схлопываемся туда же).
  const originPct = useRef(50);
  // Таймер отложенного размонтирования (см. HIDE_MS). Чистится при повторном наведении.
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const horizontal = placement === 'left' || placement === 'right';
  // Кромка, обращённая к триггеру, откуда стартует заливка:
  // bottom→верхняя (y=0), top→нижняя (y=100), right→левая (x=0), left→правая (x=100).
  const originY = horizontal ? 50 : placement === 'top' ? 100 : 0;

  // Ставит плашку (fixed) по координатам триггера. Без знания размеров плашки фиксируем ту
  // кромку, что прилегает к триггеру (через top/bottom/left/right), остальное — transform.
  function position() {
    const el = plateRef.current;
    const trig = triggerRef.current;
    if (!el || !trig) return;
    const tr = trig.getBoundingClientRect();
    el.style.top = 'auto';
    el.style.bottom = 'auto';
    el.style.left = 'auto';
    el.style.right = 'auto';
    if (horizontal) {
      // Сбоку: по вертикали центрируем по триггеру.
      el.style.top = `${tr.top + tr.height / 2}px`;
      el.style.transform = 'translateY(-50%)';
      if (placement === 'right') el.style.left = `${tr.right + GAP}px`;
      else el.style.right = `${window.innerWidth - tr.left + GAP}px`;
    } else {
      // Снизу/сверху: по горизонтали — привязка align.
      if (align === 'start') {
        el.style.left = `${tr.left}px`;
        el.style.transform = 'none';
      } else if (align === 'end') {
        el.style.left = `${tr.right}px`;
        el.style.transform = 'translateX(-100%)';
      } else {
        el.style.left = `${tr.left + tr.width / 2}px`;
        el.style.transform = 'translateX(-50%)';
      }
      if (placement === 'top') el.style.bottom = `${window.innerHeight - tr.top + GAP}px`;
      else el.style.top = `${tr.bottom + GAP}px`;
    }
  }

  function show(x: number | null) {
    clearTimeout(hideTimer.current);
    cursorX.current = x;
    setRender(true);
    setOpen(true);
  }

  function hide() {
    setOpen(false);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRender(false), reduced ? 0 : HIDE_MS);
  }

  // Подчищаем таймер, если компонент исчезнет посреди ухода тултипа.
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  // Пока тултип раскрыт — держим плашку приклеенной к триггеру при прокрутке/ресайзе.
  // capture:true ловит и прокрутку вложенных контейнеров (drawer, таблица), не только окна.
  useEffect(() => {
    if (!open) return;
    const onMove = () => position();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Запускаем/сворачиваем заливку после того, как плашка оказалась в DOM и измерена.
  useLayoutEffect(() => {
    const el = plateRef.current;
    if (!el) return;

    if (open) {
      position();
      const { width, height, left } = el.getBoundingClientRect();
      // Для left/right старт от прилегающей боковой кромки; для top/bottom — из точки курсора.
      const xPct = horizontal
        ? placement === 'right'
          ? 0
          : 100
        : cursorX.current != null && width > 0
          ? Math.min(100, Math.max(0, ((cursorX.current - left) / width) * 100))
          : align === 'start'
            ? 12
            : align === 'end'
              ? 88
              : 50;
      originPct.current = xPct;
      const target = targetPct(width, height, xPct, originY);
      // 0% из точки входа → reflow → рост до радиуса, накрывающего дальний угол.
      el.style.transition = 'none';
      el.style.clipPath = `circle(0% at ${xPct}% ${originY}%)`;
      void el.offsetWidth;
      el.style.transition = REVEAL_GROW;
      el.style.clipPath = `circle(${target}% at ${xPct}% ${originY}%)`;
    } else {
      // Сжатие к той же точке; плашку снимет с DOM таймер hide() (HIDE_MS).
      el.style.transition = REVEAL_SHRINK;
      el.style.clipPath = `circle(0% at ${originPct.current}% ${originY}%)`;
    }
    // originY/placement производны от пропа placement (статичен) — не реактивные зависимости.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align]);

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={(e) => show(e.clientX)}
      onMouseLeave={hide}
      onFocus={() => show(null)}
      onBlur={hide}
      aria-describedby={!focusable && open ? id : undefined}
    >
      {focusable ? (
        <span
          tabIndex={0}
          aria-describedby={open ? id : undefined}
          className="inline-flex rounded-full outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
        >
          {children}
        </span>
      ) : (
        children
      )}
      {render &&
        createPortal(
          <span
            ref={plateRef}
            role="tooltip"
            id={id}
            className="fixed z-[60] w-max max-w-[16rem] rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 text-left text-xs leading-relaxed text-muted [filter:drop-shadow(0_6px_16px_rgba(0,0,0,0.45))]"
            style={{ top: 0, left: 0, clipPath: `circle(0% at 50% ${originY}%)` }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
