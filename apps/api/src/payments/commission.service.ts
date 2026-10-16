import { Injectable } from '@nestjs/common';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';

// Commission (FR-COM-01, FR-COM-02): 5% standard, 1% inclusive rate for
// verified women and for persons with disabilities. The rate is fixed on the
// assignment when it is agreed, so a later parameter change only affects
// later assignments.
@Injectable()
export class CommissionService {
  constructor(private readonly prisma: PrismaService, private readonly params: ParametersService) {}

  async rateFor(talentUserId: string): Promise<{ rate: number; rule: 'STANDARD' | 'INCLUSIVE_WOMEN' | 'INCLUSIVE_DISABILITY' }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: talentUserId }, include: { talentProfile: true } });
    const standard = Number(await this.params.get('COMMISSION_STANDARD_RATE'));
    const inclusive = Number(await this.params.get('COMMISSION_INCLUSIVE_RATE'));
    const elig = await this.params.get<{ verifiedWomen: boolean; confirmedDisability: boolean }>('COMMISSION_INCLUSIVE_ELIGIBILITY');
    // "Verified" means sex comes from a completed Fayda verification, not self-declaration.
    if (elig.verifiedWomen && user.identityStatus === 'VERIFIED' && user.sex === 'FEMALE') return { rate: inclusive, rule: 'INCLUSIVE_WOMEN' };
    // Disability is self-declared; staff confirm it before the rate applies.
    if (elig.confirmedDisability && user.talentProfile?.disability && user.talentProfile.disabilityConfirmed) return { rate: inclusive, rule: 'INCLUSIVE_DISABILITY' };
    return { rate: standard, rule: 'STANDARD' };
  }
}
