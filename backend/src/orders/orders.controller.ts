import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard, type SessionUser } from '../common/guards/jwt-auth.guard.js';
import { ApiZodBody, uuidSchema } from '../common/zod.js';
import { OrdersService } from './orders.service.js';

const createOrderSchema = z.object({ listingId: z.uuid(), qty: z.number().int().min(1).max(10_000) });
const confirmSchema = z.object({
  txHash: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/, 'txHash must be a base58 NEAR transaction hash'),
});

@ApiTags('orders')
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a PENDING order; pay with pUSDC ft_transfer(seller, amount, memo="order:<uuid>")',
  })
  @ApiZodBody(createOrderSchema)
  create(@CurrentUser() user: SessionUser, @Body({ schema: createOrderSchema }) body: z.infer<typeof createOrderSchema>) {
    return this.orders.create(user.accountId, body.listingId, body.qty);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify the ft_transfer on-chain and mark the order PAID' })
  @ApiZodBody(confirmSchema)
  confirm(
    @CurrentUser() user: SessionUser,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: confirmSchema }) body: z.infer<typeof confirmSchema>,
  ) {
    return this.orders.confirm(id, body.txHash, user.accountId);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Orders where I am buyer or seller' })
  mine(@CurrentUser() user: SessionUser) {
    return this.orders.mine(user.accountId);
  }
}
