import type { AdminBotStatus, AdminUserRow, AdminUsersSort } from '@tmw/shared';
import { json } from './http';

export function listAdminUsers(q: string, sort: AdminUsersSort = 'created'): Promise<AdminUserRow[]> {
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

export function getBotStatus(): Promise<AdminBotStatus> {
  return fetch('/api/admin/bot').then((r) => json<AdminBotStatus>(r));
}
