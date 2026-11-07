import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { LotsController } from './lots.controller.js';
import { LotsRepository } from './lots.repository.js';
import { LotsService } from './lots.service.js';

@Module({
  imports: [EvidenceModule, AiModule],
  controllers: [LotsController],
  providers: [LotsRepository, LotsService],
  exports: [LotsRepository, LotsService],
})
export class LotsModule {}
