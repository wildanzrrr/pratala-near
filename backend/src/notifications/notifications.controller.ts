import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  JwtAuthGuard,
  type SessionUser,
} from '../common/guards/jwt-auth.guard.js';
import { uuidSchema } from '../common/zod.js';
import { NotificationsService } from './notifications.service.js';

const listQuery = z.object({ unread: z.enum(['true', 'false']).optional() });

@ApiTags('notifications')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "The signed-in account's inbox (newest first, max 100)" })
  @ApiQuery({ name: 'unread', required: false, enum: ['true', 'false'] })
  list(@CurrentUser() user: SessionUser, @Query({ schema: listQuery }) q: z.infer<typeof listQuery>) {
    return this.notifications.list(user.accountId, q.unread === 'true');
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a notification read' })
  read(@CurrentUser() user: SessionUser, @Param('id', { schema: uuidSchema }) id: string) {
    return this.notifications.markRead(user.accountId, id);
  }
}
