import type { DirectoryChannel } from '@tmw/shared';
import { json } from './http';

export function listDirectory(): Promise<DirectoryChannel[]> {
  return fetch('/api/directory').then((r) => json<DirectoryChannel[]>(r));
}
