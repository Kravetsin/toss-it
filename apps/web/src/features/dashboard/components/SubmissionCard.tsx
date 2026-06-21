import { useRef, useState } from 'react';
import { useFillEffect } from '@/ui/useFillEffect';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react';
import type { ReputationStats, SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useFidgetEnabled } from '@/hooks/useFidgetEnabled';
import { disintegrate } from '@/lib/burst';
import { Icon } from '@/ui/icons';
import { IconButton } from '@/ui';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';
import { formatTrackDuration } from '../constants';
import { RepChip } from './RepChip';
import { SubmissionThumb } from './SubmissionThumb';
import { SubmissionPreview } from './SubmissionPreview';

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 600;
const HOME_SPRING = { type: 'spring', stiffness: 600, damping: 42 } as const;

/**
 * Queue item: tap expands to full preview + actions. Swipe right to approve, left to reject (drag="x" with pan-y touch-action preserves vertical scroll).
 * Reduced-motion: commits action immediately without animation.
 */
export function SubmissionCard({
  s,
  rep,
  onApprove,
  onTrust,
  onReject,
  onBan,
}: {
  s: SubmissionSummary;
  rep?: ReputationStats;
  onApprove: () => void;
  onTrust: () => void;
  onReject: () => void;
  onBan: () => void;
}) {
  const { t } = useI18n();
  const { fillRef, handlers: fillHandlers } = useFillEffect();
  const [expanded, setExpanded] = useState(false);
  const [fx, setFx] = useState<'approve' | 'reject' | null>(null);
  const fidget = useFidgetEnabled();
  const outerRef = useRef<HTMLDivElement>(null);
  // Track drag to distinguish from tap: prevent expansion on slight drag (tap only).
  const draggedRef = useRef(false);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const cardOpacity = useMotionValue(1);
  const approveOpacity = useTransform(x, [10, SWIPE_DISTANCE], [0, 1]);
  const rejectOpacity = useTransform(x, [-SWIPE_DISTANCE, -10], [1, 0]);

  // On swipe commit: disintegrate particles (overlay), fade card, then trigger action. Reduced-motion skips animation.
  const commit = (dir: 1 | -1, action: () => void) => {
    const kind = dir === 1 ? 'approve' : 'reject';
    if (fidget) {
      const r = outerRef.current?.getBoundingClientRect();
      if (r) disintegrate(r, kind, dir);
    }
    if (reduce) {
      action();
      return;
    }
    setFx(kind);
    animate(cardOpacity, 0, {
      duration: kind === 'approve' ? 0.34 : 0.3,
      ease: [0.4, 0, 0.2, 1],
      onComplete: action,
    });
  };

  const onDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) commit(1, onApprove);
    else if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) commit(-1, onReject);
    else if (reduce) x.set(0);
    else animate(x, 0, HOME_SPRING);
  };

  return (
    <div ref={outerRef} className="relative select-none overflow-hidden border border-border">
      <motion.div
        style={{ opacity: approveOpacity }}
        className="pointer-events-none absolute inset-0 flex items-center gap-2 bg-ok-soft px-4 label-mono text-ok"
      >
        <Icon name="check" size={16} />
        {t('dash.approve')}
      </motion.div>
      <motion.div
        style={{ opacity: rejectOpacity }}
        className="pointer-events-none absolute inset-0 flex items-center justify-end gap-2 bg-danger-soft px-4 label-mono text-danger"
      >
        {t('dash.reject')}
        <Icon name="close" size={16} />
      </motion.div>

      <motion.div
        drag="x"
        dragMomentum={false}
        style={{ x, opacity: cardOpacity, touchAction: 'pan-y' }}
        onPointerDownCapture={() => {
          draggedRef.current = false;
        }}
        onDragStart={() => {
          draggedRef.current = true;
        }}
        onDragEnd={onDragEnd}
        {...fillHandlers}
        className="relative cursor-grab bg-surface active:cursor-grabbing"
      >
        <span
          ref={fillRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', clipPath: 'circle(0% at 50% 50%)' }}
        />
        <button
          type="button"
          onClick={() => {
            if (draggedRef.current) return;
            setExpanded((e) => !e);
          }}
          aria-expanded={expanded}
          className="relative z-[1] flex w-full items-center gap-3 p-3 text-left outline-none focus-visible:[box-shadow:inset_var(--shadow-focus)]"
        >
          <SubmissionThumb s={s} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <b
                className="truncate text-sm text-text"
                style={s.senderColor ? { color: s.senderColor } : undefined}
              >
                {s.senderName ?? t('common.anon')}
              </b>
              <RepChip rep={rep} />
              <PlatformIcon userId={s.senderUserId} size={13} />
              <UserBadges isFounder={rep?.isFounder} variant="icons" />
              <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted">
                {formatTrackDuration(s.kind, s.durationMs, t)} ·{' '}
                {new Date(s.createdAt).toLocaleTimeString()}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-sm text-muted">
              {s.text ?? t(`kind.${s.kind}`)}
            </span>
          </span>
          <Icon
            name="play"
            size={13}
            className={`shrink-0 text-faint transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </button>

        {expanded && (
          <div className="relative z-[1] border-t border-border p-3">
            <SubmissionPreview s={s} />
            <div className="mt-3 flex items-center justify-end gap-2">
              <IconButton
                name="star"
                label={t('dash.approveWhitelist')}
                size="sm"
                onClick={onTrust}
                className="hover:border-accent hover:text-accent"
              />
              <IconButton
                name="user-x"
                label={t('dash.ban')}
                size="sm"
                onClick={onBan}
                className="hover:border-danger hover:text-danger"
              />
            </div>
          </div>
        )}
      </motion.div>

      {fx && (
        <div
          className={`pointer-events-none absolute inset-0 z-20 ${fx === 'approve' ? 'bg-accent' : ''}`}
          style={{
            animation: `${fx === 'approve' ? 'fx-flash-ok' : 'fx-flash-bad'} 0.34s linear forwards`,
          }}
        />
      )}
    </div>
  );
}
