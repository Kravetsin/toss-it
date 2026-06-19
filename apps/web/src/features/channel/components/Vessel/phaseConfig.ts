import type { LiveStatus } from '@tmw/shared';
import type { Phase } from '../../hooks/useMediaSubmission';
import type { ColorToken } from './tokens';

/**
 * Визуальная фаза «Сосуда» — единственный источник правды для движка жидкости.
 * Выводится из реального состояния (phase/status/cooldown), а не хранит свою логику.
 */
export type Scene =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'pending'
  | 'approved'
  | 'playing'
  | 'played'
  | 'rejected'
  | 'expired'
  | 'cooldown';

export function sceneFromProps(
  phase: Phase,
  status: LiveStatus | null,
  cooldownSec: number,
): Scene {
  if (phase.name === 'uploading') return phase.progress === null ? 'processing' : 'uploading';
  if (phase.name === 'done') return (status ?? 'pending') as Scene;
  // idle / error: проактивный таймер кулдауна важнее пустой формы.
  return cooldownSec > 0 ? 'cooldown' : 'idle';
}

export interface SceneCfg {
  /** Целевой уровень 0..1; undefined → динамически (uploading=progress, cooldown=remaining/window). */
  level?: number;
  token: ColorToken;
  /** Амплитуда волны в px. */
  amp: number;
  /** Турбулентная рефракция (дорогая; только короткие фазы). */
  turb: boolean;
  /** Разовый разлёт частиц при входе (через lib/burst.ts). */
  burst?: 'approve' | 'reject';
  /** Фаза несёт текстовый статус status.*. */
  statusLabel?: boolean;
}

export const SCENE: Record<Scene, SceneCfg> = {
  idle: { level: 0, token: 'accent', amp: 0, turb: false },
  uploading: { token: 'accent', amp: 5, turb: false },
  processing: { level: 1, token: 'accent', amp: 6, turb: true },
  // «На модерации» несёт перенесённый пик: мятный (как вода обработки и брызги), не info.
  pending: { level: 1, token: 'accent', amp: 2.6, turb: false, statusLabel: true },
  approved: { level: 1, token: 'ok', amp: 2.6, turb: false, statusLabel: true },
  playing: { level: 1, token: 'accent', amp: 3.6, turb: true, statusLabel: true },
  played: { level: 0.3, token: 'mutedmint', amp: 2, turb: false, statusLabel: true },
  rejected: { level: 0, token: 'danger', amp: 6, turb: false, statusLabel: true, burst: 'reject' },
  expired: { level: 0, token: 'warn', amp: 4, turb: false, statusLabel: true, burst: 'reject' },
  cooldown: { token: 'accent', amp: 2, turb: false },
};
