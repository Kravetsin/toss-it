import type { MediaKind } from '@tmw/shared';
import { formatDuration, type TFn } from '@/i18n';
import type { IconName } from '@/ui/icons';

export const KIND_ICON: Record<MediaKind, IconName> = {
  image: 'image',
  video: 'play',
  audio: 'volume-2',
  text: 'send',
  youtube: 'play',
  gif: 'image',
};

export function formatTrackDuration(kind: MediaKind, durationMs: number, t: TFn): string {
  return kind === 'youtube' && durationMs <= 0 ? '∞' : formatDuration(durationMs, t);
}
