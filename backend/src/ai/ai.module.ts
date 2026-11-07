import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { AI_CLIENT, createAiClient } from './ai.client.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';

@Module({
  imports: [EvidenceModule],
  controllers: [AiController],
  providers: [
    AiService,
    { provide: AI_CLIENT, inject: [AppConfig], useFactory: createAiClient },
  ],
  exports: [AiService],
})
export class AiModule {}
