import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  JwtAuthGuard,
  type SessionUser,
} from '../common/guards/jwt-auth.guard.js';
import { accountIdSchema, ApiZodBody } from '../common/zod.js';
import {
  updateProfileSchema,
  type UpdateProfileDto,
} from './users.schemas.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Own profile (includes phone)' })
  me(@CurrentUser() user: SessionUser) {
    return this.users.getProfile(user.accountId);
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create or update own profile' })
  @ApiZodBody(updateProfileSchema)
  update(
    @CurrentUser() user: SessionUser,
    @Body({ schema: updateProfileSchema }) body: UpdateProfileDto,
  ) {
    return this.users.update(user.accountId, body);
  }

  @Get(':accountId')
  @ApiOperation({ summary: 'Public profile (no phone)' })
  get(@Param('accountId', { schema: accountIdSchema }) accountId: string) {
    return this.users.getPublicProfile(accountId);
  }
}
