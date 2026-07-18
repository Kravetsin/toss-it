import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

/**
 * Pointer-based drag-to-reorder for a vertical list, with edge auto-scroll and FLIP animation of the
 * non-grabbed rows. Extracted from the music manager so the submission queue reuses the exact same
 * feel. The caller owns the working copy (`items` / `setItems`): the hook mutates it live during a
 * drag and calls `onCommit` once on drop, only if the order actually changed.
 */
export function useReorderList<T>({
  items,
  setItems,
  getId,
  onCommit,
}: {
  items: T[];
  setItems: (next: T[]) => void;
  getId: (item: T) => string;
  onCommit: (orderedIds: string[], items: T[]) => void;
}): {
  listRef: RefObject<HTMLUListElement | null>;
  dragId: string | null;
  registerRow: (id: string) => (el: HTMLLIElement | null) => void;
  handleProps: (id: string) => { onPointerDown: (e: ReactPointerEvent) => void };
} {
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const listRef = useRef<HTMLUListElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; grabOffset: number; pointerY: number; itemH: number } | null>(
    null,
  );
  const rafRef = useRef(0);
  const movedRef = useRef(false);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const prevTopsRef = useRef<Map<string, number> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const tick = () => {
    const st = drag.current;
    const list = listRef.current;
    if (!st || !list) return;
    const rect = list.getBoundingClientRect();
    const EDGE = 44;
    const SPEED = 14;
    if (st.pointerY < rect.top + EDGE) list.scrollTop -= SPEED;
    else if (st.pointerY > rect.bottom - EDGE) list.scrollTop += SPEED;

    const dragEl = rowRefs.current.get(st.id);
    if (dragEl) {
      const layoutTop = rect.top - list.scrollTop + dragEl.offsetTop;
      dragEl.style.transform = `translateY(${st.pointerY - st.grabOffset - layoutTop}px) scale(1.02)`;
    }

    const list0 = itemsRef.current;
    const topInContent = st.pointerY - st.grabOffset - rect.top + list.scrollTop;
    const target = Math.max(0, Math.min(list0.length - 1, Math.round(topInContent / st.itemH)));
    const cur = list0.findIndex((it) => getId(it) === st.id);
    if (cur !== -1 && target !== cur) {
      const next = [...list0];
      const [moved] = next.splice(cur, 1);
      if (moved) {
        next.splice(target, 0, moved);
        const tops = new Map<string, number>();
        for (const [id, el] of rowRefs.current) tops.set(id, el.getBoundingClientRect().top);
        prevTopsRef.current = tops;
        setItems(next);
        movedRef.current = true;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  useLayoutEffect(() => {
    const st = drag.current;
    const prev = prevTopsRef.current;
    const list = listRef.current;
    if (!st || !prev || !list) return;
    prevTopsRef.current = null;
    const base = list.getBoundingClientRect().top - list.scrollTop;
    for (const [id, el] of rowRefs.current) {
      if (id === st.id) continue;
      const before = prev.get(id);
      if (before == null) continue;
      // Snapshot includes any in-flight transform, so an interrupted slide continues smoothly.
      const delta = before - (base + el.offsetTop);
      if (Math.abs(delta) < 0.5) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 160ms ease';
        el.style.transform = '';
      });
    }
  }, [items]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      cleanupRef.current?.();
    },
    [],
  );

  const finishDrag = () => {
    cancelAnimationFrame(rafRef.current);
    const st = drag.current;
    const committed = movedRef.current;
    drag.current = null;
    setDragId(null);
    // Let the released row glide into its slot instead of snapping.
    const el = st ? rowRefs.current.get(st.id) : undefined;
    if (el) {
      el.style.transition = 'transform 160ms ease';
      el.style.transform = '';
      window.setTimeout(() => {
        el.style.transition = '';
        el.style.zIndex = '';
      }, 200);
    }
    if (committed) {
      const next = itemsRef.current;
      onCommit(
        next.map((it) => getId(it)),
        next,
      );
    }
  };

  const onGrabDown = (e: ReactPointerEvent, id: string) => {
    if (drag.current) return;
    const row = (e.currentTarget as HTMLElement).closest('li');
    if (!row) return;
    // Stop the browser from starting a text selection with the drag gesture.
    e.preventDefault();
    const rect = row.getBoundingClientRect();
    drag.current = {
      id,
      grabOffset: e.clientY - rect.top,
      pointerY: e.clientY,
      itemH: rect.height,
    };
    movedRef.current = false;
    row.style.transition = 'none';
    row.style.zIndex = '10';
    setDragId(id);
    // Pointer capture would break here: mid-drag reorders move the row in the DOM, which drops the
    // capture. Window listeners keep the drag alive anywhere on the page.
    const pointerId = e.pointerId;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId && drag.current) drag.current.pointerY = ev.clientY;
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanupRef.current?.();
      finishDrag();
    };
    cleanupRef.current = () => {
      cleanupRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    rafRef.current = requestAnimationFrame(tick);
  };

  return {
    listRef,
    dragId,
    registerRow: (id) => (el) => {
      if (el) rowRefs.current.set(id, el);
      else rowRefs.current.delete(id);
    },
    handleProps: (id) => ({ onPointerDown: (e) => onGrabDown(e, id) }),
  };
}
