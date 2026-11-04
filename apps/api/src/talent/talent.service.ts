import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { encryptField, maskAccount } from '../common/crypto';
import { fail } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { FilesService } from '../files/files.service';
import { TrustService } from '../ratings/trust.service';
import { PayoutAccountDto, PortfolioItemDto, UpdateTalentProfileDto } from './dto';

const ACTIVE_STATES = ['AGREED', 'FUNDED', 'DELIVERED', 'DISPUTED'] as const;

@Injectable()
export class TalentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly trust: TrustService,
  ) {}

  async ensureProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.roles.includes('TALENT')) throw fail.forbidden('NOT_TALENT', 'Only talent accounts have a talent profile.');
    return this.prisma.talentProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  // The talent's own view, including private fields.
  async mine(userId: string) {
    await this.ensureProfile(userId);
    const p = await this.prisma.talentProfile.findUniqueOrThrow({
      where: { userId },
      include: { tiers: { include: { serviceArea: true } }, portfolio: { orderBy: { createdAt: 'desc' } }, user: true },
    });
    const { payoutAccountEnc, user, ...rest } = p;
    return {
      ...rest,
      identity: { status: user.identityStatus, masked: user.identityMasked, verifiedName: user.verifiedName, sex: user.sex, dateOfBirth: user.dateOfBirth },
      completeness: completeness(p),
      trust: await this.trust.forTalent(userId),
    };
  }

  async update(userId: string, dto: UpdateTalentProfileDto) {
    const before = await this.ensureProfile(userId);
    const updated = await this.prisma.talentProfile.update({
      where: { userId },
      data: {
        ...dto,
        education: dto.education as any,
        credentials: dto.credentials as any,
        experience: dto.experience as any,
        skills: dto.skills?.map((s) => s.trim()).filter(Boolean),
      },
    });
    // Inclusion fields are sensitive; log only that they changed.
    const sensitive = ['disability', 'displaced', 'otherMarginalised'].filter((k) => (dto as any)[k] !== undefined && (dto as any)[k] !== (before as any)[k]);
    await this.audit.log({ actorId: userId, action: 'TALENT_PROFILE_UPDATED', entityType: 'TalentProfile', entityId: before.id, after: { fields: Object.keys(dto), sensitiveChanged: sensitive } });
    return updated;
  }

  // Payout account must be in the talent's verified name before the first payout (FR-TAL-09).
  async setPayout(userId: string, dto: PayoutAccountDto) {
    const profile = await this.ensureProfile(userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const nameMatches = !!user.verifiedName && sameName(user.verifiedName, dto.accountName);
    const updated = await this.prisma.talentProfile.update({
      where: { userId },
      data: {
        payoutChannel: dto.channel,
        payoutAccountEnc: encryptField(JSON.stringify({ number: dto.accountNumber, bank: dto.bankName ?? null })),
        payoutAccountMasked: maskAccount(dto.accountNumber),
        payoutAccountName: dto.accountName.trim(),
        payoutNameVerified: nameMatches,
      },
    });
    await this.audit.log({ actorId: userId, action: 'PAYOUT_ACCOUNT_SET', entityType: 'TalentProfile', entityId: profile.id, after: { channel: dto.channel, masked: updated.payoutAccountMasked, nameVerified: nameMatches } });
    return { channel: updated.payoutChannel, masked: updated.payoutAccountMasked, accountName: updated.payoutAccountName, nameVerified: updated.payoutNameVerified };
  }

  // Public profile photo (an image the talent uploads with purpose PHOTO), or null to remove it.
  async setPhoto(userId: string, fileId: string | null) {
    const profile = await this.ensureProfile(userId);
    if (fileId) {
      const f = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
      if (!f || f.ownerId !== userId || !f.mime.startsWith('image/')) throw fail.bad('PHOTO_INVALID', 'Choose a PNG, JPEG or WebP photo you uploaded.');
      await this.files.link(userId, [fileId], 'PROFILE_PHOTO', profile.id);
    }
    await this.prisma.talentProfile.update({ where: { id: profile.id }, data: { photoFileId: fileId } });
    await this.audit.log({ actorId: userId, action: 'PROFILE_PHOTO_SET', entityType: 'TalentProfile', entityId: profile.id, after: { fileId } });
    return { photoFileId: fileId };
  }

  async addPortfolio(userId: string, dto: PortfolioItemDto) {
    const profile = await this.ensureProfile(userId);
    if (!dto.url && !dto.fileId) throw fail.bad('PORTFOLIO_EMPTY', 'Add a link or a file.');
    if (dto.fileId) await this.files.link(userId, [dto.fileId], 'PORTFOLIO', profile.id);
    return this.prisma.portfolioItem.create({ data: { talentId: profile.id, ...dto } });
  }

  async removePortfolio(userId: string, id: string) {
    const profile = await this.ensureProfile(userId);
    const res = await this.prisma.portfolioItem.deleteMany({ where: { id, talentId: profile.id } });
    if (!res.count) throw fail.notFound('Portfolio item');
    return { ok: true };
  }

  // Public profile. Disability, displacement, contact, referee and payment
  // details are never included (FR-TAL-03).
  async publicProfile(talentUserId: string) {
    const p = await this.prisma.talentProfile.findUnique({
      where: { userId: talentUserId },
      include: { tiers: { include: { serviceArea: true } }, portfolio: { orderBy: { createdAt: 'desc' } }, user: true },
    });
    if (!p || !p.publishedAt || p.user.status !== 'ACTIVE') throw fail.notFound('Talent');
    const trust = await this.trust.forTalent(talentUserId);
    const ratings = await this.prisma.rating.findMany({
      where: { rateeId: talentUserId, direction: 'CLIENT_TO_TALENT', publishedAt: { not: null }, removedReason: null },
      orderBy: { publishedAt: 'desc' },
      take: 10,
      select: { id: true, scores: true, average: true, comment: true, reply: true, publishedAt: true },
    });
    return {
      userId: p.userId,
      name: p.user.verifiedName ?? p.user.displayName,
      photoFileId: p.photoFileId,
      verified: p.user.identityStatus === 'VERIFIED',
      provisional: p.user.identityStatus === 'PROVISIONAL',
      // Badge with masked identifier, e.g. "Verified FAN ID: 6302 XXXX XXXX 9718" (FR-KYC-05).
      identityMasked: p.user.identityMasked,
      headline: p.headline,
      bio: p.bio,
      city: p.city,
      subCity: p.subCity,
      skills: p.skills,
      languages: p.languages,
      education: p.education,
      credentials: p.credentials,
      experience: p.experience,
      availability: { hoursPerWeek: p.hoursPerWeek, workingDays: p.workingDays, workMode: p.workMode },
      responseTimeMinutes: p.avgResponseMinutes,
      tiers: p.tiers.map((t) => ({ serviceArea: t.serviceArea.code, nameEn: t.serviceArea.nameEn, nameAm: t.serviceArea.nameAm, tier: t.tier, testScore: t.testScore })),
      portfolio: p.portfolio,
      trust: { level: trust.level, score: trust.score, completed: trust.completed, averageRating: trust.averageRating, ratingCount: trust.ratingCount },
      ratings,
      memberSince: p.createdAt,
    };
  }

  async search(q: { serviceArea?: string; tier?: string; text?: string }) {
    const profiles = await this.prisma.talentProfile.findMany({
      where: {
        publishedAt: { not: null },
        user: { status: 'ACTIVE' },
        ...(q.serviceArea ? { tiers: { some: { serviceArea: { code: q.serviceArea }, ...(q.tier ? { tier: q.tier as any } : {}) } } } : {}),
        ...(q.text ? { OR: [{ headline: { contains: q.text, mode: 'insensitive' } }, { skills: { has: q.text } }] } : {}),
      },
      include: { user: true, tiers: { include: { serviceArea: true } } },
      take: 50,
      orderBy: { publishedAt: 'desc' },
    });
    return Promise.all(
      profiles.map(async (p) => {
        const trust = await this.trust.forTalent(p.userId);
        return {
          userId: p.userId,
          name: p.user.verifiedName ?? p.user.displayName,
          headline: p.headline,
          verified: p.user.identityStatus === 'VERIFIED',
          subCity: p.subCity,
          tiers: p.tiers.map((t) => ({ serviceArea: t.serviceArea.code, tier: t.tier })),
          trustLevel: trust.level,
          averageRating: trust.averageRating,
          completed: trust.completed,
        };
      }),
    );
  }

  async activeCount(talentUserId: string) {
    return this.prisma.assignment.count({ where: { talentId: talentUserId, status: { in: [...ACTIVE_STATES] } } });
  }
}

function sameName(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean).sort().join(' ');
  return norm(a) === norm(b);
}

function completeness(p: any) {
  const checks = [
    !!p.headline,
    !!p.bio,
    (p.skills?.length ?? 0) > 0,
    (p.education?.length ?? 0) > 0,
    (p.portfolio?.length ?? 0) > 0,
    !!p.hoursPerWeek && (p.workingDays?.length ?? 0) > 0,
    !!p.payoutChannel,
    !!p.subCity,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
