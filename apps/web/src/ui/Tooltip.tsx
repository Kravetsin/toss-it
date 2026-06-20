import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Tooltip shown on hover AND focus (a11y); content is an arbitrary ReactNode.
 * Plate renders via portal into document.body, positioned `fixed` so parent
 * `overflow: hidden` (cards, drawers, tables) never clips it; reposition on
 * scroll/resize while open. Reveal "liquid" via growing circle() clip-path from
 * the edge facing the trigger (same idiom as button fill); reduced-motion makes
 * it instant via global index.css rule.
 */

// Fill easing: soft start, fast middle, slow end (like buttons, a bit shorter).
const REVEAL_GROW = 'clip-path .5s cubic-bezier(.25, 0, .1, 1)';
const REVEAL_SHRINK = 'clip-path .28s cubic-bezier(.25, 0, 0, 1)';
// Delay before unmounting plate after shrink (SHRINK duration + margin). Timer,
// not transitionend: clip-path event isn't always fired (interrupted anim,
// near-zero reduced-motion duration) — else the plate would stick in the DOM.
const HIDE_MS = 320;
const GAP = 8;

// circle() percentages are relative to sqrt((w² + h²) / 2). Pick radius so the
// circle at (xPct, yPct) on the edge covers the far corner.
function targetPct(w: number, h: number, xPct: number, yPct: number) {
  const xPx = (xPct / 100) * w;
  const yPx = (yPct / 100) * h;
  const farPx = Math.sqrt(Math.max(xPx, w - xPx) ** 2 + Math.max(yPx, h - yPx) ** 2);
  const refLen = Math.sqrt((w ** 2 + h ** 2) / 2);
  return Math.ceil((farPx / refLen) * 100) + 2; // +2 — small margin
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
  /** Horizontal anchor for top/bottom placement (ignored for left/right). */
  align?: 'center' | 'start' | 'end';
  /**
   * Side the tooltip opens from. 'top' for buttons near the bottom edge;
   * 'right'/'left' for vertical menus (collapsed sidebar) where top/bottom would
   * overlap neighbors. left/right plates are centered vertically on the trigger.
   */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  /**
   * true (default): trigger isn't focusable (text/chip), so wrap in
   * span[tabIndex=0] for keyboard access. false: trigger already focusable
   * (button/link) — no wrapper, else a double focus target. Focus caught via
   * focusin/out bubbling on the container.
   */
  focusable?: boolean;
}) {
  // open = target state (grow/shrink); render = whether plate is mounted (kept
  // during shrink exit animation).
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);
  const id = useId();
  const reduced = useReducedMotion();

  const triggerRef = useRef<HTMLSpanElement>(null);
  const plateRef = useRef<HTMLSpanElement>(null);
  // Cursor clientX at hover time (null = keyboard entry → start from align anchor).
  const cursorX = useRef<number | null>(null);
  // Horizontal entry point (%), reused on shrink so it collapses to the same spot.
  const originPct = useRef(50);
  // Deferred unmount timer (see HIDE_MS); cleared on re-hover.
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const horizontal = placement === 'left' || placement === 'right';
  // Edge facing the trigger where the fill starts:
  // bottom→top (y=0), top→bottom (y=100), right→left (x=0), left→right (x=100).
  const originY = horizontal ? 50 : placement === 'top' ? 100 : 0;

  // Position the fixed plate by trigger coords: pin the edge adjacent to the
  // trigger (top/bottom/left/right), offset the rest via transform.
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
      // Side placement: center vertically on the trigger.
      el.style.top = `${tr.top + tr.height / 2}px`;
      el.style.transform = 'translateY(-50%)';
      if (placement === 'right') el.style.left = `${tr.right + GAP}px`;
      else el.style.right = `${window.innerWidth - tr.left + GAP}px`;
    } else {
      // Top/bottom placement: horizontal anchor follows align.
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

  // Clear the timer if the component unmounts mid-hide.
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  // While open, keep the plate glued to the trigger on scroll/resize.
  // capture:true also catches nested-container scroll (drawer, table), not just window.
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

  // Grow/shrink the fill once the plate is mounted in the DOM and measured.
  useLayoutEffect(() => {
    const el = plateRef.current;
    if (!el) return;

    if (open) {
      position();
      const { width, height, left } = el.getBoundingClientRect();
      // left/right start from the adjacent side edge; top/bottom from the cursor point.
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
      // 0% at entry point → reflow → grow to a radius covering the far corner.
      el.style.transition = 'none';
      el.style.clipPath = `circle(0% at ${xPct}% ${originY}%)`;
      void el.offsetWidth;
      el.style.transition = REVEAL_GROW;
      el.style.clipPath = `circle(${target}% at ${xPct}% ${originY}%)`;
    } else {
      // Shrink to the same point; the hide() timer unmounts the plate (HIDE_MS).
      el.style.transition = REVEAL_SHRINK;
      el.style.clipPath = `circle(0% at ${originPct.current}% ${originY}%)`;
    }
    // originY/placement derive from the static placement prop — not reactive deps.
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
