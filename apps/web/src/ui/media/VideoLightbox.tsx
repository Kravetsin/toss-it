import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/ui/icons';
import { ModalPortal } from './ModalPortal';
import { LightboxVideoControls } from './LightboxVideoControls';
import { useAutoHideControls } from './useAutoHideControls';
import { useFullscreen, useMediaElement } from './useMediaElement';

export interface VideoLightboxProps {
  src: string;
  open: boolean;
  onClose: () => void;
  label?: string;
  /** Подсказка длительности с сервера (сек) — для таймкодов до загрузки метаданных. */
  durationHintSec?: number;
}

const MIN = 1;
const MAX = 8;

interface View {
  scale: number;
  tx: number;
  ty: number;
}

/**
 * Лайтбокс-плеер видео (Telegram-стиль): открывается по клику, сразу играет СО ЗВУКОМ (клик —
 * пользовательский жест; при отказе политики автоплея — без звука + аффорданс «включить звук»).
 * Зум колесом увеличивает САМО видео (как картинку — растёт в размерах, клип по краям экрана),
 * при увеличении его можно таскать. Контролы — отдельной плашкой, прижатой к НИЗУ вьюпорта.
 * Клик по видео = play/pause, клик по тёмному фону / Esc / ✕ = закрыть с паузой.
 */
