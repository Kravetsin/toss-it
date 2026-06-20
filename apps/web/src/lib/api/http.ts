import type { ApiError } from '@tmw/shared';

/** API error with machine-readable code and optional retry metadata. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

/** Parse fetch response: throws ApiRequestError on non-2xx, else typed body. */
export async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T | ApiError;
  if (!res.ok) {
    const e = body as ApiError;
    throw new ApiRequestError(
      'error' in e ? e.error : `HTTP ${res.status}`,
      e.code,
      e.retryAfterSec,
    );
  }
  return body as T;
}
