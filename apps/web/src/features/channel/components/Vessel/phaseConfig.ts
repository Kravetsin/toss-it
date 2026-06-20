import type { LiveStatus } from '@tmw/shared';
import type { Phase } from '../../hooks/useMediaSubmission';
import type { ColorToken } from './tokens';

/**
 * Vessel visual phase: derived from real state (phase/status/cooldown), not stored separately.
 * Single source of truth for the liquid engine.
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
  // Proactive cooldown timer takes priority over empty form.
  return cooldownSec > 0 ? 'cooldown' : 'idle';
}

export interface SceneCfg {
  /** Target level 0..1; undefined for dynamic (uploading=progress, cooldown=remaining/window). */
  level?: number;
  token: ColorToken;
  amp: number;
  /** Turbulent refraction is expensive; used only for short phases. */
  turb: boolean;
  /** One-time particle burst on phase enter (via lib/burst.ts). */
  burst?: 'approve' | 'reject';
  statusLabel?: boolean;
}

export const SCENE: Record<Scene, SceneCfg> = {
  idle: { level: 0, token: 'accent', amp: 0, turb: false },
  uploading: { token: 'accent', amp: 5, turb: false },
  processing: { level: 1, token: 'accent', amp: 6, turb: true },
  // Moderation uses mint (processing water color, splash feedback) not info color.
  pending: { level: 1, token: 'accent', amp: 2.6, turb: false, statusLabel: true },
  approved: { level: 1, token: 'ok', amp: 2.6, turb: false, statusLabel: true },
  playing: { level: 1, token: 'accent', amp: 3.6, turb: true, statusLabel: true },
  played: { level: 0.3, token: 'mutedmint', amp: 2, turb: false, statusLabel: true },
  rejected: { level: 0, token: 'danger', amp: 6, turb: false, statusLabel: true, burst: 'reject' },
  expired: { level: 0, token: 'warn', amp: 4, turb: false, statusLabel: true, burst: 'reject' },
  cooldown: { token: 'accent', amp: 2, turb: false },
};
