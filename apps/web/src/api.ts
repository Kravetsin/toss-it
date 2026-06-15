import type {
  AccessibleChannel,
  AdminPromoCode,
  ApiError,
  ChannelSelf,
  ChannelSettings,
  HistoryEntry,
  LeaderboardEntry,
  ListedUser,
  MeResponse,
  ModInviteInfo,
  PromoRedeemResult,
  ReputationStats,
  PublicChannelInfo,
  SubmissionSummary,
  UploadResponse,
} from '@tmw/shared';

/** Ошибка API с машиночитаемым кодом (напр. кулдаун с retryAfterSec). */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T | ApiError;
  if (!res.ok) {
    const e = body as ApiError;
    throw new ApiRequestError('error' in e ? e.error : `HTTP ${res.status}`, e.code, e.retryAfterSec);
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
  file: File | null,
  text: string,
  onProgress: (value: number | null) => void,
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
    xhr.send(fd);
  });
}

/** Каналы, к которым у пользователя есть доступ (свои + где он модератор). */
export function getMyChannels(): Promise<AccessibleChannel[]> {
  return fetch('/api/me/channels').then((r) => json<AccessibleChannel[]>(r));
}

/** Префикс ручек дашборда конкретного канала. */
const dash = (channelId: string) => `/api/dashboard/${encodeURIComponent(channelId)}`;

export function getPending(channelId: string): Promise<SubmissionSummary[]> {
  return fetch(`${dash(channelId)}/pending`).then((r) => json<SubmissionSummary[]>(r));
}

/** Кросс-канальная репутация набора пользователей (батчем). */
export function getReputation(
  channelId: string,
  userIds: string[],
): Promise<Record<string, ReputationStats>> {
  return fetch(`${dash(channelId)}/reputation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userIds }),
  }).then((r) => json<Record<string, ReputationStats>>(r));
}

export function approveSubmission(
  channelId: string,
  id: string,
  addToWhitelist: boolean,
): Promise<unknown> {
  return fetch(`${dash(channelId)}/submissions/${id}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ whitelist: addToWhitelist }),
  }).then((r) => json(r));
}

export function rejectSubmission(channelId: string, id: string, ban: boolean): Promise<unknown> {
  return fetch(`${dash(channelId)}/submissions/${id}/reject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ban }),
  }).then((r) => json(r));
}

export function getWhitelist(channelId: string): Promise<ListedUser[]> {
  return fetch(`${dash(channelId)}/whitelist`).then((r) => json<ListedUser[]>(r));
}

export function removeFromWhitelist(channelId: string, userId: string): Promise<unknown> {
  return fetch(`${dash(channelId)}/whitelist/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  }).then((r) => json(r));
}

export function getBans(channelId: string): Promise<ListedUser[]> {
  return fetch(`${dash(channelId)}/bans`).then((r) => json<ListedUser[]>(r));
}

/** Прямой бан зрителя по userId (из истории/белого списка, без привязки к отправке). */
export function banUser(channelId: string, userId: string): Promise<unknown> {
  return fetch(`${dash(channelId)}/bans/${encodeURIComponent(userId)}`, { method: 'POST' }).then(
    (r) => json(r),
  );
}

export function removeBan(channelId: string, userId: string): Promise<unknown> {
  return fetch(`${dash(channelId)}/bans/${encodeURIComponent(userId)}`, { method: 'DELETE' }).then(
    (r) => json(r),
  );
}

export function getNowPlaying(channelId: string): Promise<{ now: SubmissionSummary | null }> {
  return fetch(`${dash(channelId)}/now`).then((r) => json<{ now: SubmissionSummary | null }>(r));
}

export function skipCurrent(channelId: string): Promise<{ skipped: boolean }> {
  return fetch(`${dash(channelId)}/skip`, { method: 'POST' }).then((r) =>
    json<{ skipped: boolean }>(r),
  );
}

export function getSettings(channelId: string): Promise<ChannelSettings> {
  return fetch(`${dash(channelId)}/settings`).then((r) => json<ChannelSettings>(r));
}

export function saveSettings(
  channelId: string,
  patch: Partial<ChannelSettings>,
): Promise<ChannelSettings> {
  return fetch(`${dash(channelId)}/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => json<ChannelSettings>(r));
}

export function getHistory(channelId: string): Promise<HistoryEntry[]> {
  return fetch(`${dash(channelId)}/history`).then((r) => json<HistoryEntry[]>(r));
}

// --- Модераторы / инвайты ---

export function getModerators(channelId: string): Promise<ListedUser[]> {
  return fetch(`${dash(channelId)}/moderators`).then((r) => json<ListedUser[]>(r));
}

export function createModInvite(channelId: string): Promise<{ token: string }> {
  return fetch(`${dash(channelId)}/moderators/invite`, { method: 'POST' }).then((r) =>
    json<{ token: string }>(r),
  );
}

export function removeModerator(channelId: string, userId: string): Promise<unknown> {
  return fetch(`${dash(channelId)}/moderators/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  }).then((r) => json(r));
}

export function getModInvite(token: string): Promise<ModInviteInfo> {
  return fetch(`/api/mod-invite/${encodeURIComponent(token)}`).then((r) => json<ModInviteInfo>(r));
}

export function acceptModInvite(token: string): Promise<{ channelId: string }> {
  return fetch(`/api/mod-invite/${encodeURIComponent(token)}/accept`, { method: 'POST' }).then((r) =>
    json<{ channelId: string }>(r),
  );
}

// --- Промокоды ---

export function redeemPromo(code: string): Promise<PromoRedeemResult> {
  return fetch(`/api/promo/${encodeURIComponent(code)}/redeem`, { method: 'POST' }).then((r) =>
    json<PromoRedeemResult>(r),
  );
}

export function listPromoCodes(): Promise<AdminPromoCode[]> {
  return fetch('/api/admin/promo').then((r) => json<AdminPromoCode[]>(r));
}

export function createPromoCodes(
  count: number,
  note: string,
  grant = 'founder',
): Promise<{ codes: string[] }> {
  return fetch('/api/admin/promo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ count, note, grant }),
  }).then((r) => json<{ codes: string[] }>(r));
}

export function getLeaderboard(login: string): Promise<LeaderboardEntry[]> {
  return fetch(`/api/c/${encodeURIComponent(login)}/leaderboard`).then((r) =>
    json<LeaderboardEntry[]>(r),
  );
}

/** В dev оверлей живёт на собственном vite-порту; в проде его раздаёт сервер под /overlay. */
export const OVERLAY_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5174'
  : `${window.location.origin}/overlay`;
