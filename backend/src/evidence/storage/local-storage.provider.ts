import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { StorageProvider, StoredObject } from './storage.provider.js';

const KEY_RE = /^[a-f0-9]{64}$/;

export class LocalStorageProvider implements StorageProvider {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(uploadDir: string) {
    this.root = resolve(uploadDir);
  }

  private path(key: string): string {
    if (!KEY_RE.test(key)) throw new Error('Invalid storage key');
    return join(this.root, key.slice(0, 2), key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.path(key);
    await mkdir(join(this.root, key.slice(0, 2)), { recursive: true });
    try {
      await stat(file);
      return; // content-addressed: identical bytes already stored
    } catch {
      await writeFile(file, data, { flag: 'wx' }).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'EEXIST') throw err;
      });
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = this.path(key);
    try {
      const s = await stat(file);
      return { stream: createReadStream(file), size: s.size };
    } catch {
      return null;
    }
  }
}
