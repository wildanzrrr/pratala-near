import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service.js';

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @ApiOperation({ summary: 'Contract get_stats + { farmers, verifiers } (mirror fallback; 30 s cache)' })
  get() {
    return this.stats.get();
  }
}
