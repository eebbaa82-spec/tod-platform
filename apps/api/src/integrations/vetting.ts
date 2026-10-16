import { Injectable } from '@nestjs/common';
import { Tier, VettingStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { PublicationService } from './publication';

// ============================================================================
// DEVELOPER INTEGRATION POINT: Vetting workflow (section 4.4)
// ============================================================================
// The six-stage pipeline (capability tests, references, screening, induction
// quiz, sanctions) is built by the integration developer. The marketplace only
// needs its outcome: whether the talent is approved, and their tier and test
// score per service area. The vetting module calls VettingOutcomeService.apply().
// A profile is published only when vetting is APPROVED and identity is VERIFIED
// or PROVISIONAL (FR-VET-07, FR-TAL-11).

export interface VettingOutcome {
  talentUserId: string;
  status: VettingStatus;
  tiers?: { serviceAreaCode: string; tier: Tier; testScore?: number }[];
  reviewerId?: string;
  note?: string;
}

@Injectable()
export class VettingOutcomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly publication: PublicationService,
    private readonly clock: ClockService,
  ) {}

  async apply(o: VettingOutcome) {
    const profile = await this.prisma.talentProfile.findUnique({ where: { userId: o.talentUserId }, include: { user: true } });
    if (!profile) throw fail.bad('NO_TALENT_PROFILE', 'This user has no talent profile yet.');
    for (const t of o.tiers ?? []) {
      const area = await this.prisma.serviceArea.findUnique({ where: { code: t.serviceAreaCode } });
      if (!area) throw fail.bad('UNKNOWN_SERVICE_AREA', `Unknown service area ${t.serviceAreaCode}.`);
      await this.prisma.talentTier.upsert({
        where: { talentId_serviceAreaId: { talentId: profile.id, serviceAreaId: area.id } },
        create: { talentId: profile.id, serviceAreaId: area.id, tier: t.tier, testScore: t.testScore, assignedById: o.reviewerId },
        update: { tier: t.tier, testScore: t.testScore, assignedById: o.reviewerId, assignedAt: this.clock.now() },
      });
    }
    await this.prisma.talentProfile.update({ where: { id: profile.id }, data: { vettingStatus: o.status } });
    await this.audit.log({
      actorId: o.reviewerId,
      action: 'VETTING_OUTCOME',
      entityType: 'TalentProfile',
      entityId: profile.id,
      before: { status: profile.vettingStatus },
      after: { status: o.status, tiers: o.tiers, note: o.note },
    });
    return { published: await this.publication.refresh(o.talentUserId) };
  }
}
