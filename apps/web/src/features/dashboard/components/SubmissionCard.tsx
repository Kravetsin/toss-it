import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useFillEffect } from '@/ui/useFillEffect';
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react';
import {
  frameEffectClass,
  LEVEL_GLOW_FROM,
  levelTier,
  toRoman,
  type ReputationStats,
  type SubmissionSummary,
} from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useClipboard } from '@/hooks/useClipboard';
import { useFidgetEnabled } from '@/hooks/useFidgetEnabled';
import { disintegrate } from '@/lib/burst';
import { Icon } from '@/ui/icons';
import { IconButton } from '@/ui';
import { PlatformIcon, SealMark, UserBadges } from '@/components/UserMarks';
import { CardEffect } from '@/components/CardEffect';
import { nickProps } from '@/lib/nick';
import { formatTrackDuration } from '../constants';
import { sourceLink } from '../lib/sourceLink';
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
  // Sender's per-channel rank: color rail on the left edge + Roman numeral by the name (glow from 6).
  const tier = s.senderLevel ? levelTier(s.senderLevel) : null;
  const levelGlow = !!tier && (s.senderLevel ?? 0) >= LEVEL_GLOW_FROM;
  const nick = nickProps({
    color: s.senderColor,
    color2: s.senderColor2,
    flow: s.senderNickFlow,
    effect: s.senderEffect,
  });
  const { fillRef, handlers: fillHandlers } = useFillEffect();
  const { copiedKey, copy } = useClipboard();
  const link = sourceLink(s);
  const [expanded, setExpanded] = useState(false);
  const [fx, setFx] = useState<'approve' | 'reject' | null>(null);
  const fidget = useFidgetEnabled();
  const outerRef = useRef<HTMLDivElement>(null);
  // Track drag to distinguish from tap: prevent expansion on slight drag (tap only).
  const draggedRef = useRef(false);
  const reduce = useReducedMotion();
  const dragControls = useDragControls();
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

  // Drag is started by hand (dragListener={false}) so content marked data-no-drag keeps the pointer:
  // text stays selectable, links clickable, media scrubbable. Anywhere else on the card swipes.
  const startDrag = (e: ReactPointerEvent) => {
    if (e.target instanceof Element && e.target.closest('[data-no-drag]')) return;
    dragControls.start(e);
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
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        style={{ x, opacity: cardOpacity, touchAction: 'pan-y' }}
        onPointerDownCapture={() => {
          draggedRef.current = false;
        }}
        onPointerDown={startDrag}
        onDragStart={() => {
          draggedRef.current = true;
        }}
        onDragEnd={onDragEnd}
        {...fillHandlers}
        className={`relative cursor-grab bg-surface active:cursor-grabbing ${frameEffectClass(s.senderFrame)}`}
      >
        <span
          ref={fillRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', clipPath: 'circle(0% at 50% 50%)' }}
        />
        <CardEffect effect={s.senderCardEffect} color={s.senderCardEffectColor} />
        {tier && (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-0 z-[1] w-[3px] ${tier.iris ? 'lvl-iris' : ''}`}
            style={{
              background: tier.color,
              boxShadow: levelGlow ? `0 0 7px ${tier.color}` : undefined,
            }}
          />
        )}
        <button
          type="button"
          onClick={() => {
            if (draggedRef.current) return;
            setExpanded((e) => !e);
          }}
          aria-expanded={expanded}
          // The row both expands and swipes; the cursor advertises the click (the swipe is spelled
          // out above the queue) and flips to grabbing once a drag is actually under way.
          className="relative z-[1] flex w-full cursor-pointer items-center gap-3 p-3 text-left outline-none focus-visible:[box-shadow:inset_var(--shadow-focus)] active:cursor-grabbing"
        >
          <SubmissionThumb s={s} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              {tier && (
                <span
                  className={`shrink-0 text-xs font-bold ${tier.iris ? 'lvl-iris' : ''}`}
                  style={{
                    color: tier.color,
                    textShadow: levelGlow ? `0 0 6px ${tier.color}` : undefined,
                  }}
                >
                  {toRoman(s.senderLevel!)}
                </span>
              )}
              <SealMark seal={s.senderSeal} />
              <b className={`truncate text-sm text-text ${nick.className}`} style={nick.style}>
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
          <div className="relative z-[1] select-text border-t border-border p-3">
            <SubmissionPreview s={s} />
            <div className="mt-3 flex items-center justify-end gap-2">
              {/* Take-away actions live far left, away from the two irreversible ones, and always in
                  the same spot — only their presence depends on what the submission carries. */}
              {(s.text || link) && (
                <div className="mr-auto flex items-center gap-2">
                  {s.text && (
                    <IconButton
                      name={copiedKey ? 'check' : 'copy'}
                      label={t('dash.copyText')}
                      size="sm"
                      active={!!copiedKey}
                      onClick={() => copy(s.text!)}
                    />
                  )}
                  {link && (
                    <IconButton
                      name={link.download ? 'download' : 'external-link'}
                      label={link.download ? t('dash.download') : t('dash.openSource')}
                      size="sm"
                      href={link.href}
                      download={link.download}
                      newTab={!link.download}
                    />
                  )}
                </div>
              )}
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
