import type { AdminBotStatus, AdminUserRow } from '@tmw/shared';
import { json } from './http';

export function listAdminUsers(q: string): Promise<AdminUserRow[]> {
  const suffix = q ? `?q=${encodeURIComponent(q)}` : '';
  return fetch(`/api/admin/users${suffix}`).then((r) => json<AdminUserRow[]>(r));
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
