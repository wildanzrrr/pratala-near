import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { PlotsController } from './plots.controller.js';
import { PlotsService } from './plots.service.js';

@Module({
  imports: [EvidenceModule],
  controllers: [PlotsController],
  providers: [PlotsService],
})
export class PlotsModule {}
