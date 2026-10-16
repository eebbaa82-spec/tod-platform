import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ClientIp, CurrentUser, Public, Roles, SessionUser } from '../common/auth.decorators';
import { SESSION_COOKIE } from '../common/auth.guard';
import { config } from '../common/config';
import { AddRoleDto, AssistedRegisterDto, LoginDto, RegisterDto, RequestOtpDto, ResetPasswordDto } from './dto';
import { AuthService } from './auth.service';

function setCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Rate limits on codes and sign-in limit automated abuse (NFR-SEC-08).
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('otp')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone, dto.purpose);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.register(dto, ip);
    setCookie(res, token);
    return { user, token };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, ip);
    if ('token' in result) {
      setCookie(res, result.token);
      return { user: result.user, token: result.token };
    }
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('password/reset')
  reset(@Body() dto: ResetPasswordDto, @ClientIp() ip: string) {
    return this.auth.resetPassword(dto, ip);
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() me: SessionUser) {
    return this.auth.me(me.id).then((u) => ({ ...u, mfa: me.mfa }));
  }

  // FR-ACC-02 one person can hold both talent and client roles.
  @Post('roles')
  addRole(@CurrentUser() me: SessionUser, @Body() dto: AddRoleDto) {
    return this.auth.addRole(me.id, dto.role);
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post('assisted-registration')
  assisted(@CurrentUser() me: SessionUser, @Body() dto: AssistedRegisterDto, @ClientIp() ip: string) {
    return this.auth.assistedRegister(me.id, dto, ip);
  }
}
