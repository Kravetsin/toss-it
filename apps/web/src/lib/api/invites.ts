import type { ModInviteInfo } from '@tmw/shared';
import { json } from './http';

export function getModInvite(token: string): Promise<ModInviteInfo> {
  return fetch(`/api/mod-invite/${encodeURIComponent(token)}`).then((r) => json<ModInviteInfo>(r));
}

export function acceptModInvite(token: string): Promise<{ channelId: string }> {
  return fetch(`/api/mod-invite/${encodeURIComponent(token)}/accept`, { method: 'POST' }).then((r) =>
    json<{ channelId: string }>(r),
  );
}
