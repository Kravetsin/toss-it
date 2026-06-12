import type {
  ApiError,
  ChannelSelf,
  ChannelSettings,
  HistoryEntry,
  ListedUser,
  MeResponse,
  PublicChannelInfo,
  SubmissionSummary,
  UploadResponse,
} from '@tmw/shared';

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T | ApiError;
  if (!res.ok) {
    throw new Error('error' in (body as ApiError) ? (body as ApiError).error : `HTTP ${res.status}`);
  }
  return body as T;
}

export function getMe(): Promise<MeResponse> {
  return fetch('/api/auth/me').then((r) => json<MeResponse>(r));
}

export function logout(): Promise<unknown> {
  return fetch('/api/auth/logout', { method: 'POST' });
}

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
 * Загрузка с прогрессом (XHR — у fetch нет upload-прогресса).
 * onProgress: 0..1 пока файл едет на сервер, затем null = «сервер обрабатывает»
 * (транскодирование может занимать секунды, особенно на слабом хостинге).
 */
export function uploadMediaWithProgress(
  login: string,
  file: File,
  onProgress: (value: number | null) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/c/${encodeURIComponent(login)}/upload`);
    xhr.responseType = 'json';

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded >= e.total ? null : e.loaded / e.total);
    };
    xhr.onerror = () => reject(new Error('Сервер недоступен'));
    xhr.onload = () => {
      const body = xhr.response as UploadResponse | ApiError | null;
      if (xhr.status >= 200 && xhr.status < 300 && body && !('error' in body)) {
        resolve(body);
      } else {
        reject(new Error(body && 'error' in body ? body.error : `Ошибка ${xhr.status}`));
      }
    };

    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

export function getPending(): Promise<SubmissionSummary[]> {
  return fetch('/api/dashboard/pending').then((r) => json<SubmissionSummary[]>(r));
}

export function approveSubmission(id: string, addToWhitelist: boolean): Promise<unknown> {
  return fetch(`/api/dashboard/submissions/${id}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ whitelist: addToWhitelist }),
  }).then((r) => json(r));
}

export function rejectSubmission(id: string, ban: boolean): Promise<unknown> {
  return fetch(`/api/dashboard/submissions/${id}/reject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ban }),
  }).then((r) => json(r));
}

export function getWhitelist(): Promise<ListedUser[]> {
  return fetch('/api/dashboard/whitelist').then((r) => json<ListedUser[]>(r));
}

export function removeFromWhitelist(userId: string): Promise<unknown> {
  return fetch(`/api/dashboard/whitelist/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  }).then((r) => json(r));
}

export function getBans(): Promise<ListedUser[]> {
  return fetch('/api/dashboard/bans').then((r) => json<ListedUser[]>(r));
}

export function removeBan(userId: string): Promise<unknown> {
  return fetch(`/api/dashboard/bans/${encodeURIComponent(userId)}`, { method: 'DELETE' }).then(
    (r) => json(r),
  );
}

export function getNowPlaying(): Promise<{ now: SubmissionSummary | null }> {
  return fetch('/api/dashboard/now').then((r) => json<{ now: SubmissionSummary | null }>(r));
}

export function skipCurrent(): Promise<{ skipped: boolean }> {
  return fetch('/api/dashboard/skip', { method: 'POST' }).then((r) =>
    json<{ skipped: boolean }>(r),
  );
}

export function getSettings(): Promise<ChannelSettings> {
  return fetch('/api/dashboard/settings').then((r) => json<ChannelSettings>(r));
}

export function saveSettings(patch: Partial<ChannelSettings>): Promise<ChannelSettings> {
  return fetch('/api/dashboard/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => json<ChannelSettings>(r));
}

export function getHistory(): Promise<HistoryEntry[]> {
  return fetch('/api/dashboard/history').then((r) => json<HistoryEntry[]>(r));
}

/** В dev оверлей живёт на собственном vite-порту; в проде его раздаёт сервер под /overlay. */
export const OVERLAY_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5174'
  : `${window.location.origin}/overlay`;
