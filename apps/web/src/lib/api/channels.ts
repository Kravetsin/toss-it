import type {
  AccessibleChannel,
  ChannelSelf,
  LeaderboardEntry,
  PublicChannelInfo,
  UploadResponse,
  ApiError,
} from '@tmw/shared';
import { ApiRequestError, json } from './http';

export function createChannel(): Promise<ChannelSelf> {
  return fetch('/api/channels', { method: 'POST' }).then((r) => json<ChannelSelf>(r));
}

export function rotateOverlayToken(): Promise<ChannelSelf> {
  return fetch('/api/channels/rotate-token', { method: 'POST' }).then((r) => json<ChannelSelf>(r));
}

export async function getChannel(login: string): Promise<PublicChannelInfo | null> {
  const res = await fetch(`/api/c/${encodeURIComponent(login)}`);
  if (res.status === 404) return null;
  return json<PublicChannelInfo>(res);
}

export function uploadMedia(login: string, file: File): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append('file', file);
  return fetch(`/api/c/${encodeURIComponent(login)}/upload`, {
    method: 'POST',
    body: fd,
  }).then((r) => json<UploadResponse>(r));
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
    xhr.send(fd);
  });
}

export function getMyChannels(): Promise<AccessibleChannel[]> {
  return fetch('/api/me/channels').then((r) => json<AccessibleChannel[]>(r));
}

export function getLeaderboard(login: string): Promise<LeaderboardEntry[]> {
  return fetch(`/api/c/${encodeURIComponent(login)}/leaderboard`).then((r) =>
    json<LeaderboardEntry[]>(r),
  );
}

/** Remaining viewer cooldown (seconds) for the current user; 0 on any error/logged out. */
export function getChannelCooldown(login: string): Promise<number> {
  return fetch(`/api/c/${encodeURIComponent(login)}/cooldown`)
    .then((r) => (r.ok ? (r.json() as Promise<{ cooldownSec: number }>) : { cooldownSec: 0 }))
    .then((d) => d.cooldownSec)
    .catch(() => 0);
}
