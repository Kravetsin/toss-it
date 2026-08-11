import { positionToFlex, type OverlayPosition } from '@tmw/shared';

/**
 * 16:9 stand-in for the stream, with the post drawn where it will land and at the size it will
 * take. Shared by the streamer's settings and the sender's own picker — nobody should have to
 * work out what a position/size/margin trio adds up to by moving sliders and hoping.
 */
export function LayoutPreview({
  position,
  size,
  margin,
  label,
  caption,
}: {
  position: OverlayPosition;
  size: number;
  margin: number;
  /** Text inside the block — whose post this is ("Media", "your post"). */
  label: string;
  /** Heading above the frame; omit where the surrounding UI already says what this is. */
  caption?: string;
}) {
  const { justify, align } = positionToFlex(position);
  return (
    <div>
      {caption && <span className="text-sm text-muted">{caption}</span>}
      <div
        className={`flex aspect-[16/9] w-full overflow-hidden border border-border bg-surface-2 ${caption ? 'mt-1' : ''}`}
        style={{ justifyContent: justify, alignItems: align }}
      >
        <div
          // overflow-hidden: at the smallest sizes the block is narrower than its own label.
          className="flex shrink-0 items-center justify-center overflow-hidden border border-accent bg-accent-soft text-center text-[10px] leading-tight text-accent"
          style={{
            width: `${size}%`,
            height: `${size}%`,
            marginInline: `${margin}%`,
            // The frame is 16:9, so an equal margin in % would be visibly deeper left/right.
            marginBlock: `${(margin * 9) / 16}%`,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
