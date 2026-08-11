import { OVERLAY_POSITIONS, positionToFlex, type OverlayPosition } from '@tmw/shared';

/**
 * 3×3 anchor grid; the dot sits in the corner the anchor means (via positionToFlex).
 * Shared by the streamer's overlay settings and the sender's own placement picker — same nine
 * anchors on both sides, so what a viewer picks reads exactly like what the streamer configured.
 */
/**
 * Read-only echo of a sender's chosen layout: a 16:9 frame with a block where the post will land,
 * scaled to the size it asked for. Small enough for a queue row, and it speaks the same visual
 * language as the grid the sender picked from — a post claiming the whole screen looks like one.
 */
export function PositionMark({
  position,
  size,
  title,
}: {
  position: OverlayPosition;
  /** % of viewport the post will take, as in the layout; omit for the dot-sized default. */
  size?: number | null;
  title: string;
}) {
  const { justify, align } = positionToFlex(position);
  // Floored so a small send still leaves something visible to see at this scale.
  const pct = Math.max(15, Math.min(100, size ?? 15));
  return (
    <span
      title={title}
      aria-label={title}
      style={{ justifyContent: justify, alignItems: align }}
      className="flex h-3.5 w-[22px] shrink-0 border border-accent/60 p-[1px]"
    >
      <span className="bg-accent" style={{ width: `${pct}%`, height: `${pct}%` }} />
    </span>
  );
}

export function PositionGrid({
  value,
  onChange,
}: {
  /** null = nothing picked yet (the sender's picker starts there; settings never pass it). */
  value: OverlayPosition | null;
  onChange: (p: OverlayPosition) => void;
}) {
  return (
    <div className="grid w-max grid-cols-3 gap-1">
      {OVERLAY_POSITIONS.map((p) => {
        const { justify, align } = positionToFlex(p);
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            aria-label={p}
            aria-pressed={active}
            onClick={() => onChange(p)}
            style={{ justifyContent: justify, alignItems: align }}
            className={`flex h-9 w-9 cursor-pointer border p-1.5 transition-colors ${
              active
                ? 'border-accent bg-accent-soft'
                : 'border-border bg-surface-2 hover:border-accent'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${active ? 'bg-accent' : 'bg-muted'}`} />
          </button>
        );
      })}
    </div>
  );
}
