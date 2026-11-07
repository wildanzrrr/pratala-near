import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthedRequest, SessionUser } from '../guards/jwt-auth.guard.js';

/** The session user set by JwtAuthGuard / OptionalAuthGuard (or undefined). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser | undefined =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
