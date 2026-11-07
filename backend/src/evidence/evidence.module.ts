import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceService } from './evidence.service.js';
import { LocalStorageProvider } from './storage/local-storage.provider.js';
import { S3StorageProvider } from './storage/s3-storage.provider.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage/storage.provider.js';

@Module({
  controllers: [EvidenceController],
  providers: [
    EvidenceService,
    {
      provide: STORAGE_PROVIDER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): StorageProvider => {
        if (config.get('STORAGE_DRIVER') === 's3') {
          const bucket = config.get('S3_BUCKET');
          if (!bucket) throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET');
          return new S3StorageProvider({
            endpoint: config.get('S3_ENDPOINT'),
            region: config.get('S3_REGION'),
            bucket,
            accessKeyId: config.get('S3_ACCESS_KEY_ID'),
            secretAccessKey: config.get('S3_SECRET_ACCESS_KEY'),
            forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
          });
        }
        return new LocalStorageProvider(config.get('UPLOAD_DIR'));
      },
    },
  ],
  exports: [EvidenceService],
})
export class EvidenceModule {}
