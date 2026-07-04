import type { LinkPendingInfo } from '@tmw/shared';
import { json } from './http';

export function getLinkPending(): Promise<LinkPendingInfo> {
  return fetch('/api/auth/link/pending').then((r) => json<LinkPendingInfo>(r));
}

export function resolveLink(
  primary: 'current' | 'other',
): Promise<{ ok: boolean; switched: boolean }> {
  return fetch('/api/auth/link/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ primary }),
  }).then((r) => json<{ ok: boolean; switched: boolean }>(r));
}
