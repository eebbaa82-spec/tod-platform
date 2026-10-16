import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ClockService } from '../common/clock.service';
import { config } from '../common/config';
import { numericCode } from '../common/crypto';
import { fail } from '../common/errors';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { render } from '../notifications/templates';

const MAX_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParametersService,
    private readonly notifications: NotificationsService,
    private readonly clock: ClockService,
  ) {}

  // Sends a code by SMS. Outside production the code is also returned so
  // testers can work without a live SMS gateway.
  async issue(phone: string, purpose: string, language: 'en' | 'am' = 'en') {
    const now = this.clock.now();
    const recent = await this.prisma.otpCode.count({
      where: { phone, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
    });
    if (recent >= 8) throw fail.bad('OTP_RATE_LIMIT', 'Too many codes requested. Try again in an hour.');
    const minutes = await this.params.get<number>('OTP_TTL_MINUTES');
    const code = numericCode(6);
    await this.prisma.otpCode.updateMany({ where: { phone, purpose, consumedAt: null }, data: { consumedAt: now } });
    await this.prisma.otpCode.create({
      data: { phone, purpose, codeHash: await bcrypt.hash(code, 8), expiresAt: new Date(now.getTime() + minutes * 60000) },
    });
    const { body } = render('OTP', language, { code, minutes });
    await this.notifications.sendSms(phone, body);
    return config.isProduction ? { sent: true } : { sent: true, devCode: code };
  }

  async verify(phone: string, purpose: string, code: string) {
    const now = this.clock.now();
    const row = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw fail.bad('OTP_INVALID', 'The code has expired. Request a new one.');
    if (row.attempts >= MAX_ATTEMPTS) throw fail.bad('OTP_INVALID', 'Too many wrong codes. Request a new one.');
    const ok = await bcrypt.compare(code ?? '', row.codeHash);
    if (!ok) {
      await this.prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw fail.bad('OTP_INVALID', 'That code is not right. Check the SMS and try again.');
    }
    await this.prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: now } });
  }
}
