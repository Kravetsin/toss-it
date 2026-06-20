import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/ui/icons';

/**
 * Лайтбокс: увеличенная картинка в модалке (НЕ на весь экран — открывается «средним»
 * размером, вписана в ~80vh/82vw). Портал в `body` — иначе `position: fixed` обрезался бы/
 * смещался внутри карточки (motion.div ставит transform → containing block) с overflow-hidden.
 *
 * Поведение как в Telegram: колесо мыши приближает/отдаляет К ТОЧКЕ КУРСОРА (можно и
 * уменьшить ниже исходного), при увеличении картинку можно таскать (pan) в пределах краёв,
 * одиночный клик по картинке (без перетаскивания) — закрывает. Также ✕ и Esc.
 */

const MIN = 0.2; // можно уменьшить ниже исходного размера открытия
const MAX = 8;

interface View {
  scale: number;
  tx: number;
  ty: number;
}

export function Lightbox({
  src,
  alt = '',
  open,
  onClose,
}: {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}) {
  // render — в DOM ли (держим на время exit-анимации); shown — целевое видимое состояние.
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  // animate — плавный переход transform (сброс); при колесе/таскании — без, чтобы отзывчиво.
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, sx: 0, sy: 0, btx: 0, bty: 0, moved: false });

  useEffect(() => {
    if (open) {
      setRender(true);
      return;
    }
    setShown(false);
    const t = setTimeout(() => setRender(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!render || !open) return;
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [render, open]);

  // Сбрасываем зум при каждом открытии и смене картинки.
  useEffect(() => {
    if (open) setView({ scale: 1, tx: 0, ty: 0 });
  }, [open, src]);

  // Ограничиваем сдвиг краями картинки: меньше экрана — держим по центру, больше — не
  // даём утащить дальше края.
  const clampPan = useCallback((x: number, y: number, s: number) => {
    const img = imgRef.current;
    if (!img) return { x, y };
    const maxX = Math.max(0, (img.offsetWidth * s - window.innerWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * s - window.innerHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }, []);

  // Esc закрывает; пока открыт — блокируем скролл страницы под модалкой.
  useEffect(() => {
    if (!render) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [render, onClose]);

  // Колесо: зум к точке курсора (в обе стороны). Нативный listener с passive:false —
  // чтобы погасить прокрутку страницы (preventDefault).
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const img = imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      setAnimate(false);
      setView((v) => {
        const ns = Math.min(MAX, Math.max(MIN, v.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
        const ratio = ns / v.scale;
        const p = clampPan(v.tx - dx * (ratio - 1), v.ty - dy * (ratio - 1), ns);
        return { scale: ns, tx: p.x, ty: p.y };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [render, clampPan]);

  // Перетаскивание/клик: тащим картинку (pan), а чистый клик без движения — закрывает.
  // Слушаем на окне, чтобы курсор мог уходить за пределы картинки во время перетаскивания.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const d = drag.current;
      if (!d.active) return;
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
      setView((v) => {
        const p = clampPan(d.btx + (e.clientX - d.sx), d.bty + (e.clientY - d.sy), v.scale);
        return { ...v, tx: p.x, ty: p.y };
      });
    };
    const onUp = () => {
      const moved = drag.current.moved;
      drag.current.active = false;
      setDragging(false);
      if (!moved) onClose(); // клик без перетаскивания = закрыть
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, clampPan, onClose]);

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return; // только левая кнопка
    drag.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      btx: view.tx,
      bty: view.ty,
      moved: false,
    };
    setAnimate(false);
    setDragging(true);
  }

  if (!render) return null;

  const zoomed = view.scale > 1;
  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Image'}
      onMouseDown={onMouseDown}
      className={`fixed inset-0 z-[70] flex cursor-pointer items-center justify-center overflow-hidden bg-bg/80 p-6 backdrop-blur-sm transition-opacity duration-200 ease-out ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* h-[80vh] + w-auto открывает «средним» размером (апскейл мелких, не только потолок);
          max-w-[82vw] + object-contain аккуратно вписывает сверхширокие. scale поверх — зум. */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transition: animate ? 'transform .2s ease-out' : 'none',
          cursor: dragging ? 'grabbing' : zoomed ? 'grab' : 'pointer',
        }}
        className={`h-[80vh] w-auto max-w-[82vw] select-none rounded-[var(--radius-sm)] border border-border object-contain shadow-4 ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full border border-border bg-surface text-muted outline-none transition-colors duration-[180ms] ease-out hover:border-border-strong hover:text-text focus-visible:[box-shadow:var(--shadow-focus)]"
      >
        <Icon name="close" size={18} />
      </button>
    </div>,
    document.body,
  );
}
