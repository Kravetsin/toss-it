import { useEffect, useRef } from 'react';
import type { LiveStatus, SubmissionStatusEvent } from '@tmw/shared';
import { connectSocket } from '@/lib/socket';

/**
 * Live submission status over socket.io. Callback stored in ref to avoid reconnect on identity change.
 */
export function useSubmissionStatus(
  submissionId: string | null,
  onStatus: (status: LiveStatus) => void,
) {
  const cb = useRef(onStatus);
  cb.current = onStatus;

  useEffect(() => {
    if (!submissionId) return;
    const socket = connectSocket({ role: 'viewer', submission: submissionId });
    socket.on('submission:status', (e: SubmissionStatusEvent) => cb.current(e.status));
    return () => {
      socket.close();
    };
  }, [submissionId]);
}
