import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { config } from './config';
import { PUBLIC_KEY, ROLES_KEY, SessionUser, isStaff } from './auth.decorators';
import { PrismaService } from './prisma.service';
import { fail } from './errors';

export const SESSION_COOKIE = 'tod_session';

// Every route requires a signed-in, active user unless marked @Public().
// Staff routes also require that the session passed multi-factor sign-in (FR-ACC-04).
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    const token = req.cookies?.[SESSION_COOKIE] ?? bearer(req.headers.authorization);
    let user: SessionUser | undefined;
    if (token) {
      try {
        const claims = jwt.verify(token, config.jwtSecret) as any;
        const row = await this.prisma.user.findUnique({ where: { id: claims.sub } });
        if (row && row.status === 'ACTIVE') {
          user = { id: row.id, roles: row.roles, mfa: !!claims.mfa, language: row.language };
        }
      } catch {
        user = undefined;
      }
    }
    req.user = user;
    if (isPublic) return true;
    if (!user) throw new UnauthorizedException({ code: 'SIGN_IN_REQUIRED', message: 'Please sign in.' });

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length) {
      if (!user.roles.some((r) => roles.includes(r))) {
        throw fail.forbidden('ROLE_REQUIRED', 'You do not have permission for this action.');
      }
      // Acting through a staff role (rather than as a talent or client) needs MFA.
      const matched = user.roles.filter((r) => roles.includes(r));
      if (matched.every((r) => isStaff([r])) && !user.mfa) {
        throw fail.forbidden('MFA_REQUIRED', 'Staff actions need a sign-in with your authenticator code.');
      }
    }
    return true;
  }
}

function bearer(h?: string) {
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
}
