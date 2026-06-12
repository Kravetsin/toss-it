import type {
  ApiError,
  ChannelSelf,
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

/** В dev оверлей живёт на собственном vite-порту; в проде его раздаёт сервер под /overlay. */
export const OVERLAY_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5174'
  : `${window.location.origin}/overlay`;
