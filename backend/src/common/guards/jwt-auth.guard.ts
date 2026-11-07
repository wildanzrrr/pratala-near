import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export const SESSION_COOKIE = 'pratala_session';

export interface SessionUser {
  accountId: string;
}

export interface SessionClaims {
  sub: string;
}

export type AuthedRequest = Request & { user?: SessionUser };

function extractToken(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  const fromCookie = cookies?.[SESSION_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

async function resolveUser(
  jwt: JwtService,
  req: Request,
): Promise<SessionUser | undefined> {
  const token = extractToken(req);
  if (!token) return undefined;
  try {
    const claims = await jwt.verifyAsync<SessionClaims>(token);
    return claims.sub ? { accountId: claims.sub } : undefined;
  } catch {
    return undefined;
  }
}

/** Requires a valid `pratala_session` cookie (or Bearer token). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = await resolveUser(this.jwt, req);
    if (!user) throw new UnauthorizedException('Sign in required');
    req.user = user;
    return true;
  }
}

/** Attaches `req.user` when a valid session exists; never rejects. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    req.user = await resolveUser(this.jwt, req);
    return true;
  }
}
