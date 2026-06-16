import type { HistoryEntry, MediaKind } from '@tmw/shared';
import { formatDuration, type TFn } from '@/i18n';
import type { IconName } from '@/ui/icons';

export const KIND_ICON: Record<MediaKind, IconName> = {
  image: 'image',
  video: 'play',
  audio: 'volume-2',
  text: 'send',
  youtube: 'play',
};

export const STATUS_ICON: Record<HistoryEntry['status'], { icon: IconName; cls: string }> = {
  pending: { icon: 'clock', cls: 'text-warn' },
  approved: { icon: 'check', cls: 'text-ok' },
  played: { icon: 'play', cls: 'text-ok' },
  rejected: { icon: 'close', cls: 'text-danger' },
  expired: { icon: 'clock', cls: 'text-muted' },
};

/** Длительность трека: ∞ для YouTube без известной длительности, иначе обычное форматирование. */
export function formatTrackDuration(kind: MediaKind, durationMs: number, t: TFn): string {
  return kind === 'youtube' && durationMs <= 0 ? '∞' : formatDuration(durationMs, t);
}
