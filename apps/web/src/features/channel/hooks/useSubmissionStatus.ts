import { useEffect, useRef } from 'react';
import type { LiveStatus, SubmissionStatusEvent } from '@tmw/shared';
import { connectSocket } from '@/lib/socket';

/**
 * Живой статус отправки зрителя по socket.io: подписывается, когда есть submissionId.
 * Колбэк читается через ref — смена его идентичности не переподключает сокет.
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
