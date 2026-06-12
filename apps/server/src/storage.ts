import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Абстракция хранилища медиа. В MVP — локальный диск; в фазе 6
 * появится S3/R2-реализация, остальной код измениться не должен.
 */
export interface Storage {
  /** Перемещает готовый файл (абсолютный путь) в хранилище по относительному пути. */
  putFile(relPath: string, sourceAbsPath: string): Promise<void>;
  delete(relPath: string): Promise<void>;
  /** Только для локальной реализации: корень для отдачи файлов через @fastify/static. */
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
