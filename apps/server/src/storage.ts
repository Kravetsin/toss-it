import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Media storage abstraction. MVP uses local disk; an S3/R2 impl can
 * be swapped in without touching the rest of the code.
 */
export interface Storage {
  putFile(relPath: string, sourceAbsPath: string): Promise<void>;
  delete(relPath: string): Promise<void>;
  /** Local-only: root served by @fastify/static. */
  readonly root: string;
}

export class LocalDiskStorage implements Storage {
  constructor(readonly root: string) {
    fs.mkdirSync(root, { recursive: true });
  }

  async putFile(relPath: string, sourceAbsPath: string): Promise<void> {
    const dest = this.resolve(relPath);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(sourceAbsPath, dest);
  }

  async delete(relPath: string): Promise<void> {
    await fsp.rm(this.resolve(relPath), { force: true });
  }

  private resolve(relPath: string): string {
    const abs = path.resolve(this.root, relPath);
    if (!abs.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error(`Path escapes storage root: ${relPath}`);
    }
    return abs;
  }
}
