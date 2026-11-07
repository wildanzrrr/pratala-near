import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  JwtAuthGuard,
  OptionalAuthGuard,
  type SessionUser,
} from '../common/guards/jwt-auth.guard.js';
import { ApiZodBody, uuidSchema } from '../common/zod.js';
import { createPlotSchema, type CreatePlotDto } from './plots.schemas.js';
import { PlotsService } from './plots.service.js';

@ApiTags('plots')
@Controller('plots')
export class PlotsController {
  constructor(private readonly plots: PlotsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Register a plot; returns plotHash + gpsHash for register_lot',
  })
  @ApiZodBody(createPlotSchema)
  create(
    @CurrentUser() user: SessionUser,
    @Body({ schema: createPlotSchema }) body: CreatePlotDto,
  ) {
    return this.plots.create(user.accountId, body);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "The signed-in farmer's plots" })
  mine(@CurrentUser() user: SessionUser) {
    return this.plots.mine(user.accountId);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: 'A plot (exact coordinates only for its owner)',
  })
  get(
    @Param('id', { schema: uuidSchema }) id: string,
    @CurrentUser() user?: SessionUser,
  ) {
    return this.plots.get(id, user?.accountId);
  }
}
