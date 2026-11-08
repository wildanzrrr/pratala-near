import type { Readable } from 'node:stream';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StoredObject {
  stream: Readable;
  size?: number;
}

/** Content-addressed blob store for evidence files. Keys are `<sha256>`. */
export interface StorageProvider {
  readonly driver: 'gcs';
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
}
