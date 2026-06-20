import type {
  ChannelSettings,
  HistoryEntry,
  IntegrationStatus,
  ListedUser,
  ReputationStats,
  SubmissionSummary,
} from '@tmw/shared';
import { json } from './http';

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

/** Владелец: тестовый донат → всплеск на оверлее (превью эффекта). */
export function sendTestDonation(channelId: string, amount = 50): Promise<unknown> {
  return fetch(`${dash(channelId)}/test-donation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount }),
  }).then((r) => json(r));
}

// --- Интеграции донат-сервисов ---

export function getIntegrations(channelId: string): Promise<IntegrationStatus[]> {
  return fetch(`${dash(channelId)}/integrations`).then((r) => json<IntegrationStatus[]>(r));
}

export function connectDonatello(channelId: string, token: string): Promise<IntegrationStatus> {
  return fetch(`${dash(channelId)}/integrations/donatello`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  }).then((r) => json<IntegrationStatus>(r));
}

export function disconnectDonatello(channelId: string): Promise<unknown> {
  return fetch(`${dash(channelId)}/integrations/donatello`, { method: 'DELETE' }).then((r) =>
    json(r),
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
