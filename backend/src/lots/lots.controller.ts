import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiZodQuery } from '../common/zod.js';
import { lotIdSchema, lotsQuerySchema, type LotsQuery } from './lots.schemas.js';
import { LotsService } from './lots.service.js';

@ApiTags('lots')
@Controller('lots')
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Get()
  @ApiOperation({ summary: 'LotView[] from the Postgres mirror (RPC fallback; [] when the contract is absent)' })
  @ApiZodQuery(lotsQuerySchema)
  list(@Query({ schema: lotsQuerySchema }) query: LotsQuery) {
    return this.lots.list(query);
  }

  @Get(':lotId')
  @ApiOperation({ summary: 'LotView & { evidence[], aiChecks[] }' })
  get(@Param('lotId', { schema: lotIdSchema }) lotId: string) {
    return this.lots.get(lotId);
  }

  @Get(':lotId/history')
  @ApiOperation({ summary: 'Indexed contract events for the lot (oldest first)' })
  history(@Param('lotId', { schema: lotIdSchema }) lotId: string) {
    return this.lots.history(lotId);
  }

  @Get(':lotId/metadata.json')
  @ApiOperation({ summary: 'NEP-177 token reference JSON' })
  async metadata(
    @Param('lotId', { schema: lotIdSchema }) lotId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return this.lots.metadata(lotId);
  }
}
