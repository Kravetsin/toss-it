import { useRef, useState } from 'react';
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
 * Строка очереди: единая высота, мини-тумба + текст; тап разворачивает (полное превью + кнопки).
 * Горизонтальный свайп → одобрить, ← отклонить (drag="x" пропускает вертикальный скролл — touch-action: pan-y).
 * Reduced-motion: без полёта карты, действие срабатывает сразу.
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
  const [expanded, setExpanded] = useState(false);
  const [gone, setGone] = useState(false);
  // Был ли драг в этом жесте — чтобы лёгкое подтягивание не раскрывало карточку (только чистый тап).
  const draggedRef = useRef(false);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const approveOpacity = useTransform(x, [10, SWIPE_DISTANCE], [0, 1]);
  const rejectOpacity = useTransform(x, [-SWIPE_DISTANCE, -10], [1, 0]);

  // После свайпа скрываем строку (gone), а НЕ возвращаем на место: иначе в реальном
  // приложении карта «прыгнет» обратно и исчезнет позже, когда придёт удаление по сокету.
  // (Удаление по сокету затем размонтирует компонент; в моке строка просто скрыта.)
  const dismiss = (action: () => void) => {
    action();
    setGone(true);
  };
  const commit = (dir: 1 | -1, action: () => void) => {
    if (reduce) {
      dismiss(action);
      return;
    }
    const w = typeof window !== 'undefined' ? window.innerWidth : 800;
    animate(x, dir * w, {
      duration: 0.28,
      ease: [0.25, 0, 0, 1],
      onComplete: () => dismiss(action),
    });
  };

  const onDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) commit(1, onApprove);
    else if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) commit(-1, onReject);
    else if (reduce) x.set(0);
    else animate(x, 0, HOME_SPRING);
  };

  if (gone) return null;

  return (
    <div className="relative select-none overflow-hidden border border-border">
      {/* Подложки-подсказки свайпа (видны, когда карта уезжает). */}
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
        style={{ x, touchAction: 'pan-y' }}
        onPointerDownCapture={() => {
          draggedRef.current = false;
        }}
        onDragStart={() => {
          draggedRef.current = true;
        }}
        onDragEnd={onDragEnd}
        className="relative cursor-grab bg-surface active:cursor-grabbing"
      >
        {/* Свёрнутая строка — раскрывается только чистым тапом (драг не раскрывает). */}
        <button
          type="button"
          onClick={() => {
            if (draggedRef.current) return;
            setExpanded((e) => !e);
          }}
          aria-expanded={expanded}
          className="flex w-full items-center gap-3 p-3 text-left outline-none focus-visible:[box-shadow:inset_var(--shadow-focus)]"
        >
          <SubmissionThumb s={s} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <b className="truncate text-sm text-text">{s.senderName ?? t('common.anon')}</b>
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

        {/* Развёрнуто: полное превью + все действия (Trust/Later/Ban здесь). */}
        {expanded && (
          <div className="border-t border-border p-3">
            {rep && (
              <div className="mb-2">
                <RepChip rep={rep} />
              </div>
            )}
            <SubmissionPreview s={s} />
            {/* Одобрить/отклонить — свайпом. Здесь только редкие действия, иконками. */}
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
    </div>
  );
}
