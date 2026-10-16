import { Injectable } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { AuditService } from '../common/audit.service';
import { isStaff } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { config } from '../common/config';
import { sha256 } from '../common/crypto';
import { fail } from '../common/errors';
import { ParametersService } from '../common/parameters.service';
import { normalisePhone } from '../common/phone';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssistedRegisterDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto';
import { OtpService } from './otp.service';

export interface SessionResult {
  token: string;
  user: ReturnType<AuthService['publicUser']>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly params: ParametersService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly clock: ClockService,
  ) {}

  async requestOtp(phoneRaw: string, purpose: string) {
    const phone = normalisePhone(phoneRaw);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (purpose === 'REGISTER' && user) throw fail.conflict('PHONE_TAKEN', 'This phone number already has an account. Sign in instead.');
    if ((purpose === 'RESET' || purpose === 'NEW_DEVICE') && !user) {
      // Do not reveal whether a number is registered.
      return { sent: true };
    }
    return this.otp.issue(phone, purpose, user?.language ?? 'en');
  }

  async register(dto: RegisterDto, ip?: string): Promise<SessionResult> {
    const phone = normalisePhone(dto.phone);
    if (!dto.acceptTerms || !dto.acceptPrivacy || !dto.acceptCommunity) {
      throw fail.bad('CONSENT_REQUIRED', 'You need to accept the terms, privacy notice and community standards to continue.');
    }
    if (await this.prisma.user.findUnique({ where: { phone } })) {
      throw fail.conflict('PHONE_TAKEN', 'This phone number already has an account. Sign in instead.');
    }
    await this.otp.verify(phone, 'REGISTER', dto.otp);
    const versions = await this.params.get<Record<string, string>>('POLICY_VERSIONS');
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          phone,
          passwordHash: await bcrypt.hash(dto.password, 10),
          displayName: dto.displayName.trim(),
          language: dto.language ?? 'en',
          roles: [dto.role],
          status: 'ACTIVE', // activated only after consent is recorded below (FR-ACC-05)
        },
      });
      await tx.consent.createMany({
        data: ['TERMS', 'PRIVACY', 'COMMUNITY'].map((d) => ({ userId: u.id, document: d, version: versions[d] })),
      });
      if (dto.deviceId) await tx.trustedDevice.create({ data: { userId: u.id, deviceHash: sha256(dto.deviceId) } });
      await this.audit.log({ actorId: u.id, action: 'ACCOUNT_REGISTERED', entityType: 'User', entityId: u.id, after: { role: dto.role, consents: versions }, ip }, tx);
      return u;
    });
    return this.session(user, false);
  }

  async login(dto: LoginDto, ip?: string): Promise<SessionResult | { next: 'OTP' | 'MFA' | 'MFA_SETUP'; devCode?: string; mfaSetup?: { secret: string; otpauth: string } }> {
    const phone = normalisePhone(dto.phone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    const now = this.clock.now();
    if (!user) throw fail.bad('BAD_CREDENTIALS', 'Phone number or password is not right.');
    if (user.lockedUntil && user.lockedUntil > now) {
      throw fail.forbidden('ACCOUNT_LOCKED', 'Your account is locked after too many failed sign-ins. Try again later or reset your password.');
    }
    if (user.status === 'SUSPENDED') throw fail.forbidden('ACCOUNT_SUSPENDED', 'This account is suspended. Contact support.');
    if (user.status === 'DEACTIVATED') throw fail.forbidden('ACCOUNT_DEACTIVATED', 'This account was deactivated.');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      const max = await this.params.get<number>('LOGIN_MAX_FAILED_ATTEMPTS');
      const failed = user.failedLoginCount + 1;
      if (failed >= max) {
        const minutes = await this.params.get<number>('LOGIN_LOCK_MINUTES');
        await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + minutes * 60000) } });
        await this.notifications.notify(user.id, 'ACCOUNT_LOCKED', { minutes }, { sms: true });
        await this.audit.log({ actorId: user.id, action: 'ACCOUNT_LOCKED', entityType: 'User', entityId: user.id, ip });
        throw fail.forbidden('ACCOUNT_LOCKED', 'Your account is locked after too many failed sign-ins. Try again later or reset your password.');
      }
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: failed } });
      await this.audit.log({ actorId: user.id, action: 'SIGN_IN_FAILED', entityType: 'User', entityId: user.id, ip });
      throw fail.bad('BAD_CREDENTIALS', 'Phone number or password is not right.');
    }

    const staff = isStaff(user.roles);
    // Staff and administrators always use an authenticator app (FR-ACC-04).
    if (staff) {
      if (!user.mfaEnabled) {
        let secret = user.mfaSecret;
        if (!secret) {
          secret = authenticator.generateSecret();
          await this.prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });
        }
        if (!dto.mfaCode) {
          return { next: 'MFA_SETUP', mfaSetup: { secret, otpauth: authenticator.keyuri(user.phone, 'ToD Platform', secret) } };
        }
        if (!authenticator.check(dto.mfaCode, secret)) throw fail.bad('MFA_INVALID', 'The authenticator code is not right.');
        await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
      } else {
        if (!dto.mfaCode) return { next: 'MFA' };
        if (!authenticator.check(dto.mfaCode, user.mfaSecret!)) throw fail.bad('MFA_INVALID', 'The authenticator code is not right.');
      }
    } else if (dto.deviceId) {
      // A sign-in on a new device needs a one-time code (FR-ACC-03).
      const hash = sha256(dto.deviceId);
      const known = await this.prisma.trustedDevice.findUnique({ where: { userId_deviceHash: { userId: user.id, deviceHash: hash } } });
      if (!known) {
        if (!dto.otp) {
          const res = await this.otp.issue(phone, 'NEW_DEVICE', user.language);
          return { next: 'OTP', devCode: (res as any).devCode };
        }
        await this.otp.verify(phone, 'NEW_DEVICE', dto.otp);
        await this.prisma.trustedDevice.create({ data: { userId: user.id, deviceHash: hash } });
      } else {
        await this.prisma.trustedDevice.update({ where: { id: known.id }, data: { lastSeenAt: now } });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastSignInAt: now },
    });
    await this.audit.log({ actorId: user.id, action: 'SIGNED_IN', entityType: 'User', entityId: user.id, after: { staff }, ip });
    return this.session(updated, staff);
  }

  async resetPassword(dto: ResetPasswordDto, ip?: string) {
    const phone = normalisePhone(dto.phone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw fail.bad('OTP_INVALID', 'That code is not right. Check the SMS and try again.');
    await this.otp.verify(phone, 'RESET', dto.otp);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(dto.password, 10), failedLoginCount: 0, lockedUntil: null },
    });
    await this.audit.log({ actorId: user.id, action: 'PASSWORD_RESET', entityType: 'User', entityId: user.id, ip });
    return { ok: true };
  }

  // Assisted registration by a support agent (FR-ACC-06). The user's one-time
  // code proves consent; the agent is recorded. The user sets a password later
  // through "Forgot password".
  async assistedRegister(agentId: string, dto: AssistedRegisterDto, ip?: string) {
    const phone = normalisePhone(dto.phone);
    if (!dto.acceptTerms || !dto.acceptPrivacy || !dto.acceptCommunity) {
      throw fail.bad('CONSENT_REQUIRED', 'The user must accept the terms, privacy notice and community standards.');
    }
    if (await this.prisma.user.findUnique({ where: { phone } })) {
      throw fail.conflict('PHONE_TAKEN', 'This phone number already has an account.');
    }
    await this.otp.verify(phone, 'ASSISTED_CONSENT', dto.otp);
    const versions = await this.params.get<Record<string, string>>('POLICY_VERSIONS');
    const randomPassword = sha256(Math.random().toString() + Date.now());
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          phone,
          passwordHash: await bcrypt.hash(randomPassword, 10),
          displayName: dto.displayName.trim(),
          language: dto.language ?? 'am',
          roles: [dto.role],
          status: 'ACTIVE',
          assistedById: agentId,
        },
      });
      await tx.consent.createMany({
        data: ['TERMS', 'PRIVACY', 'COMMUNITY'].map((d) => ({ userId: u.id, document: d, version: versions[d], recordedById: agentId })),
      });
      await this.audit.log({ actorId: agentId, action: 'ASSISTED_REGISTRATION', entityType: 'User', entityId: u.id, after: { role: dto.role, phone }, ip }, tx);
      return this.publicUser(u);
    });
  }

  async addRole(userId: string, role: 'TALENT' | 'CLIENT') {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.roles.includes(role)) return this.publicUser(u);
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { roles: { push: role } } });
    await this.audit.log({ actorId: userId, action: 'ROLE_ADDED', entityType: 'User', entityId: userId, after: { role } });
    return this.publicUser(updated);
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { talentProfile: { select: { id: true, vettingStatus: true, publishedAt: true, onboardingStep: true } }, clientProfile: { select: { id: true, level: true } } },
    });
    return { ...this.publicUser(u), talentProfile: u.talentProfile, clientProfile: u.clientProfile };
  }

  publicUser(u: User) {
    return {
      id: u.id,
      phone: u.phone,
      displayName: u.displayName,
      language: u.language,
      roles: u.roles as Role[],
      status: u.status,
      identityStatus: u.identityStatus,
      identityMasked: u.identityMasked,
      verifiedName: u.verifiedName,
      notifyChannels: u.notifyChannels,
      email: u.email,
      safeguardingDesignated: u.safeguardingDesignated,
    };
  }

  private session(user: User, mfa: boolean): SessionResult {
    // Staff sessions are shorter (NFR-SEC-02).
    const token = jwt.sign({ sub: user.id, mfa }, config.jwtSecret, { expiresIn: mfa ? '8h' : '30d' });
    return { token, user: this.publicUser(user) };
  }
}
