import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary:
      'Liveness + dependency report. 200 when the database is reachable; chain and AI are informational.',
  })
  async check(@Res({ passthrough: true }) res: Response) {
    const report = await this.health.report();
    if (!report.ok) res.status(503);
    return report;
  }
}
