import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { accountIdSchema, ApiZodBody } from '../common/zod.js';
import { OrdersService } from '../orders/orders.service.js';
import { IndexerService } from './indexer.service.js';

export const txHashSchema = z
  .string()
  .trim()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/, 'txHash must be a base58 NEAR transaction hash');

const ingestSchema = z.object({
  txHash: txHashSchema,
  signerId: accountIdSchema,
  context: z
    .object({
      lotId: z.string().max(32).optional(),
      orderId: z.uuid().optional(),
    })
    .optional(),
});

@ApiTags('indexer')
@Controller('tx')
export class IndexerController {
  constructor(
    private readonly indexer: IndexerService,
    private readonly orders: OrdersService,
  ) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary:
      'Index a transaction the web app just sent: fetch at FINAL, store EVENT_JSON events, update payments + notifications. Idempotent.',
  })
  @ApiZodBody(ingestSchema)
  async ingest(@Body({ schema: ingestSchema }) body: z.infer<typeof ingestSchema>) {
    const result = await this.indexer.ingestTx(body.txHash, body.signerId);
    if (body.context?.orderId) {
      const order = await this.orders.confirm(body.context.orderId, body.txHash, body.signerId).catch(() => null);
      return { ...result, order };
    }
    return result;
  }
}
