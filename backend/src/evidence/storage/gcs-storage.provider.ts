import { Storage } from '@google-cloud/storage';
import type { StorageProvider, StoredObject } from './storage.provider.js';

export interface GcsOptions {
  bucket: string;
  /** Service-account JSON path; omit to use Application Default Credentials. */
  keyFile?: string;
}

/**
 * Google Cloud Storage evidence store — the only driver. GCS_BUCKET is
 * required at boot; there is no local-disk fallback.
 */
export class GcsStorageProvider implements StorageProvider {
  readonly driver = 'gcs' as const;
  private readonly storage: Storage;
  private readonly bucketName: string;

  constructor(opts: GcsOptions) {
    this.bucketName = opts.bucket;
    this.storage = new Storage(opts.keyFile ? { keyFilename: opts.keyFile } : undefined);
  }

  /** Resolves once the bucket is reachable with the configured credentials. */
  async assertReady(): Promise<void> {
    await this.storage.bucket(this.bucketName).getMetadata();
  }

  async put(key: string, data: Buffer, mime: string): Promise<void> {
    await this.storage
      .bucket(this.bucketName)
      .file(`evidence/${key}`)
      // ≤ 8 MB single-shot upload; resumable sessions are pointless here.
      .save(data, {
        resumable: false,
        metadata: {
          contentType: mime,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = this.storage.bucket(this.bucketName).file(`evidence/${key}`);
    try {
      const [meta] = await file.getMetadata();
      return { stream: file.createReadStream(), size: Number(meta.size) };
    } catch {
      return null;
    }
  }
}
