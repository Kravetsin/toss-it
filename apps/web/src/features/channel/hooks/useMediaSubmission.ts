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

/**
 * Поведенческое ядро отправки медиа: выбор/валидация файла, текст, загрузка с прогрессом,
 * кулдаун, живой статус по сокету. Компонент остаётся преимущественно презентационным.
 */
export function useMediaSubmission(
  channel: PublicChannelInfo | null,
  login: string,
  onPlayed: () => void,
) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [cooldownSec, setCooldownSec] = useCountdown();
  const previewUrl = useFilePreview(file);

  const pickFile = useCallback(
    (f: File | null) => {
      if (!f || !channel) return;
      if (f.size > channel.maxFileSizeBytes) {
        setPhase({ name: 'error', message: t('channel.tooBig', { mb: mb(channel.maxFileSizeBytes) }) });
        return;
      }
      setPhase({ name: 'idle' });
      setFile(f);
    },
    [channel, t],
  );

  async function send() {
    if (!file && !text.trim()) return;
    setPhase({ name: 'uploading', progress: 0 });
    try {
      const result = await uploadMediaWithProgress(login, file, text, (progress) =>
        setPhase({ name: 'uploading', progress }),
      );
      setLiveStatus(result.status);
      setPhase({ name: 'done', result });
      setFile(null);
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
    setText('');
  }

  // Живой статус по сокету привязан к id завершённой отправки.
  const doneId = phase.name === 'done' ? phase.result.id : null;
  useSubmissionStatus(doneId, (status) => {
    setLiveStatus(status);
    if (status === 'played') onPlayed();
  });

  const status = liveStatus ?? (phase.name === 'done' ? phase.result.status : null);

  return {
    file,
    text,
    setText,
    phase,
    previewUrl,
    cooldownSec,
    status,
    pickFile,
    send,
    reset,
    removeFile: () => setFile(null),
  };
}
