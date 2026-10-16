import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../common/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';
import { addWorkingDays } from '../common/working-days';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { DeliverDto } from './dto';
import { transition } from './state';

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly params: ParametersService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly files: FilesService,
    private readonly clock: ClockService,
  ) {}

  private async load(milestoneId: string) {
    const m = await this.prisma.milestone.findUnique({ where: { id: milestoneId }, include: { assignment: { include: { packageVersion: true } } } });
    if (!m) throw fail.notFound('Milestone');
    return m;
  }

  // Talent submits evidence against the acceptance checklist (FR-ASG-03), which
  // opens the review window (FR-ASG-04).
  async deliver(me: SessionUser, milestoneId: string, dto: DeliverDto) {
    const m = await this.load(milestoneId);
    const a = m.assignment;
    if (a.talentId !== me.id) throw fail.notFound('Milestone');
    if (!['FUNDED', 'DELIVERED'].includes(a.status)) throw fail.conflict('NOT_FUNDED', 'Work can be delivered only after the assignment is funded.');
    if (!['IN_PROGRESS', 'REVISION_REQUESTED'].includes(m.status)) throw fail.conflict('INVALID_STATE', 'This milestone is not open for delivery.');
    const expected = a.packageVersion?.checklistEn ?? [];
    if (expected.length) {
      const items = new Set(dto.checklist.map((c) => c.item));
      const missing = expected.filter((e) => !items.has(e));
      if (missing.length) throw fail.bad('CHECKLIST_INCOMPLETE', `Answer every checklist item: ${missing.join('; ')}`);
    }
    if (!dto.note && !dto.links?.length && !dto.fileIds?.length) throw fail.bad('EVIDENCE_REQUIRED', 'Add files, links or notes as evidence.');
    if (dto.fileIds?.length) await this.files.link(me.id, dto.fileIds, 'ASSIGNMENT', a.id);

    const now = this.clock.now();
    const days = await this.params.get<number>('REVIEW_WINDOW_WORKING_DAYS');
    const reviewEnds = addWorkingDays(now, days, await this.params.holidays());
    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.create({ data: { milestoneId: m.id, note: dto.note, links: dto.links ?? [], fileIds: dto.fileIds ?? [], checklist: dto.checklist as any } });
      await tx.milestone.update({ where: { id: m.id }, data: { status: 'DELIVERED', deliveredAt: now, reviewWindowEndsAt: reviewEnds, remindersSent: 0 } });
      const fresh = await tx.assignment.findUniqueOrThrow({ where: { id: a.id } });
      if (fresh.status === 'FUNDED') await transition(tx, fresh, 'DELIVERED', me.id, `Milestone ${m.seq} delivered`);
      await this.audit.log({ actorId: me.id, action: 'MILESTONE_DELIVERED', entityType: 'Milestone', entityId: m.id, after: { reviewEnds, files: dto.fileIds?.length ?? 0, links: dto.links?.length ?? 0 } }, tx);
    });
    await this.notifications.notify(a.clientId, 'DELIVERED', { title: a.title, due: reviewEnds.toISOString().slice(0, 10) }, { sms: true, link: `/assignments/${a.id}` });
    return { reviewWindowEndsAt: reviewEnds };
  }

  // Up to the package's revision limit (FR-ASG-05).
  async requestRevision(me: SessionUser, milestoneId: string, reason: string) {
    const m = await this.load(milestoneId);
    const a = m.assignment;
    if (a.clientId !== me.id) throw fail.notFound('Milestone');
    if (m.status !== 'DELIVERED') throw fail.conflict('INVALID_STATE', 'You can ask for a revision only after delivery.');
    const limit = a.packageVersion?.revisionLimit ?? 2;
    if (m.revisionsUsed >= limit) {
      throw fail.conflict('REVISION_LIMIT', `This package includes ${limit} revision(s), and they have been used. Further changes need a new assignment or an agreed adjustment.`);
    }
    await this.prisma.$transaction(async (tx) => {
      const last = await tx.delivery.findFirst({ where: { milestoneId: m.id }, orderBy: { submittedAt: 'desc' } });
      if (last) await tx.delivery.update({ where: { id: last.id }, data: { revisionRequest: reason, revisionRequestedAt: this.clock.now() } });
      await tx.milestone.update({ where: { id: m.id }, data: { status: 'REVISION_REQUESTED', revisionsUsed: { increment: 1 }, reviewWindowEndsAt: null } });
      const fresh = await tx.assignment.findUniqueOrThrow({ where: { id: a.id } });
      if (fresh.status === 'DELIVERED') await transition(tx, fresh, 'FUNDED', me.id, `Revision requested on milestone ${m.seq}`);
      await this.audit.log({ actorId: me.id, action: 'REVISION_REQUESTED', entityType: 'Milestone', entityId: m.id, after: { reason, used: m.revisionsUsed + 1, limit } }, tx);
    });
    await this.notifications.notify(a.talentId!, 'REVISION_REQUESTED', { title: a.title, reason }, { sms: true, link: `/assignments/${a.id}` });
    return { revisionsUsed: m.revisionsUsed + 1, limit };
  }

  // Client sign-off, confirmed with their password or PIN (FR-ASG-06).
  async accept(me: SessionUser, milestoneId: string, password: string) {
    const m = await this.load(milestoneId);
    if (m.assignment.clientId !== me.id) throw fail.notFound('Milestone');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await bcrypt.compare(password, user.passwordHash))) throw fail.bad('SIGN_OFF_PASSWORD', 'Your password or PIN is not right.');
    return this.markAccepted(m.id, me.id, false);
  }

  // Shared by manual acceptance and review-window expiry (FR-ESC-05).
  async markAccepted(milestoneId: string, actorId: string | null, auto: boolean) {
    const m = await this.load(milestoneId);
    const a = m.assignment;
    if (m.status !== 'DELIVERED') throw fail.conflict('INVALID_STATE', 'Only delivered work can be accepted.');
    const openDispute = await this.prisma.dispute.findFirst({ where: { milestoneId: m.id, stage: { not: 'CLOSED' } } });
    if (openDispute) throw fail.conflict('DISPUTE_OPEN', 'This milestone is in dispute.');
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.milestone.updateMany({ where: { id: m.id, status: 'DELIVERED' }, data: { status: 'ACCEPTED', acceptedAt: now, acceptedById: actorId, autoAccepted: auto } });
      if (res.count !== 1) throw fail.conflict('STATE_CHANGED', 'This milestone was just updated. Refresh and try again.');
      const next = await tx.milestone.findFirst({ where: { assignmentId: a.id, seq: { gt: m.seq }, status: 'PENDING' }, orderBy: { seq: 'asc' } });
      const fresh = await tx.assignment.findUniqueOrThrow({ where: { id: a.id } });
      if (next) {
        await tx.milestone.update({ where: { id: next.id }, data: { status: 'IN_PROGRESS' } });
        if (fresh.status === 'DELIVERED') await transition(tx, fresh, 'FUNDED', actorId, `Milestone ${m.seq} accepted; milestone ${next.seq} started`);
      } else {
        const stillOpen = await tx.milestone.count({ where: { assignmentId: a.id, status: { in: ['IN_PROGRESS', 'DELIVERED', 'REVISION_REQUESTED', 'DISPUTED'] } } });
        if (!stillOpen && fresh.status !== 'ACCEPTED') await transition(tx, fresh, 'ACCEPTED', actorId, auto ? 'Accepted when the review window closed' : 'Accepted by client');
      }
      // Signed-off evidence: who accepted which delivery, and when.
      const last = await tx.delivery.findFirst({ where: { milestoneId: m.id }, orderBy: { submittedAt: 'desc' } });
      await this.audit.log({ actorId, action: auto ? 'MILESTONE_AUTO_ACCEPTED' : 'MILESTONE_SIGNED_OFF', entityType: 'Milestone', entityId: m.id, after: { deliveryId: last?.id, at: now } }, tx);
    });
    await this.payments.settleMilestone(m.id, auto ? 'REVIEW_WINDOW_EXPIRED' : 'ACCEPTED');
    return { ok: true };
  }

  // Scheduled: reminders during the review window, and automatic acceptance
  // when it closes without acceptance or dispute (FR-ASG-04, BR-03).
  async processReviewWindows() {
    const now = this.clock.now();
    const reminders = await this.params.get<number>('REVIEW_WINDOW_REMINDERS');
    const open = await this.prisma.milestone.findMany({ where: { status: 'DELIVERED', reviewWindowEndsAt: { not: null } }, include: { assignment: true } });
    let accepted = 0;
    for (const m of open) {
      const start = m.deliveredAt!.getTime();
      const end = m.reviewWindowEndsAt!.getTime();
      if (now.getTime() >= end) {
        try {
          await this.markAccepted(m.id, null, true);
          accepted++;
        } catch {
          // A dispute or concurrent update; leave for the next run.
        }
        continue;
      }
      // Reminder k is due at k/(n+1) of the way through the window.
      const due = Math.floor(((now.getTime() - start) / (end - start)) * (reminders + 1));
      if (due > m.remindersSent && m.remindersSent < reminders) {
        await this.prisma.milestone.update({ where: { id: m.id }, data: { remindersSent: Math.min(due, reminders) } });
        await this.notifications.notify(m.assignment.clientId, 'REVIEW_REMINDER', { title: m.assignment.title, due: m.reviewWindowEndsAt!.toISOString().slice(0, 10) }, { sms: true, link: `/assignments/${m.assignmentId}` });
      }
    }
    return { accepted };
  }

  // Scheduled: warn both parties and support before and at a missed deadline (FR-ASG-08).
  async processDeadlines() {
    const now = this.clock.now();
    const soon = new Date(now.getTime() + 24 * 3600_000);
    const active = await this.prisma.milestone.findMany({ where: { status: { in: ['IN_PROGRESS', 'REVISION_REQUESTED'] }, deadline: { not: null } }, include: { assignment: true } });
    for (const m of active) {
      const vars = { title: m.assignment.title, deadline: m.deadline!.toISOString().slice(0, 10) };
      if (m.deadline! <= now && !m.deadlineMissedAt) {
        await this.prisma.milestone.update({ where: { id: m.id }, data: { deadlineMissedAt: now } });
        await this.notifications.notify(m.assignment.clientId, 'DEADLINE_MISSED', vars, { link: `/assignments/${m.assignmentId}` });
        await this.notifications.notify(m.assignment.talentId!, 'DEADLINE_MISSED', vars, { sms: true, link: `/assignments/${m.assignmentId}` });
        await this.notifications.notifyRole(['SUPPORT_AGENT'], 'Missed deadline', `${m.assignment.ref} milestone ${m.seq}`, `/console/assignments/${m.assignmentId}`);
      } else if (m.deadline! <= soon && m.deadline! > now && !m.deadlineAlertedAt) {
        await this.prisma.milestone.update({ where: { id: m.id }, data: { deadlineAlertedAt: now } });
        await this.notifications.notify(m.assignment.talentId!, 'DEADLINE_SOON', vars, { sms: true, link: `/assignments/${m.assignmentId}` });
        await this.notifications.notify(m.assignment.clientId, 'DEADLINE_SOON', vars, { link: `/assignments/${m.assignmentId}` });
        await this.notifications.notifyRole(['SUPPORT_AGENT'], 'Deadline in 24 hours', `${m.assignment.ref} milestone ${m.seq}`, `/console/assignments/${m.assignmentId}`);
      }
    }
  }

  // Scheduled: expire unanswered invitations, and alert support when an
  // assignment has had no proposal for a working day (FR-MAT-07).
  async processInvitations() {
    const now = this.clock.now();
    await this.prisma.invitation.updateMany({ where: { status: 'INVITED', respondBy: { lt: now } }, data: { status: 'EXPIRED' } });
    const days = await this.params.get<number>('NO_PROPOSAL_ALERT_WORKING_DAYS');
    const holidays = await this.params.holidays();
    const open = await this.prisma.assignment.findMany({ where: { status: 'OPEN', noProposalAlertAt: null }, include: { _count: { select: { proposals: true } } } });
    for (const a of open) {
      if (a._count.proposals > 0) continue;
      if (addWorkingDays(a.createdAt, days, holidays) > now) continue;
      await this.prisma.assignment.update({ where: { id: a.id }, data: { noProposalAlertAt: now } });
      await this.notifications.notifyRole(['SUPPORT_AGENT'], 'No proposals after one working day', `${a.ref}: ${a.title}`, `/console/assignments/${a.id}`);
    }
  }
}
