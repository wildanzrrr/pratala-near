import { Module } from '@nestjs/common';
import { FastAuthController } from './fastauth.controller.js';
import { FastAuthService } from './fastauth.service.js';
import { SponsorSignerService } from './fastauth.signer.service.js';

@Module({
  controllers: [FastAuthController],
  providers: [FastAuthService, SponsorSignerService],
  exports: [FastAuthService],
})
export class FastAuthModule {}