export function VideoLightbox({ src, open, onClose, label, durationHintSec }: VideoLightboxProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const m = useMediaElement();
  const fs = useFullscreen(frameRef);

  const [menuOpen, setMenuOpen] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, sx: 0, sy: 0, btx: 0, bty: 0, moved: false, onVideo: false });

  // Контролы прячем только в фуллскрине во время игры (иначе плашка внизу всегда видна).
  const active = fs.isFullscreen && m.playing && !menuOpen && !m.scrubbing;
  const { visible, show } = useAutoHideControls(active);
  const ariaLabel = label ?? 'Video';
  const zoomed = view.scale > 1;

  // Автоплей при открытии. rAF-ожидание: видео монтируется порталом на кадр позже смены `open`.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let raf = 0;
    setNeedsUnmute(false);
    setView({ scale: 1, tx: 0, ty: 0 });
    const tryPlay = () => {
      const el = m.el.current;
      if (!el) {
        raf = requestAnimationFrame(tryPlay);
        return;
      }
      el.muted = false;
      void el.play().catch(() => {
        if (cancelled) return;
        el.muted = true;
        void el.play().catch(() => {});
        setNeedsUnmute(true);
      });
    };
    raf = requestAnimationFrame(tryPlay);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [open, m.el]);

  // Фокусируем контейнер при открытии — чтобы клавиатура работала сразу.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const focus = () => {
      if (frameRef.current) frameRef.current.focus();
      else raf = requestAnimationFrame(focus);
    };
    raf = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Пауза при закрытии (звук обрывается сразу, ещё до конца fade-out) + выход из PiP.
  useEffect(() => {
    if (open) return;
    const el = m.el.current;
    el?.pause();
    if (typeof document !== 'undefined' && el && document.pictureInPictureElement === el) {
      void document.exitPictureInPicture().catch(() => {});
    }
  }, [open, m.el]);

  // Ограничиваем сдвиг краями увеличенного видео в пределах экрана.
  const clampPan = useCallback((x: number, y: number, s: number) => {
    const vid = m.el.current;
    if (!vid) return { x, y };
    const maxX = Math.max(0, (vid.offsetWidth * s - window.innerWidth) / 2);
    const maxY = Math.max(0, (vid.offsetHeight * s - window.innerHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }, [m.el]);

  // Перетаскивание/клик: тащим увеличенное видео (pan); чистый клик без движения — play/pause
  // (по видео) или закрытие (по тёмному фону вокруг).
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const d = drag.current;
      if (!d.active) return;
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
      setView((v) => {
        if (v.scale <= 1) return v;
        const p = clampPan(d.btx + (e.clientX - d.sx), d.bty + (e.clientY - d.sy), v.scale);
        return { ...v, tx: p.x, ty: p.y };
      });
    };
    const onUp = () => {
      const d = drag.current;
      d.active = false;
      setDragging(false);
      if (d.moved) return;
      if (d.onVideo) m.toggle();
      else onClose();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, clampPan, m.toggle, onClose]);

  function onFrameMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    drag.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      btx: view.tx,
      bty: view.ty,
      moved: false,
      onVideo: e.target === m.el.current,
    };
    setDragging(true);
  }

  // Зум колесом к точке курсора (body заблокирован — preventDefault не нужен).
  function onWheel(e: React.WheelEvent) {
    const vid = m.el.current;
    if (!vid) return;
    const rect = vid.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    setView((v) => {
      const ns = Math.min(MAX, Math.max(MIN, v.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      if (ns === MIN) return { scale: 1, tx: 0, ty: 0 };
      const ratio = ns / v.scale;
      const p = clampPan(v.tx - dx * (ratio - 1), v.ty - dy * (ratio - 1), ns);
      return { scale: ns, tx: p.x, ty: p.y };
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT') return; // SeekBar/громкость сами обрабатывают стрелки
    const k = e.key;
    if (k === ' ' || k === 'k') {
      if (tag === 'BUTTON') return;
      e.preventDefault();
      m.toggle();
    } else if (k === 'ArrowLeft') {
      e.preventDefault();
      m.seek(m.current - 5);
    } else if (k === 'ArrowRight') {
      e.preventDefault();
      m.seek(m.current + 5);
    } else if (k === 'ArrowUp') {
      e.preventDefault();
      m.setVolume(Math.min(1, m.volume + 0.1));
    } else if (k === 'ArrowDown') {
      e.preventDefault();
      m.setVolume(Math.max(0, m.volume - 0.1));
    } else if (k === 'm') {
      m.toggleMute();
    } else if (k === 'f') {
      fs.toggle();
    } else if (k === 'p') {
      m.togglePip();
    } else {
      return;
    }
    e.stopPropagation();
    show();
  }

  const showPlate = !m.error && !m.waiting && !m.playing && (m.current === 0 || m.ended);
  const cursor = dragging ? 'grabbing' : zoomed ? 'grab' : fs.isFullscreen && !visible ? 'none' : 'pointer';

  return (
    <ModalPortal open={open} onClose={onClose} ariaLabel={ariaLabel} showClose={!fs.isFullscreen} closeOnBackdrop={false}>
      <div
        ref={frameRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={onFrameMouseDown}
        onWheel={onWheel}
        onMouseMove={show}
        className="absolute inset-0 flex items-center justify-center outline-none"
      >
        {/* Видео по центру — растёт с зумом, клип по краям экрана (overflow на фоне модалки) */}
        <video
          ref={m.attach}
          src={src}
          playsInline
          preload="auto"
          draggable={false}
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            cursor,
          }}
          className={`select-none bg-black object-contain ${
            fs.isFullscreen ? 'max-h-full max-w-full' : 'max-h-[80vh] max-w-[92vw]'
          }`}
        />

        {/* Центральная Play (на паузе) — индикатор, клик ловит фрейм */}
        {showPlate && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="grid size-16 place-items-center rounded-full border border-border bg-bg/70 text-text">
              <Icon name={m.ended ? 'reload' : 'play'} size={30} />
            </div>
          </div>
        )}

        {/* Буферизация */}
        {m.waiting && !m.error && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Icon name="loader" size={40} className="animate-spin text-accent" />
          </div>
        )}

        {/* Ошибка */}
        {m.error && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Icon name="square-alert" size={32} className="text-danger" />
          </div>
        )}

        {/* Аффорданс «включить звук» */}
        {needsUnmute && m.muted && (
          <button
            type="button"
            aria-label="Unmute"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => m.toggleMute()}
            className="absolute left-1/2 top-4 z-10 inline-flex -translate-x-1/2 items-center justify-center rounded-full border border-border bg-bg/85 px-3 py-1.5 text-sm text-text outline-none transition-colors hover:bg-bg focus-visible:[box-shadow:var(--shadow-focus)]"
          >
            <Icon name="volume-x" size={16} />
          </button>
        )}

        {/* Контролы — отдельной плашкой, прижатой к низу вьюпорта */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className={`pointer-events-auto w-[min(42rem,90vw)] overflow-hidden rounded-[var(--radius)] border border-border bg-surface/95 shadow-3 backdrop-blur-sm transition-opacity duration-200 ${
              visible ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <LightboxVideoControls
              m={m}
              fs={fs}
              durationHintSec={durationHintSec}
              label={ariaLabel}
              onMenuOpenChange={setMenuOpen}
            />
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
