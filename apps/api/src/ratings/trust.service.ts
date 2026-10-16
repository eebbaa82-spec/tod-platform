import { Injectable } from '@nestjs/common';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';

export interface TrustScore {
  score: number | null; // 0-100, null while the talent is new
  level: 'NEW' | 'TRUSTED' | 'TOP_RATED' | 'ESTABLISHED';
  completed: number;
  averageRating: number | null;
  ratingCount: number;
  components: Record<string, number | null>;
}

// Trust score from the weighted components in BR-15, shown as a level (FR-RAT-05).
// Components, each 0-1:
//   delivery     settled assignments / (settled + cancelled after funding + disputes lost)
//   clientRating average of the last 20 client ratings / 5
//   timeliness   milestones delivered on or before the deadline / milestones delivered
//   repeat       clients who came back / distinct clients
//   conduct      1 - (disputes decided against the talent + sanctions) / completed, floored at 0
@Injectable()
export class TrustService {
  constructor(private readonly prisma: PrismaService, private readonly params: ParametersService) {}

  async forTalent(talentUserId: string): Promise<TrustScore> {
    const weights = await this.params.get<Record<string, number>>('TRUST_WEIGHTS');
    const thresholds = await this.params.get<{ minCompleted: number; trusted: number; topRated: number }>('TRUST_THRESHOLDS');

    const assignments = await this.prisma.assignment.findMany({
      where: { talentId: talentUserId, status: { in: ['CLOSED', 'ACCEPTED', 'CANCELLED', 'DISPUTED'] }, fundedAt: { not: null } },
      select: { id: true, clientId: true, status: true, milestones: { select: { deadline: true, deliveredAt: true, status: true } }, disputes: { select: { refundAmount: true, releaseAmount: true, stage: true } } },
    });
    const completed = assignments.filter((a) => a.status === 'CLOSED' || a.status === 'ACCEPTED').length;
    const cancelled = assignments.filter((a) => a.status === 'CANCELLED').length;
    const lost = assignments.flatMap((a) => a.disputes).filter((d) => d.stage === 'CLOSED' && (d.refundAmount ?? 0) > (d.releaseAmount ?? 0)).length;

    const ratings = await this.prisma.rating.findMany({
      where: { rateeId: talentUserId, direction: 'CLIENT_TO_TALENT', publishedAt: { not: null }, removedReason: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { average: true },
    });
    const ratingCount = await this.prisma.rating.count({ where: { rateeId: talentUserId, direction: 'CLIENT_TO_TALENT', publishedAt: { not: null }, removedReason: null } });
    const avg = ratings.length ? ratings.reduce((s, r) => s + r.average, 0) / ratings.length : null;

    const delivered = assignments.flatMap((a) => a.milestones).filter((m) => m.deliveredAt);
    const onTime = delivered.filter((m) => !m.deadline || m.deliveredAt! <= m.deadline).length;

    const byClient = new Map<string, number>();
    for (const a of assignments.filter((x) => x.status === 'CLOSED' || x.status === 'ACCEPTED')) byClient.set(a.clientId, (byClient.get(a.clientId) ?? 0) + 1);
    const repeatClients = [...byClient.values()].filter((n) => n > 1).length;

    const components = {
      delivery: completed + cancelled + lost ? completed / (completed + cancelled + lost) : null,
      clientRating: avg !== null ? avg / 5 : null,
      timeliness: delivered.length ? onTime / delivered.length : null,
      repeat: byClient.size ? repeatClients / byClient.size : null,
      conduct: completed ? Math.max(0, 1 - lost / completed) : null,
    };

    if (completed < thresholds.minCompleted) {
      return { score: null, level: 'NEW', completed, averageRating: avg, ratingCount, components };
    }
    // Missing components (for example no repeat clients yet) are scored on the
    // weights that are available, so a talent is not penalised for them.
    let total = 0;
    let weightSum = 0;
    for (const [k, w] of Object.entries(weights)) {
      const v = (components as any)[k];
      if (v === null || v === undefined) continue;
      total += v * w;
      weightSum += w;
    }
    const score = weightSum ? Math.round((total / weightSum) * 100) : null;
    const level = score === null ? 'NEW' : score >= thresholds.topRated ? 'TOP_RATED' : score >= thresholds.trusted ? 'TRUSTED' : 'ESTABLISHED';
    return { score, level, completed, averageRating: avg, ratingCount, components };
  }
}
