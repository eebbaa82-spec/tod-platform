import { Injectable } from '@nestjs/common';
import { ClientLevel } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';
import { FilesService } from '../files/files.service';
import { ClientProfileDto } from './dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly params: ParametersService,
    private readonly files: FilesService,
    private readonly clock: ClockService,
  ) {}

  // Three client levels (FR-CLI-01 to FR-CLI-04). Identity of the owner or
  // individual is verified through Fayda by the identity module.
  async upsert(userId: string, dto: ClientProfileDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.roles.includes('CLIENT')) throw fail.forbidden('NOT_CLIENT', 'Only client accounts have a client profile.');
    if (dto.level === 'VERIFIED_ENTERPRISE') {
      const missing = (['enterpriseName', 'tradeLicenceNo', 'tin', 'sector', 'subCity'] as const).filter((k) => !dto[k]);
      if (missing.length || dto.staffSize === undefined) {
        throw fail.bad('ENTERPRISE_FIELDS', 'A verified enterprise needs its name, trade licence, taxpayer number (TIN), sector, sub-city and staff size.');
      }
      if (!/^\d{10}$/.test(dto.tin!)) throw fail.bad('TIN_FORMAT', 'The taxpayer number (TIN) has 10 digits.');
    }
    if (dto.level === 'BASIC_ENTERPRISE' && !dto.enterpriseName) {
      throw fail.bad('ENTERPRISE_FIELDS', 'Give the business name.');
    }
    if (dto.level === 'BASIC_ENTERPRISE' && !dto.activityEvidence && !dto.evidenceFileId) {
      throw fail.bad('ACTIVITY_EVIDENCE', 'Add evidence of business activity from a referral partner or a site visit.');
    }
    const existing = await this.prisma.clientProfile.findUnique({ where: { userId } });
    if (dto.evidenceFileId) await this.files.link(userId, [dto.evidenceFileId], 'CLIENT_PROFILE', userId);
    const levelChanged = existing && existing.level !== dto.level;
    const profile = await this.prisma.clientProfile.upsert({
      where: { userId },
      create: { userId, ...dto },
      // A level change needs staff confirmation again.
      update: { ...dto, ...(levelChanged ? { levelConfirmedAt: null, levelConfirmedById: null } : {}) },
    });
    await this.audit.log({ actorId: userId, action: existing ? 'CLIENT_PROFILE_UPDATED' : 'CLIENT_PROFILE_CREATED', entityType: 'ClientProfile', entityId: profile.id, before: existing ? { level: existing.level } : null, after: { level: dto.level, referralSource: dto.referralSource } });
    return profile;
  }

  async mine(userId: string) {
    const p = await this.prisma.clientProfile.findUnique({ where: { userId }, include: { user: true } });
    if (!p) return null;
    const { user, ...rest } = p;
    return { ...rest, identity: { status: user.identityStatus, masked: user.identityMasked, verifiedName: user.verifiedName } };
  }

  // Staff confirm the licence, TIN or activity evidence for the level.
  async confirmLevel(staffId: string, clientUserId: string, note: string) {
    const p = await this.prisma.clientProfile.findUnique({ where: { userId: clientUserId } });
    if (!p) throw fail.notFound('Client profile');
    const updated = await this.prisma.clientProfile.update({ where: { userId: clientUserId }, data: { levelConfirmedAt: this.clock.now(), levelConfirmedById: staffId } });
    await this.audit.log({ actorId: staffId, action: 'CLIENT_LEVEL_CONFIRMED', entityType: 'ClientProfile', entityId: p.id, after: { level: p.level, note } });
    return updated;
  }

  async limits() {
    return this.params.get<Record<string, number | null>>('ASSIGNMENT_VALUE_LIMITS');
  }

  // The level used for limits: unconfirmed enterprises are treated as basic,
  // and provisional identities get the provisional limit (FR-CLI-05, FR-KYC-09).
  async effectiveLimit(clientUserId: string): Promise<{ level: ClientLevel | 'PROVISIONAL' | 'UNVERIFIED'; limit: number | null }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: clientUserId }, include: { clientProfile: true } });
    const limits = await this.params.get<Record<string, number | null>>('ASSIGNMENT_VALUE_LIMITS');
    if (!user.clientProfile) throw fail.bad('NO_CLIENT_PROFILE', 'Complete your client profile first.');
    if (user.identityStatus === 'PROVISIONAL') return { level: 'PROVISIONAL', limit: limits.PROVISIONAL ?? null };
    if (user.identityStatus !== 'VERIFIED') return { level: 'UNVERIFIED', limit: 0 };
    let level = user.clientProfile.level;
    if (level === 'VERIFIED_ENTERPRISE' && !user.clientProfile.levelConfirmedAt) level = 'BASIC_ENTERPRISE';
    return { level, limit: limits[level] ?? null };
  }
}
