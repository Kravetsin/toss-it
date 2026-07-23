import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n';
import { useWhatsNew } from '@/providers/WhatsNewProvider';

/** How long the dot must stay on screen before it counts as read — scrolling past it doesn't. */
const DWELL_MS = 900;

/**
 * `corner`: pin the mark to the top-right of a `relative` parent so it breaks the button's edge
 * instead of sitting inside it — a dot that shares a box with a label reads as part of the label.
 * It also gets a spreading ring, which is what actually catches the eye off-centre. Inline marks
 * (rows, tabs) stay a quiet dot: the ring is for pulling someone TO the shop, not for shouting at
 * them once they're reading it.
 */
function Dot({
  className,
  label,
  corner = false,
}: {
  className: string;
  label: string;
  corner?: boolean;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`pointer-events-none shrink-0 ${
        corner ? 'absolute -right-1 -top-1 inline-flex size-2' : 'inline-flex size-1.5'
      } ${className}`}
    >
      {corner && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-accent opacity-70 motion-safe:animate-ping"
        />
      )}
      <span
        className={`relative size-full rounded-full bg-accent shadow-[0_0_6px_var(--color-accent)] ${
          corner ? '' : 'motion-safe:animate-pulse'
        }`}
      />
    </span>
  );
}

/**
 * "New since your last visit" mark for ONE catalog entry, next to its name.
 *
 * It watches ITSELF: the dot dismisses once it has been on screen for a moment, so the mark goes
 * out because the viewer met the thing, not because they opened the drawer it lives in. Dismissing
 * a whole screen on open is what turns these dots into noise — the one row that mattered gets
 * cleared along with everything the viewer never scrolled to.
 */
export function NewDot({ id, className = '' }: { id: string; className?: string }) {
  const { t } = useI18n();
  const { isNew, markSeen } = useWhatsNew();
  const ref = useRef<HTMLSpanElement>(null);
  const show = isNew(id);

  useEffect(() => {
    const el = ref.current;
    if (!show || !el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Half of a 6px dot is a low bar by design: the row's name sits right beside it, so seeing the
    // dot means seeing what it points at. A closed drawer is parked off-screen and never fires.
    const io = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (entry?.isIntersecting) timer = setTimeout(() => markSeen(id), DWELL_MS);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, [id, show, markSeen]);

  if (!show) return null;
  return (
    <span ref={ref} className="inline-flex">
      <Dot className={className} label={t('common.new')} />
    </span>
  );
}

/**
 * The same mark for a CONTAINER — a shop tab, a group, the wallet button. Purely inherited: it
 * shows while any entry under it is unread and goes out on its own once they all are, so there is
 * no way to clear a parent without meeting the child it was pointing to. `ids` omitted = the whole
 * catalog (the shop entry points).
 */
export function NewDotGroup({
  ids,
  className = '',
  corner = false,
}: {
  ids?: readonly string[];
  className?: string;
  /** Hang off the parent's top-right corner — the parent must be `relative`. */
  corner?: boolean;
}) {
  const { t } = useI18n();
  const { hasNew } = useWhatsNew();
  if (!hasNew(ids)) return null;
  return <Dot className={className} label={t('common.new')} corner={corner} />;
}
