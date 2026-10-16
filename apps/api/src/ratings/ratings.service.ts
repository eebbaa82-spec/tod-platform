import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';

// Criteria per direction (FR-RAT-01), each on a five-point scale.
export const CRITERIA = {
  CLIENT_TO_TALENT: ['quality', 'timeliness', 'communication'],
  TALENT_TO_CLIENT: ['clarityOfBrief', 'responsiveness', 'conduct'],
} as const;

@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly params: ParametersService,
    private readonly clock: ClockService,
  ) {}

  async submit(me: SessionUser, assignmentId: string, scores: Record<string, number>, comment?: string) {
    const a = await this.prisma.assignment.findUnique({ where: { id: assignmentId }, include: { milestones: { include: { settlement: true } } } });
    if (!a) throw fail.notFound('Assignment');
    const direction = a.clientId === me.id ? 'CLIENT_TO_TALENT' : a.talentId === me.id ? 'TALENT_TO_CLIENT' : null;
    if (!direction) throw fail.notFound('Assignment');
    // Only assignments settled through escrow can be rated (FR-RAT-02).
    const settled = a.milestones.some((m) => m.settlement?.status === 'PAID' && m.settlement.gross > 0);
    if (a.status !== 'CLOSED' || !settled) throw fail.conflict('NOT_SETTLED', 'You can rate once the assignment is settled.');
    const criteria = CRITERIA[direction];
    for (const c of criteria) {
      const v = scores[c];
      if (!Number.isInteger(v) || v < 1 || v > 5) throw fail.bad('BAD_SCORE', `Give ${c} a score from 1 to 5.`);
    }
    const clean = Object.fromEntries(criteria.map((c) => [c, scores[c]]));
    const average = Math.round((criteria.reduce((s, c) => s + scores[c], 0) / criteria.length) * 100) / 100;
    const exists = await this.prisma.rating.findUnique({ where: { assignmentId_direction: { assignmentId, direction } } });
    if (exists) throw fail.conflict('ALREADY_RATED', 'You have already rated this assignment.');
    const rating = await this.prisma.rating.create({
      data: { assignmentId, raterId: me.id, rateeId: direction === 'CLIENT_TO_TALENT' ? a.talentId! : a.clientId, direction, scores: clean, average, comment: comment?.slice(0, 2000) },
    });
    // Publish both together when both are in (FR-RAT-03).
    const other = await this.prisma.rating.findUnique({ where: { assignmentId_direction: { assignmentId, direction: direction === 'CLIENT_TO_TALENT' ? 'TALENT_TO_CLIENT' : 'CLIENT_TO_TALENT' } } });
    if (other) {
      const now = this.clock.now();
      await this.prisma.rating.updateMany({ where: { assignmentId, publishedAt: null }, data: { publishedAt: now } });
    }
    await this.audit.log({ actorId: me.id, action: 'RATING_SUBMITTED', entityType: 'Rating', entityId: rating.id, after: { direction, average } });
    return this.prisma.rating.findUniqueOrThrow({ where: { id: rating.id } });
  }

  // Scheduled: publish ratings that have waited the configured number of days (BR-17).
  async publishDue() {
    const days = await this.params.get<number>('RATING_PUBLICATION_DAYS');
    const cutoff = new Date(this.clock.now().getTime() - days * 24 * 3600_000);
    const res = await this.prisma.rating.updateMany({ where: { publishedAt: null, createdAt: { lte: cutoff } }, data: { publishedAt: this.clock.now() } });
    return { published: res.count };
  }

  // One public reply by the rated party (FR-RAT-04).
  async reply(me: SessionUser, ratingId: string, reply: string) {
    const r = await this.prisma.rating.findUnique({ where: { id: ratingId } });
    if (!r || r.rateeId !== me.id) throw fail.notFound('Rating');
    if (!r.publishedAt) throw fail.conflict('NOT_PUBLISHED', 'You can reply once the rating is published.');
    if (r.reply) throw fail.conflict('ALREADY_REPLIED', 'You have already replied to this rating.');
    const updated = await this.prisma.rating.update({ where: { id: ratingId }, data: { reply: reply.slice(0, 1000), repliedAt: this.clock.now() } });
    await this.audit.log({ actorId: me.id, action: 'RATING_REPLY', entityType: 'Rating', entityId: ratingId });
    return updated;
  }

  // Moderators remove abusive content with a recorded reason (FR-RAT-04).
  async remove(me: SessionUser, ratingId: string, reason: string) {
    const r = await this.prisma.rating.findUnique({ where: { id: ratingId } });
    if (!r) throw fail.notFound('Rating');
    const updated = await this.prisma.rating.update({ where: { id: ratingId }, data: { removedReason: reason, removedById: me.id } });
    await this.audit.log({ actorId: me.id, action: 'RATING_REMOVED', entityType: 'Rating', entityId: ratingId, before: { comment: r.comment }, after: { reason } });
    return updated;
  }

  async pendingForUser(userId: string) {
    const closed = await this.prisma.assignment.findMany({ where: { status: 'CLOSED', OR: [{ clientId: userId }, { talentId: userId }] }, include: { ratings: true }, orderBy: { closedAt: 'desc' }, take: 50 });
    return closed
      .filter((a) => !a.ratings.some((r) => r.raterId === userId))
      .map((a) => ({ assignmentId: a.id, ref: a.ref, title: a.title, direction: a.clientId === userId ? 'CLIENT_TO_TALENT' : 'TALENT_TO_CLIENT' }));
  }
}
