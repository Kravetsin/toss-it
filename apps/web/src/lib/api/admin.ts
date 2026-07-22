import type {
  AdminBotStatus,
  AdminCosmeticOwner,
  AdminCosmeticRow,
  AdminExclusion,
  AdminLiveChannel,
  AdminUserRow,
  AdminUsersSort,
} from '@tmw/shared';
import { json } from './http';

export function listLiveChannels(): Promise<AdminLiveChannel[]> {
  return fetch('/api/admin/live-channels').then((r) => json<AdminLiveChannel[]>(r));
}

export function listExclusions(): Promise<AdminExclusion[]> {
  return fetch('/api/admin/leaderboard-exclusions').then((r) => json<AdminExclusion[]>(r));
}

export function addExclusion(login: string): Promise<{ ok: boolean; login: string }> {
  return fetch('/api/admin/leaderboard-exclusions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login }),
  }).then((r) => json<{ ok: boolean; login: string }>(r));
}

export function removeExclusion(login: string): Promise<{ ok: boolean }> {
  return fetch(`/api/admin/leaderboard-exclusions/${encodeURIComponent(login)}`, {
    method: 'DELETE',
  }).then((r) => json<{ ok: boolean }>(r));
}

export function listAdminUsers(
  q: string,
  sort: AdminUsersSort = 'created',
): Promise<AdminUserRow[]> {
  const params = new URLSearchParams({ sort });
  if (q) params.set('q', q);
  return fetch(`/api/admin/users?${params}`).then((r) => json<AdminUserRow[]>(r));
}

export function setUserStardust(
  userId: string,
  stardust: number,
): Promise<{ ok: boolean; stardust: number }> {
  return fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stardust }),
  }).then((r) => json<{ ok: boolean; stardust: number }>(r));
}

/** Refund: ADD dust to a balance (atomic on the server), used after a price change or removal. */
export function addUserStardust(
  userId: string,
  stardustDelta: number,
): Promise<{ ok: boolean; stardust: number }> {
  return fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stardustDelta }),
  }).then((r) => json<{ ok: boolean; stardust: number }>(r));
}

export function listAdminCosmetics(): Promise<AdminCosmeticRow[]> {
  return fetch('/api/admin/cosmetics').then((r) => json<AdminCosmeticRow[]>(r));
}

export function listCosmeticOwners(itemId: string): Promise<AdminCosmeticOwner[]> {
  return fetch(`/api/admin/cosmetics/${encodeURIComponent(itemId)}/owners`).then((r) =>
    json<AdminCosmeticOwner[]>(r),
  );
}

export function getBotStatus(): Promise<AdminBotStatus> {
  return fetch('/api/admin/bot').then((r) => json<AdminBotStatus>(r));
}
