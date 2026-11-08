import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceService } from './evidence.service.js';
import { GcsStorageProvider } from './storage/gcs-storage.provider.js';
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
      // GCS is the only evidence store: boot fails when the bucket is not
      // configured or not reachable with the given credentials.
      useFactory: async (config: AppConfig): Promise<StorageProvider> => {
        const provider = new GcsStorageProvider({
          bucket: config.get('GCS_BUCKET'),
          keyFile: config.get('GCS_KEY_FILE'),
        });
        await provider.assertReady();
        return provider;
      },
    },
  ],
  exports: [EvidenceService],
})
export class EvidenceModule {}
