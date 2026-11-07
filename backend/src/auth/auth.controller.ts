import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { AppConfig } from '../config/app-config.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  JwtAuthGuard,
  SESSION_COOKIE,
  type SessionUser,
} from '../common/guards/jwt-auth.guard.js';
import { ApiZodBody } from '../common/zod.js';
import { UsersService } from '../users/users.service.js';
import { ChainRolesService } from '../common/near/roles.service.js';
import {
  challengeSchema,
  verifySchema,
  type ChallengeDto,
  type VerifyDto,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly roles: ChainRolesService,
    private readonly config: AppConfig,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('PUBLIC_API_URL').startsWith('https://'),
      path: '/',
      maxAge: this.config.get('JWT_TTL_SECONDS') * 1000,
    };
  }

  @Post('challenge')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Issue a single-use NEP-413 challenge (5 min)' })
  @ApiZodBody(challengeSchema)
  challenge(@Body({ schema: challengeSchema }) body: ChallengeDto) {
    return this.auth.challenge(body);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Verify a NEP-413 signature and set the pratala_session cookie',
  })
  @ApiZodBody(verifySchema)
  async verify(
    @Body({ schema: verifySchema }) body: VerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accountId, token } = await this.auth.verify(body);
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
    return { accountId };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Clear the session cookie' })
  logout(@Res({ passthrough: true }) res: Response) {
    const { maxAge: _maxAge, ...opts } = this.cookieOptions();
    res.clearCookie(SESSION_COOKIE, opts);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Session account, on-chain roles (60 s cache) and profile' })
  async me(@CurrentUser() user: SessionUser) {
    const [roles, profile] = await Promise.all([
      this.roles.rolesOf(user.accountId),
      this.users.getProfile(user.accountId),
    ]);
    return { accountId: user.accountId, roles, profile };
  }
}
