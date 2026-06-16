import type { MeResponse } from '@tmw/shared';
import { json } from './http';

export function getMe(): Promise<MeResponse> {
  return fetch('/api/auth/me').then((r) => json<MeResponse>(r));
}

export function logout(): Promise<unknown> {
  return fetch('/api/auth/logout', { method: 'POST' });
}
