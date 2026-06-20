import { useEffect } from 'react';
import type { SubmissionSummary } from '@tmw/shared';

/**
 * Queue hotkeys: intentionally no dependency array so handler always sees
 * current pending and callbacks on each render.
 */
export function useQueueHotkeys({
  active,
  pending,
  onApprove,
  onTrust,
  onReject,
  onBan,
}: {
  active: boolean;
  pending: SubmissionSummary[];
  onApprove: (s: SubmissionSummary) => void;
  onTrust: (s: SubmissionSummary) => void;
  onReject: (s: SubmissionSummary) => void;
  onBan: (s: SubmissionSummary) => void;
}) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (el?.closest('[data-media-player]')) return; // focus inside player — its keys take precedence
      if (document.querySelector('[role="dialog"]')) return; // skip if ban confirm open
      const cur = pending[0];
      if (!cur) return;
      const k = e.key.toLowerCase();
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        onApprove(cur);
      } else if (k === 'r' || e.key === 'ArrowLeft') {
        e.preventDefault();
        onReject(cur);
      } else if (k === 'w') {
        e.preventDefault();
        onTrust(cur);
      } else if (k === 'b') {
        e.preventDefault();
        onBan(cur);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}
