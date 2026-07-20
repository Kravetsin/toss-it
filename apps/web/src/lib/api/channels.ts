import type {
  AccessibleChannel,
  ChannelSelf,
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardPeriod,
  PublicChannelInfo,
  UploadResponse,
  ApiError,
} from '@tmw/shared';
import { ApiRequestError, json } from './http';

/** `locale` seeds the chat bot's answer language from the dashboard the streamer is using. */
export function createChannel(locale?: string): Promise<ChannelSelf> {
  return fetch('/api/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  }).then((r) => json<ChannelSelf>(r));
}

export function rotateOverlayToken(): Promise<ChannelSelf> {
  return fetch('/api/channels/rotate-token', { method: 'POST' }).then((r) => json<ChannelSelf>(r));
}

export async function getChannel(login: string): Promise<PublicChannelInfo | null> {
  const res = await fetch(`/api/c/${encodeURIComponent(login)}`);
  if (res.status === 404) return null;
  return json<PublicChannelInfo>(res);
}

/**
 * Uses XHR for upload progress (fetch lacks upload events).
 * onProgress: 0..1 while uploading, then null while server processes (e.g. transcoding).
 */
export function uploadMediaWithProgress(
  login: string,
  file: File | null,
  text: string,
  onProgress: (value: number | null) => void,
  giphyId?: string | null,
  voice?: string | null,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/c/${encodeURIComponent(login)}/upload`);
    xhr.responseType = 'json';

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded >= e.total ? null : e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiRequestError('Сервер недоступен'));
    xhr.onload = () => {
      const body = xhr.response as UploadResponse | ApiError | null;
      if (xhr.status >= 200 && xhr.status < 300 && body && !('error' in body)) {
        resolve(body);
      } else {
        const e = (body ?? {}) as ApiError;
        reject(
          new ApiRequestError(
            'error' in e ? e.error : `Ошибка ${xhr.status}`,
            e.code,
            e.retryAfterSec,
          ),
        );
      }
    };

    const fd = new FormData();
    if (file) fd.append('file', file);
    if (text.trim()) fd.append('text', text.trim());
    if (giphyId) fd.append('giphyId', giphyId);
    if (voice) fd.append('voice', voice);
    xhr.send(fd);
  });
}

/**
 * Owner's overlay test: the same upload endpoint as a viewer send, so settings, TTS, the queue and
 * the layout are all the real ones. Nothing marks it as a test — the server sees the owner sending
 * to their own channel and keeps it out of every counter by itself.
 */
export function sendTestPost(
  login: string,
  payload: { file?: File | null; text?: string; giphyId?: string | null },
): Promise<UploadResponse> {
  const fd = new FormData();
  if (payload.file) fd.append('file', payload.file);
  if (payload.text?.trim()) fd.append('text', payload.text.trim());
  if (payload.giphyId) fd.append('giphyId', payload.giphyId);
  return fetch(`/api/c/${encodeURIComponent(login)}/upload`, { method: 'POST', body: fd }).then(
    (r) => json<UploadResponse>(r),
  );
}

export function getMyChannels(): Promise<AccessibleChannel[]> {
  return fetch('/api/me/channels').then((r) => json<AccessibleChannel[]>(r));
}

export function getLeaderboard(
  login: string,
  metric: LeaderboardMetric = 'sends',
  period: LeaderboardPeriod = 'all',
): Promise<LeaderboardEntry[]> {
  return fetch(
    `/api/c/${encodeURIComponent(login)}/leaderboard?metric=${metric}&period=${period}`,
  ).then((r) => json<LeaderboardEntry[]>(r));
}

/**
 * Remaining viewer cooldown for the current user plus the full cooldown window (so the UI can
 * show the fill at the right fraction after a refresh). Zeroes on any error/logged out.
 */
export function getChannelCooldown(
  login: string,
): Promise<{ cooldownSec: number; windowSec: number }> {
  return fetch(`/api/c/${encodeURIComponent(login)}/cooldown`)
    .then((r) =>
      r.ok
        ? (r.json() as Promise<{ cooldownSec: number; windowSec: number }>)
        : { cooldownSec: 0, windowSec: 0 },
    )
    .catch(() => ({ cooldownSec: 0, windowSec: 0 }));
}
