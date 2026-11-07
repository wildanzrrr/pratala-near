import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiZodQuery } from '../common/zod.js';
import { paymentsQuerySchema, PaymentsService, type PaymentsQuery } from './payments.service.js';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Payment ledger derived from contract events (amounts in decimal pUSDC)' })
  @ApiZodQuery(paymentsQuerySchema)
  list(@Query({ schema: paymentsQuerySchema }) q: PaymentsQuery) {
    return this.payments.list(q);
  }

  @Get('export.csv')
  @Header('Cache-Control', 'no-store')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Same rows as CSV (UTF-8 BOM, CRLF) for a bookkeeper' })
  @ApiZodQuery(paymentsQuerySchema)
  async csv(@Query({ schema: paymentsQuerySchema }) q: PaymentsQuery, @Res() res: Response) {
    const body = await this.payments.csv(q);
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = q.lotId ?? q.account ?? 'all';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pratala-payments-${scope.replace(/[^\w.-]/g, '_')}-${stamp}.csv"`);
    res.send(body);
  }
}
