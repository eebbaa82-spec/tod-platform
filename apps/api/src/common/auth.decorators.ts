import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface SessionUser {
  id: string;
  roles: Role[];
  mfa: boolean;
  language: 'en' | 'am';
}

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'public';

// Restrict a route to users holding at least one of these roles.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return (req.headers['x-forwarded-for']?.split(',')[0] ?? req.ip ?? '').trim();
});

export const STAFF_ROLES: Role[] = [
  'VETTING_OFFICER',
  'SUPPORT_AGENT',
  'FINANCE_OFFICER',
  'MEL_OFFICER',
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'AUDITOR',
  'PARTNER_VIEWER',
];

export const isStaff = (roles: Role[]) => roles.some((r) => STAFF_ROLES.includes(r));
export const hasRole = (u: { roles: Role[] }, ...roles: Role[]) => u.roles.some((r) => roles.includes(r));
