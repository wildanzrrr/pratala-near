import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  JwtAuthGuard,
  type SessionUser,
} from '../common/guards/jwt-auth.guard.js';
import { ApiZodBody, uuidSchema } from '../common/zod.js';
import { aiCheckSchema, type AiCheckDto } from './ai.schemas.js';
import { AiService } from './ai.service.js';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('check')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary:
      'Advisory NEAR AI Cloud vision check of an evidence photo. 503 {error:"ai_unavailable"} when no API key is configured.',
  })
  @ApiZodBody(aiCheckSchema)
  check(
    @CurrentUser() user: SessionUser,
    @Body({ schema: aiCheckSchema }) body: AiCheckDto,
  ) {
    return this.ai.check(body, user.accountId);
  }

  @Get('check/:id')
  @ApiOperation({ summary: 'A stored AI check (retries the signature lookup if still missing)' })
  get(@Param('id', { schema: uuidSchema }) id: string) {
    return this.ai.get(id);
  }
}
