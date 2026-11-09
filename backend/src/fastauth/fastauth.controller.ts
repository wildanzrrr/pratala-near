import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiZodBody } from '../common/zod.js';
import {
  createAccountSchema,
  resolveAccountSchema,
  signTxSchema,
  type CreateAccountDto,
  type ResolveAccountDto,
  type SignTxDto,
} from './fastauth.schemas.js';
import { FastAuthService } from './fastauth.service.js';

/**
 * NEAR Auth relayer endpoints + account sponsorship. The frontend's
 * @fast-auth-near signer talks to `/fastauth/sign-tx` exactly like it would
 * talk to a self-hosted NEAR Auth relayer.
 */
@ApiTags('fastauth')
@Controller('fastauth')
export class FastAuthController {
  constructor(private readonly fastauth: FastAuthService) {}

  @Post('resolve-account')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Which sponsored account (if any) this login already owns',
  })
  @ApiZodBody(resolveAccountSchema)
  resolveAccount(@Body({ schema: resolveAccountSchema }) body: ResolveAccountDto) {
    return this.fastauth.resolveAccount(body);
  }

  @Post('create-account')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary:
      'Create + seed a NEAR Auth MPC account for a verified login (sponsor pays)',
  })
  @ApiZodBody(createAccountSchema)
  createAccount(@Body({ schema: createAccountSchema }) body: CreateAccountDto) {
    return this.fastauth.createAccount(body);
  }

  @Post('sign-tx')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary:
      'Relay an MPC signature request to the fast-auth contract (sponsor pays gas)',
  })
  @ApiZodBody(signTxSchema)
  signTx(@Body({ schema: signTxSchema }) body: SignTxDto) {
    return this.fastauth.relaySignTx(body);
  }
}
