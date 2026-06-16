import type { ApiError } from '@tmw/shared';

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

/** Разбор ответа fetch: бросает ApiRequestError на не-2xx, иначе типизированное тело. */
export async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T | ApiError;
  if (!res.ok) {
    const e = body as ApiError;
    throw new ApiRequestError('error' in e ? e.error : `HTTP ${res.status}`, e.code, e.retryAfterSec);
  }
  return body as T;
}
