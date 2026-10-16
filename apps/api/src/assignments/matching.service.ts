import { Injectable } from '@nestjs/common';
import { Tier } from '@prisma/client';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';
import { TrustService } from '../ratings/trust.service';

const TIER_RANK: Record<Tier, number> = { ENTRY: 1, INTERMEDIATE: 2, EXPERT: 3 };
const ACTIVE = ['AGREED', 'FUNDED', 'DELIVERED', 'DISPUTED'] as const;

export interface Candidate {
  talentUserId: string;
  name: string;
  tier: Tier;
  score: number;
  detail: Record<string, number>;
  inclusionSlot: boolean;
}

// Ranks eligible talents for an assignment (FR-MAT-02) and applies the
// configurable inclusion rule for new Entry-tier talents (FR-MAT-03).
//
// Eligible: published profile, active account, identity verified or
// provisional, a tier in the service area at or above the package minimum,
// and fewer active assignments than the tier allows (FR-TAL-06).
//
// Score (0-100) is a weighted sum of components, each 0-1:
//   availability  hours per week (40+ = 1) and matching work mode
//   readiness     profile completeness until the readiness index (FR-TAL-08) is available
//   trust         trust score, or 0.6 for talents without history
//   responseTime  measured average response to invitations
//   tier          higher tier ranks slightly higher
@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService, private readonly params: ParametersService, private readonly trust: TrustService) {}

  async rank(input: { serviceAreaId: string; minTier: Tier; excludeUserIds?: string[]; workMode?: 'REMOTE' | 'ONSITE' | 'BOTH' }): Promise<Candidate[]> {
    const weights = await this.params.get<Record<string, number>>('MATCH_WEIGHTS');
    const concurrency = await this.params.get<Record<Tier, number>>('TIER_CONCURRENCY');
    const tiers = await this.prisma.talentTier.findMany({
      where: {
        serviceAreaId: input.serviceAreaId,
        talent: {
          publishedAt: { not: null },
          user: { status: 'ACTIVE', identityStatus: { in: ['VERIFIED', 'PROVISIONAL'] }, ...(input.excludeUserIds?.length ? { id: { notIn: input.excludeUserIds } } : {}) },
        },
      },
      include: { talent: { include: { user: true, portfolio: { select: { id: true } } } } },
    });

    const out: Candidate[] = [];
    for (const t of tiers) {
      if (TIER_RANK[t.tier] < TIER_RANK[input.minTier]) continue;
      const p = t.talent;
      const active = await this.prisma.assignment.count({ where: { talentId: p.userId, status: { in: [...ACTIVE] } } });
      if (active >= (concurrency[t.tier] ?? 1)) continue;

      const trust = await this.trust.forTalent(p.userId);
      const modeOk = !input.workMode || input.workMode === 'BOTH' || p.workMode === 'BOTH' || p.workMode === input.workMode;
      const availability = Math.min(1, (p.hoursPerWeek ?? 10) / 40) * (modeOk ? 1 : 0.5);
      const readinessChecks = [!!p.headline, !!p.bio, p.skills.length > 0, p.portfolio.length > 0, !!p.hoursPerWeek, !!p.payoutChannel];
      const readiness = readinessChecks.filter(Boolean).length / readinessChecks.length;
      const trustC = trust.score === null ? 0.6 : trust.score / 100;
      const rt = p.avgResponseMinutes;
      const responseTime = rt === null ? 0.5 : rt <= 60 ? 1 : rt <= 240 ? 0.75 : rt <= 1440 ? 0.45 : 0.2;
      const tierC = TIER_RANK[t.tier] / 3;
      const detail = { availability, readiness, trust: trustC, responseTime, tier: tierC };
      let score = 0;
      let sum = 0;
      for (const [k, w] of Object.entries(weights)) {
        score += ((detail as any)[k] ?? 0) * w;
        sum += w;
      }
      score = sum ? (score / sum) * 100 : 0;
      // Sanctioned talents with reduced visibility rank lower (FR-VET-10).
      if (p.visibility === 'REDUCED') score *= 0.5;
      out.push({ talentUserId: p.userId, name: p.user.verifiedName ?? p.user.displayName, tier: t.tier, score: Math.round(score * 10) / 10, detail, inclusionSlot: false });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  // Top N, with reserved places for new Entry-tier talents who have no
  // completed assignments yet.
  async shortlist(input: Parameters<MatchingService['rank']>[0]): Promise<Candidate[]> {
    const size = await this.params.get<number>('MATCH_SHORTLIST_SIZE');
    const slots = await this.params.get<number>('MATCH_INCLUSION_SLOTS');
    const ranked = await this.rank(input);
    const newcomers: Candidate[] = [];
    for (const c of ranked) {
      if (c.tier !== 'ENTRY') continue;
      const done = await this.prisma.assignment.count({ where: { talentId: c.talentUserId, status: 'CLOSED' } });
      if (done === 0) newcomers.push(c);
    }
    const reserved = newcomers.slice(0, Math.min(slots, size));
    const reservedIds = new Set(reserved.map((c) => c.talentUserId));
    const rest = ranked.filter((c) => !reservedIds.has(c.talentUserId)).slice(0, size - reserved.length);
    // If the top of the list already includes a newcomer, they keep their place
    // and the reserved slot is not needed for them.
    const list = [...rest, ...reserved.map((c) => ({ ...c, inclusionSlot: !rest.some((r) => r.talentUserId === c.talentUserId) }))];
    return list.sort((a, b) => b.score - a.score).slice(0, size);
  }
}
