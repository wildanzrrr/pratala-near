import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageProvider, StoredObject } from './storage.provider.js';

export interface S3Options {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

/** S3 / MinIO evidence store (STORAGE_DRIVER=s3). */
export class S3StorageProvider implements StorageProvider {
  readonly driver = 's3' as const;
  private readonly client: S3Client;

  constructor(private readonly opts: S3Options) {
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      forcePathStyle: opts.forcePathStyle,
      credentials:
        opts.accessKeyId && opts.secretAccessKey
          ? {
              accessKeyId: opts.accessKeyId,
              secretAccessKey: opts.secretAccessKey,
            }
          : undefined,
    });
  }

  async put(key: string, data: Buffer, mime: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: `evidence/${key}`,
        Body: data,
        ContentType: mime,
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.opts.bucket, Key: `evidence/${key}` }),
      );
      if (!out.Body) return null;
      return { stream: out.Body as Readable, size: out.ContentLength };
    } catch {
      return null;
    }
  }
}
