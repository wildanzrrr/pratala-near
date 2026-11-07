import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { IntentsService } from './intents.service.js';

@ApiTags('intents')
@Throttle({ default: { ttl: 60_000, limit: 20 } })
@Controller('intents')
export class IntentsController {
  constructor(private readonly intents: IntentsService) {}

  @Get('tokens')
  @ApiOperation({ summary: '1Click supported tokens (mainnet, cached 60 s)' })
  async tokens() {
    return { tokens: await this.intents.tokens(), fetchedAt: new Date().toISOString() };
  }

  @Post('quote')
  @HttpCode(200)
  @ApiOperation({ summary: '1Click EXACT_INPUT quote. `dry` defaults to true (preview, no deposit address).' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['originAsset', 'destinationAsset', 'amount', 'recipient', 'refundTo'],
      properties: {
        originAsset: { type: 'string', example: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near' },
        destinationAsset: { type: 'string', example: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1' },
        amount: { type: 'string', example: '450' },
        recipient: { type: 'string', example: 'buyer.near' },
        refundTo: { type: 'string', example: '0x0000000000000000000000000000000000000000' },
        slippageTolerance: { type: 'integer', example: 100 },
        dry: { type: 'boolean', default: true },
      },
    },
  })
  quote(@Body() body: unknown) {
    return this.intents.quote(body);
  }

  @Post('deposit/submit')
  @ApiOperation({ summary: 'Tell 1Click about a deposit tx (passthrough)' })
  async depositSubmit(@Body() body: unknown, @Res() res: Response) {
    const { status, data } = await this.intents.depositSubmit(body);
    res.status(status).json(data);
  }

  @Get('status')
  @ApiOperation({ summary: '1Click swap status for a deposit address (passthrough)' })
  @ApiQuery({ name: 'depositAddress', required: true })
  async status(@Query('depositAddress') depositAddress: string, @Res() res: Response) {
    const { status, data } = await this.intents.status(depositAddress);
    res.status(status).json(data);
  }
}
