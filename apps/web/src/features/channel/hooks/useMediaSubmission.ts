import { useCallback, useState } from 'react';
import type { LiveStatus, PublicChannelInfo, UploadResponse } from '@tmw/shared';
import { ApiRequestError, uploadMediaWithProgress } from '@/lib/api';
import { useCountdown } from '@/hooks/useCountdown';
import { useI18n } from '@/i18n';
import { mb } from '@/lib/format';
import { useFilePreview } from './useFilePreview';
import { useSubmissionStatus } from './useSubmissionStatus';

export type Phase =
  | { name: 'idle' }
  | { name: 'uploading'; progress: number | null }
  | { name: 'done'; result: UploadResponse }
  | { name: 'error'; message: string };

/** A GIF picked from the Giphy picker — referenced by id, never uploaded. */
export interface SelectedGif {
  id: string;
  previewUrl: string;
  title: string;
}

/**
 * Media submission logic: file selection/validation, text, upload with progress, cooldown, live status via socket.
 */
export function useMediaSubmission(
  channel: PublicChannelInfo | null,
  login: string,
  onPlayed: () => void,
) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [gif, setGif] = useState<SelectedGif | null>(null);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [cooldownSec, setCooldownSec] = useCountdown();
  const previewUrl = useFilePreview(file);

  const pickFile = useCallback(
    (f: File | null) => {
      if (!f || !channel) return;
      if (f.size > channel.maxFileSizeBytes) {
        setPhase({
          name: 'error',
          message: t('channel.tooBig', { mb: mb(channel.maxFileSizeBytes) }),
        });
        return;
      }
      setPhase({ name: 'idle' });
      setGif(null); // file and gif are mutually exclusive
      setFile(f);
    },
    [channel, t],
  );

  // Picking a GIF replaces any selected file (one media per submission).
  const pickGif = useCallback((g: SelectedGif) => {
    setPhase({ name: 'idle' });
    setFile(null);
    setGif(g);
  }, []);

  async function send() {
    if (!file && !gif && !text.trim()) return;
    setPhase({ name: 'uploading', progress: 0 });
    try {
      const result = await uploadMediaWithProgress(
        login,
        file,
        text,
        (progress) => setPhase({ name: 'uploading', progress }),
        gif?.id,
      );
      setLiveStatus(result.status);
      setPhase({ name: 'done', result });
      // Start cooldown proactively after successful send, not on retry-after error. 0 (channel owner) = no cooldown.
      if (result.cooldownSec > 0) setCooldownSec(result.cooldownSec);
      setFile(null);
      setGif(null);
      setText('');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'cooldown' && err.retryAfterSec) {
        setCooldownSec(err.retryAfterSec);
        setPhase({ name: 'idle' });
        return;
      }
      setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function reset() {
    setPhase({ name: 'idle' });
    setLiveStatus(null);
    setFile(null);
    setGif(null);
    setText('');
  }

  // Live status via socket keyed to submission id when done.
  const doneId = phase.name === 'done' ? phase.result.id : null;
  useSubmissionStatus(doneId, (status) => {
    setLiveStatus(status);
    if (status === 'played') onPlayed();
  });

  const status = liveStatus ?? (phase.name === 'done' ? phase.result.status : null);

  return {
    file,
    gif,
    text,
    setText,
    phase,
    previewUrl,
    cooldownSec,
    status,
    pickFile,
    pickGif,
    send,
    reset,
    removeFile: () => setFile(null),
    removeGif: () => setGif(null),
  };
}
