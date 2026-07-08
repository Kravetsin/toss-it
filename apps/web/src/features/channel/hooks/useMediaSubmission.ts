import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ttsVoices,
  type LiveStatus,
  type PublicChannelInfo,
  type UploadResponse,
} from '@tmw/shared';
import { ApiRequestError, getChannelCooldown, uploadMediaWithProgress } from '@/lib/api';
import { useCountdown } from '@/hooks/useCountdown';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { mb } from '@/lib/format';
import { useFilePreview } from './useFilePreview';
import { useSubmissionStatus } from './useSubmissionStatus';

export type Phase =
  | { name: 'idle' }
  | { name: 'uploading'; progress: number | null }
  | { name: 'done'; result: UploadResponse }
  | { name: 'error'; message: string };

const VOICE_KEY = 'tossit-tts-voice';

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
  // TTS voice is a sticky preference, not per-send state ('auto' = server picks by language).
  const [rawVoice, setVoiceState] = useState(() => localStorage.getItem(VOICE_KEY) ?? 'auto');
  const { me } = useMe();
  const availableVoices = useMemo(
    () =>
      ttsVoices.filter(
        (v) => v.costDust === 0 || (me?.user?.ownedCosmetics.includes(v.id) ?? false),
      ),
    [me],
  );
  // A stored id may point to a voice this account doesn't own — treat it as auto, don't 403.
  const voice = availableVoices.some((v) => v.id === rawVoice) ? rawVoice : 'auto';
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [cooldownSec, setCooldownSec] = useCountdown();
  // Full cooldown window — lets the Vessel fill render at the right fraction on refresh.
  const [cooldownWindowSec, setCooldownWindowSec] = useState(0);
  const previewUrl = useFilePreview(file);

  // On load/refresh, surface any remaining cooldown proactively (server knows the last send),
  // instead of only revealing it when the next send is rejected.
  useEffect(() => {
    let cancelled = false;
    void getChannelCooldown(login).then(({ cooldownSec: sec, windowSec }) => {
      if (cancelled) return;
      if (windowSec > 0) setCooldownWindowSec(windowSec);
      if (sec > 0) setCooldownSec(sec);
    });
    return () => {
      cancelled = true;
    };
  }, [login, setCooldownSec]);

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
        voice === 'auto' ? null : voice,
      );
      setLiveStatus(result.status);
      setPhase({ name: 'done', result });
      // Start cooldown proactively after successful send, not on retry-after error. 0 (channel owner) = no cooldown.
      if (result.cooldownSec > 0) {
        setCooldownWindowSec(result.cooldownSec); // fresh send = full window
        setCooldownSec(result.cooldownSec);
      }
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

  const setVoice = useCallback((id: string) => {
    setVoiceState(id);
    localStorage.setItem(VOICE_KEY, id);
  }, []);

  return {
    file,
    gif,
    text,
    setText,
    voice,
    setVoice,
    availableVoices,
    phase,
    previewUrl,
    cooldownSec,
    cooldownWindowSec,
    status,
    pickFile,
    pickGif,
    send,
    reset,
    removeFile: () => setFile(null),
    removeGif: () => setGif(null),
  };
}
