import { Injectable } from '@nestjs/common';
import { ClockService } from '../common/clock.service';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';

// Commission (FR-COM-01, FR-COM-02): 5% standard, 1% inclusive rate for
// verified women and for persons with disabilities. The rate is fixed on the
// assignment when it is agreed, so a later parameter change only affects
// later assignments.
@Injectable()
export class CommissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParametersService,
    private readonly clock: ClockService,
  ) {}

  async rateFor(talentUserId: string): Promise<{ rate: number; rule: 'STANDARD' | 'INCLUSIVE_WOMEN' | 'INCLUSIVE_DISABILITY' }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: talentUserId }, include: { talentProfile: true } });
    const standard = Number(await this.params.get('COMMISSION_STANDARD_RATE'));
    const inclusive = Number(await this.params.get('COMMISSION_INCLUSIVE_RATE'));
    const elig = await this.params.get<{ verifiedWomen: boolean; confirmedDisability: boolean }>('COMMISSION_INCLUSIVE_ELIGIBILITY');
    // The inclusive rate runs for the pilot period only unless extended (BR-02).
    const until = await this.params.get<string | null>('COMMISSION_INCLUSIVE_UNTIL');
    if (until && this.clock.now().toISOString().slice(0, 10) > until) return { rate: standard, rule: 'STANDARD' };
    // "Verified" means sex comes from a completed identity verification, not self-declaration.
    if (elig.verifiedWomen && user.identityStatus === 'VERIFIED' && user.sex === 'FEMALE') return { rate: inclusive, rule: 'INCLUSIVE_WOMEN' };
    // Disability is self-declared; staff confirm it before the rate applies.
    if (elig.confirmedDisability && user.talentProfile?.disability && user.talentProfile.disabilityConfirmed) return { rate: inclusive, rule: 'INCLUSIVE_DISABILITY' };
    return { rate: standard, rule: 'STANDARD' };
  }
}
