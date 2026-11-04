import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { hasRole, isStaff, SessionUser } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { formatEtb } from '../common/money';
import { ParametersService } from '../common/parameters.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../common/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { addWorkingDays } from '../common/working-days';
import { transition } from '../assignments/state';
import { EscrowGateway } from '../integrations/escrow';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';

export const REMEDIES = ['CORRECTION', 'PARTIAL_ACCEPTANCE', 'MILESTONE_ADJUSTMENT', 'REFUND', 'REASSIGNMENT', 'RELEASE_IN_FULL'] as const;
export type Remedy = (typeof REMEDIES)[number];

export interface DecisionInput {
  remedy: Remedy;
  releaseAmount?: number; // santim to the talent (before commission)
  refundAmount?: number; // santim back to the client
  accountAction?: string;
  note: string;
}

// Dispute handling (section 4.12). Stages and limits follow BR-18:
// intake (2 working days), facilitated resolution (5), decision (10 from
// intake), and one appeal within 5 working days of the decision.
// Money moves only after a second, different authorised user approves the
// decision (FR-DSP-05), and only once the appeal window has passed or both
// parties accept the decision.
@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly params: ParametersService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly escrow: EscrowGateway,
    private readonly clock: ClockService,
    private readonly files: FilesService,
  ) {}

  private staffCan(me: SessionUser) {
    return isStaff(me.roles) && me.mfa && hasRole(me, 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER', 'AUDITOR');
  }

  async open(me: SessionUser, milestoneId: string, input: { reason: string; amountDisputed?: number }) {
    const m = await this.prisma.milestone.findUnique({ where: { id: milestoneId }, include: { assignment: { include: { packageVersion: true } } } });
    if (!m) throw fail.notFound('Milestone');
    const a = m.assignment;
    const role = a.clientId === me.id ? 'CLIENT' : a.talentId === me.id ? 'TALENT' : null;
    if (!role) throw fail.notFound('Milestone');
    const now = this.clock.now();
    const withinWindow = m.status === 'DELIVERED' && m.reviewWindowEndsAt && m.reviewWindowEndsAt > now;
    const revisionDispute = m.status === 'REVISION_REQUESTED';
    const nonDelivery = role === 'CLIENT' && m.status === 'IN_PROGRESS' && m.deadline && m.deadline < now;
    if (!withinWindow && !revisionDispute && !nonDelivery) {
      throw fail.conflict('DISPUTE_NOT_ALLOWED', 'A dispute can be opened during the review window, over a revision request, or after a missed deadline.');
    }
    const existing = await this.prisma.dispute.findFirst({ where: { milestoneId, stage: { not: 'CLOSED' } } });
    if (existing) throw fail.conflict('DISPUTE_EXISTS', 'There is already an open dispute on this milestone.');
    const amount = Math.min(input.amountDisputed ?? m.amount, m.amount);

    // Lock the evidence at the moment of opening (FR-DSP-02).
    const [messages, deliveries] = await Promise.all([
      this.prisma.message.findMany({ where: { assignmentId: a.id, threadTalentId: a.talentId! }, orderBy: { createdAt: 'asc' } }),
      this.prisma.delivery.findMany({ where: { milestoneId }, orderBy: { submittedAt: 'asc' } }),
    ]);
    const files = await this.prisma.fileObject.findMany({ where: { id: { in: [...deliveries.flatMap((d) => d.fileIds), ...messages.flatMap((x) => x.fileIds)] } }, select: { id: true, name: true, sha256: true, createdAt: true } });
    const evidence = {
      lockedAt: now,
      package: a.packageVersion
        ? { version: a.packageVersion.version, scope: a.packageVersion.scopeEn, exclusions: a.packageVersion.exclusionsEn, deliverable: a.packageVersion.deliverableEn, checklist: a.packageVersion.checklistEn, revisionLimit: a.packageVersion.revisionLimit }
        : { custom: true, brief: a.brief },
      milestone: { seq: m.seq, title: m.title, amount: m.amount, deadline: m.deadline, deliveredAt: m.deliveredAt, revisionsUsed: m.revisionsUsed },
      deliveries,
      messages: messages.map((x) => ({ id: x.id, senderId: x.senderId, body: x.body, fileIds: x.fileIds, at: x.createdAt })),
      files,
    };

    const owner = await this.pickOwner();
    const ref = await this.sequence.next('dispute', 'TODD');
    const dispute = await this.prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({
        data: { ref, assignmentId: a.id, milestoneId, openedById: me.id, openedByRole: role, reason: input.reason, amountDisputed: amount, ownerId: owner, evidence: JSON.parse(JSON.stringify(evidence)) },
      });
      await tx.milestone.update({ where: { id: milestoneId }, data: { status: 'DISPUTED' } });
      const fresh = await tx.assignment.findUniqueOrThrow({ where: { id: a.id } });
      await transition(tx, fresh, 'DISPUTED', me.id, `Dispute ${ref}`);
      await this.audit.log({ actorId: me.id, action: 'DISPUTE_OPENED', entityType: 'Dispute', entityId: d.id, after: { ref, milestoneId, amount, role, owner } }, tx);
      return d;
    });
    // Freeze the disputed amount until the case is closed (FR-ESC-08).
    await this.escrow.freeze({ idempotencyKey: `freeze:${ref}`, assignmentRef: a.ref, milestoneSeq: m.seq, amount: m.amount, disputeRef: ref });
    const vars = { title: a.title, ref };
    await this.notifications.notify(a.clientId, 'DISPUTE_OPENED', vars, { sms: true, link: `/disputes/${dispute.id}` });
    await this.notifications.notify(a.talentId!, 'DISPUTE_OPENED', vars, { sms: true, link: `/disputes/${dispute.id}` });
    if (owner) await this.notifications.notify(owner, 'STAFF_ALERT', { subject: `Dispute ${ref} assigned to you`, detail: `${a.ref}: ${input.reason.slice(0, 140)}` }, { link: `/console/disputes/${dispute.id}` });
    return this.get(me, dispute.id);
  }

  // The support agent with the fewest open cases owns the new one.
  private async pickOwner(exclude?: string | null): Promise<string | null> {
    const agents = await this.prisma.user.findMany({ where: { status: 'ACTIVE', roles: { has: 'SUPPORT_AGENT' }, ...(exclude ? { id: { not: exclude } } : {}) }, select: { id: true } });
    if (!agents.length) return null;
    const loads = await Promise.all(agents.map(async (g) => ({ id: g.id, n: await this.prisma.dispute.count({ where: { ownerId: g.id, stage: { not: 'CLOSED' } } }) })));
    return loads.sort((x, y) => x.n - y.n)[0].id;
  }

  async get(me: SessionUser, id: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { assignment: true, notes: { orderBy: { at: 'asc' } } } });
    if (!d) throw fail.notFound('Dispute');
    const staff = this.staffCan(me);
    const party = d.assignment.clientId === me.id || d.assignment.talentId === me.id;
    if (!staff && !party) throw fail.notFound('Dispute');
    const limits = await this.limits(d.createdAt);
    const approval = d.approvalId ? await this.prisma.approval.findUnique({ where: { id: d.approvalId } }) : null;
    const notes = staff ? d.notes : d.notes.filter((n) => !n.internal);
    const fileInfo = await this.files.describe(notes.flatMap((n) => n.fileIds));
    const authors = await this.prisma.user.findMany({ where: { id: { in: [...new Set(notes.map((n) => n.authorId))] } }, select: { id: true, displayName: true, verifiedName: true } });
    return {
      ...d,
      notes: notes.map((n) => {
        const a = authors.find((u) => u.id === n.authorId);
        // Parties see staff as "ToD case officer"; staff see names.
        const authorName = n.authorRole === 'STAFF' && !staff ? null : (a?.verifiedName ?? a?.displayName ?? null);
        return { ...n, authorName, files: n.fileIds.map((fid) => fileInfo.find((f) => f.id === fid)).filter(Boolean) };
      }),
      evidence: d.evidence,
      limits,
      approval: staff ? approval : approval ? { status: approval.status } : null,
      viewerRole: staff ? 'STAFF' : d.assignment.clientId === me.id ? 'CLIENT' : 'TALENT',
    };
  }

  async list(q: { stage?: string; ownerId?: string }) {
    const rows = await this.prisma.dispute.findMany({
      where: { ...(q.stage ? { stage: q.stage } : {}), ...(q.ownerId ? { ownerId: q.ownerId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { assignment: { select: { ref: true, title: true } } },
      take: 200,
    });
    return Promise.all(rows.map(async (d) => ({ ...d, evidence: undefined, limits: await this.limits(d.createdAt) })));
  }

  async mine(me: SessionUser) {
    return this.prisma.dispute.findMany({
      where: { assignment: { OR: [{ clientId: me.id }, { talentId: me.id }] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ref: true, stage: true, reason: true, amountDisputed: true, createdAt: true, closedAt: true, remedy: true, assignment: { select: { id: true, ref: true, title: true } } },
    });
  }

  private async limits(openedAt: Date) {
    const l = await this.params.get<{ intake: number; facilitation: number; decision: number; appeal: number }>('DISPUTE_LIMITS_WORKING_DAYS');
    const h = await this.params.holidays();
    const intakeBy = addWorkingDays(openedAt, l.intake, h);
    return { intakeBy, facilitationBy: addWorkingDays(intakeBy, l.facilitation, h), decisionBy: addWorkingDays(openedAt, l.decision, h), appealDays: l.appeal };
  }

  async addNote(me: SessionUser, id: string, body: string, internal: boolean, fileIds: string[] = []) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { assignment: true } });
    if (!d) throw fail.notFound('Dispute');
    const staff = this.staffCan(me);
    const role = d.assignment.clientId === me.id ? 'CLIENT' : d.assignment.talentId === me.id ? 'TALENT' : staff ? 'STAFF' : null;
    if (!role) throw fail.notFound('Dispute');
    if (d.stage === 'CLOSED') throw fail.conflict('DISPUTE_CLOSED', 'This case is closed.');
    const isInternal = role === 'STAFF' && internal;
    // Linking lets the other party (or only staff, for internal notes) open the files.
    if (fileIds.length) await this.files.link(me.id, fileIds, isInternal ? 'DISPUTE_INTERNAL' : 'DISPUTE', id);
    const note = await this.prisma.disputeNote.create({ data: { disputeId: id, authorId: me.id, authorRole: role, internal: isInternal, body, fileIds } });
    await this.audit.log({ actorId: me.id, action: 'DISPUTE_NOTE', entityType: 'Dispute', entityId: id, after: { role, internal: note.internal } });
    return note;
  }

  async advance(me: SessionUser, id: string, stage: 'FACILITATION' | 'DECISION') {
    const d = await this.prisma.dispute.findUnique({ where: { id } });
    if (!d) throw fail.notFound('Dispute');
    const order = ['INTAKE', 'FACILITATION', 'DECISION'];
    if (order.indexOf(stage) <= order.indexOf(d.stage)) throw fail.conflict('INVALID_STAGE', 'The case is already at or past this stage.');
    await this.prisma.dispute.update({ where: { id }, data: { stage, ownerId: d.ownerId ?? me.id } });
    await this.audit.log({ actorId: me.id, action: 'DISPUTE_STAGE', entityType: 'Dispute', entityId: id, before: { stage: d.stage }, after: { stage } });
    return this.get(me, id);
  }

  async reassign(me: SessionUser, id: string, ownerId: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id } });
    if (!d) throw fail.notFound('Dispute');
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner?.roles.includes('SUPPORT_AGENT')) throw fail.bad('NOT_AGENT', 'Cases can be owned by support agents only.');
    await this.prisma.dispute.update({ where: { id }, data: { ownerId } });
    await this.audit.log({ actorId: me.id, action: 'DISPUTE_REASSIGNED', entityType: 'Dispute', entityId: id, before: { ownerId: d.ownerId }, after: { ownerId } });
    return this.get(me, id);
  }

  // The mediator records the remedy and the financial outcome (FR-DSP-04).
  // It takes effect only after a second authorised user approves.
  async proposeDecision(me: SessionUser, id: string, input: DecisionInput) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { assignment: true } });
    if (!d) throw fail.notFound('Dispute');
    if (!['INTAKE', 'FACILITATION', 'DECISION', 'APPEAL'].includes(d.stage)) throw fail.conflict('INVALID_STAGE', 'This case cannot take a decision now.');
    if (d.decisionStatus === 'PENDING_APPROVAL') throw fail.conflict('DECISION_PENDING', 'A decision is waiting for approval.');
    if (d.stage === 'APPEAL' && d.decidedById === me.id) throw fail.forbidden('APPEAL_INDEPENDENCE', 'An appeal must be decided by someone other than the original decision-maker.');
    if (!REMEDIES.includes(input.remedy)) throw fail.bad('BAD_REMEDY', 'Choose a remedy.');
    const m = await this.prisma.milestone.findUniqueOrThrow({ where: { id: d.milestoneId } });
    let release = input.releaseAmount ?? 0;
    let refund = input.refundAmount ?? 0;
    if (input.remedy === 'RELEASE_IN_FULL') [release, refund] = [m.amount, 0];
    if (input.remedy === 'REFUND' || input.remedy === 'REASSIGNMENT') [release, refund] = [0, m.amount];
    if (input.remedy === 'CORRECTION') [release, refund] = [0, 0];
    if (input.remedy !== 'CORRECTION' && release + refund !== m.amount) {
      throw fail.bad('SPLIT_TOTAL', `The amounts to the talent and to the client must add up to ${formatEtb(m.amount)}.`);
    }
    const approval = await this.prisma.approval.create({
      data: { kind: 'DISPUTE_DECISION', subjectId: id, requestedById: me.id, payload: { remedy: input.remedy, releaseAmount: release, refundAmount: refund, accountAction: input.accountAction ?? null, note: input.note, appeal: d.stage === 'APPEAL' } },
    });
    await this.prisma.dispute.update({
      where: { id },
      data: { stage: d.stage === 'APPEAL' ? 'APPEAL' : 'DECISION', remedy: input.remedy, releaseAmount: release, refundAmount: refund, accountAction: input.accountAction, decisionNote: input.note, decidedById: me.id, decidedAt: this.clock.now(), approvalId: approval.id, decisionStatus: 'PENDING_APPROVAL' },
    });
    await this.audit.log({ actorId: me.id, action: 'DISPUTE_DECISION_PROPOSED', entityType: 'Dispute', entityId: id, after: approval.payload });
    await this.notifications.notifyRole(['FINANCE_OFFICER'], `Approve dispute decision ${d.ref}`, `${input.remedy}: ${formatEtb(release)} to talent, ${formatEtb(refund)} to client`, `/console/approvals`);
    return this.get(me, id);
  }

  // Second approver (FR-ESC-07, FR-DSP-05). Must be a different person.
  async decideApproval(me: SessionUser, approvalId: string, approve: boolean, note?: string) {
    const ap = await this.prisma.approval.findUnique({ where: { id: approvalId } });
    if (!ap || ap.kind !== 'DISPUTE_DECISION') throw fail.notFound('Approval');
    if (ap.status !== 'PENDING') throw fail.conflict('ALREADY_DECIDED', 'This approval was already decided.');
    if (ap.requestedById === me.id) throw fail.forbidden('SAME_PERSON', 'A different person must approve this decision.');
    const now = this.clock.now();
    await this.prisma.approval.update({ where: { id: ap.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: me.id, decidedAt: now, note } });
    const d = await this.prisma.dispute.findUniqueOrThrow({ where: { id: ap.subjectId }, include: { assignment: true } });
    await this.audit.log({ actorId: me.id, action: approve ? 'DISPUTE_DECISION_APPROVED' : 'DISPUTE_DECISION_REJECTED', entityType: 'Dispute', entityId: d.id, after: { approvalId, note } });
    if (!approve) {
      await this.prisma.dispute.update({ where: { id: d.id }, data: { decisionStatus: 'REJECTED' } });
      if (d.decidedById) await this.notifications.notify(d.decidedById, 'STAFF_ALERT', { subject: `Decision on ${d.ref} not approved`, detail: note ?? '' }, { link: `/console/disputes/${d.id}` });
      return { status: 'REJECTED' };
    }
    const payload = ap.payload as any;
    if (payload.appeal) {
      // The decision on appeal is final and takes effect at once (FR-DSP-06).
      await this.prisma.dispute.update({ where: { id: d.id }, data: { decisionStatus: 'APPROVED', finalDecision: true } });
      await this.execute(d.id, { requestedById: ap.requestedById, approvedById: me.id });
      return { status: 'EXECUTED' };
    }
    const l = await this.params.get<{ appeal: number }>('DISPUTE_LIMITS_WORKING_DAYS');
    const appealBy = addWorkingDays(now, l.appeal, await this.params.holidays());
    await this.prisma.dispute.update({ where: { id: d.id }, data: { decisionStatus: 'APPROVED', appealBy } });
    const outcome = `${payload.remedy.replace(/_/g, ' ').toLowerCase()}: ${formatEtb(payload.releaseAmount)} to the talent, ${formatEtb(payload.refundAmount)} to the client. You can accept it or appeal once by ${appealBy.toISOString().slice(0, 10)}.`;
    for (const u of [d.assignment.clientId, d.assignment.talentId!]) {
      await this.notifications.notify(u, 'STAFF_ALERT', { subject: `Decision on ${d.ref}`, detail: outcome }, { sms: true, link: `/disputes/${d.id}` });
    }
    return { status: 'APPROVED', appealBy };
  }

  // A party accepts the decision; once both have, it takes effect without waiting.
  async acceptDecision(me: SessionUser, id: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { assignment: true } });
    if (!d) throw fail.notFound('Dispute');
    if (d.decisionStatus !== 'APPROVED') throw fail.conflict('NO_DECISION', 'There is no approved decision to accept.');
    const now = this.clock.now();
    if (d.assignment.clientId === me.id) await this.prisma.dispute.update({ where: { id }, data: { clientAcceptedAt: now } });
    else if (d.assignment.talentId === me.id) await this.prisma.dispute.update({ where: { id }, data: { talentAcceptedAt: now } });
    else throw fail.notFound('Dispute');
    await this.audit.log({ actorId: me.id, action: 'DISPUTE_DECISION_ACCEPTED_BY_PARTY', entityType: 'Dispute', entityId: id });
    const fresh = await this.prisma.dispute.findUniqueOrThrow({ where: { id } });
    if (fresh.clientAcceptedAt && fresh.talentAcceptedAt) {
      const ap = await this.prisma.approval.findUniqueOrThrow({ where: { id: fresh.approvalId! } });
      await this.execute(id, { requestedById: ap.requestedById, approvedById: ap.decidedById! });
    }
    return this.get(me, id);
  }

  // One documented appeal per case, within the appeal window (FR-DSP-06).
  async appeal(me: SessionUser, id: string, reason: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { assignment: true } });
    if (!d) throw fail.notFound('Dispute');
    if (d.assignment.clientId !== me.id && d.assignment.talentId !== me.id) throw fail.notFound('Dispute');
    if (d.decisionStatus !== 'APPROVED' || !d.appealBy) throw fail.conflict('NO_DECISION', 'There is no decision to appeal.');
    if (d.appealedAt) throw fail.conflict('ALREADY_APPEALED', 'This case has already been appealed once.');
    if (this.clock.now() > d.appealBy) throw fail.conflict('APPEAL_WINDOW_CLOSED', 'The appeal window has closed.');
    const newOwner = await this.pickOwner(d.decidedById);
    await this.prisma.dispute.update({
      where: { id },
      data: { stage: 'APPEAL', appealedAt: this.clock.now(), appealedById: me.id, appealReason: reason, decisionStatus: null, ownerId: newOwner ?? d.ownerId },
    });
    await this.audit.log({ actorId: me.id, action: 'DISPUTE_APPEALED', entityType: 'Dispute', entityId: id, after: { reason, newOwner } });
    if (newOwner) await this.notifications.notify(newOwner, 'STAFF_ALERT', { subject: `Appeal on ${d.ref}`, detail: reason.slice(0, 160) }, { link: `/console/disputes/${id}` });
    return this.get(me, id);
  }

  // Executes an approved decision through the payments module and closes the case.
  async execute(id: string, approvals: { requestedById: string; approvedById: string }) {
    const d = await this.prisma.dispute.findUniqueOrThrow({ where: { id }, include: { assignment: true } });
    if (d.decisionStatus === 'EXECUTED') return;
    const m = await this.prisma.milestone.findUniqueOrThrow({ where: { id: d.milestoneId } });
    const a = d.assignment;
    const now = this.clock.now();
    await this.prisma.dispute.update({ where: { id }, data: { decisionStatus: 'EXECUTED', stage: 'CLOSED', closedAt: now } });

    if (d.remedy === 'CORRECTION') {
      // The talent corrects the work; the money stays in escrow, unfrozen, for normal acceptance.
      await this.escrow.unfreeze({ idempotencyKey: `unfreeze:${d.ref}`, assignmentRef: a.ref, milestoneSeq: m.seq, amount: m.amount, disputeRef: d.ref });
      await this.prisma.$transaction(async (tx) => {
        await tx.milestone.update({ where: { id: m.id }, data: { status: 'REVISION_REQUESTED', reviewWindowEndsAt: null } });
        const fresh = await tx.assignment.findUniqueOrThrow({ where: { id: a.id } });
        await transition(tx, fresh, 'FUNDED', approvals.approvedById, `Dispute ${d.ref}: correction`);
      });
    } else {
      // Move the assignment back to in-progress first if other milestones remain.
      const remaining = await this.prisma.milestone.findMany({ where: { assignmentId: a.id, id: { not: m.id }, status: { in: ['PENDING', 'IN_PROGRESS', 'DELIVERED', 'REVISION_REQUESTED'] } }, orderBy: { seq: 'asc' } });
      if (remaining.length) {
        await this.prisma.$transaction(async (tx) => {
          const fresh = await tx.assignment.findUniqueOrThrow({ where: { id: a.id } });
          await transition(tx, fresh, 'FUNDED', approvals.approvedById, `Dispute ${d.ref} decided`);
          const pending = remaining.find((x) => x.status === 'PENDING');
          if (pending && !remaining.some((x) => x.status !== 'PENDING')) await tx.milestone.update({ where: { id: pending.id }, data: { status: 'IN_PROGRESS' } });
        });
      }
      await this.prisma.milestone.update({ where: { id: m.id }, data: { status: 'ACCEPTED' } });
      await this.payments.splitMilestone(m.id, d.releaseAmount ?? 0, d.refundAmount ?? 0, approvals, d.ref);
    }
    await this.audit.log({ actorId: approvals.approvedById, action: 'DISPUTE_EXECUTED', entityType: 'Dispute', entityId: id, after: { remedy: d.remedy, release: d.releaseAmount, refund: d.refundAmount, accountAction: d.accountAction, approvals } });
    // Closure notices to both parties (FR-DSP-07).
    const outcome = `${(d.remedy ?? '').replace(/_/g, ' ').toLowerCase()}; ${formatEtb(d.releaseAmount ?? 0)} to the talent, ${formatEtb(d.refundAmount ?? 0)} to the client`;
    for (const u of [a.clientId, a.talentId!]) await this.notifications.notify(u, 'DISPUTE_CLOSED', { ref: d.ref, title: a.title, outcome }, { sms: true, link: `/disputes/${id}` });
  }

  // Scheduled: alerts when a stage limit approaches or is missed (FR-DSP-03),
  // and execution of decisions whose appeal window has closed.
  async processDeadlines() {
    const now = this.clock.now();
    const open = await this.prisma.dispute.findMany({ where: { stage: { not: 'CLOSED' } }, include: { assignment: true } });
    for (const d of open) {
      if (d.decisionStatus === 'APPROVED' && d.appealBy && d.appealBy < now && !d.appealedAt) {
        const ap = await this.prisma.approval.findUniqueOrThrow({ where: { id: d.approvalId! } });
        await this.execute(d.id, { requestedById: ap.requestedById, approvedById: ap.decidedById! });
        continue;
      }
      const l = await this.limits(d.createdAt);
      const checks: [string, Date, boolean][] = [
        ['intake', l.intakeBy, d.stage === 'INTAKE'],
        ['facilitation', l.facilitationBy, d.stage === 'INTAKE' || d.stage === 'FACILITATION'],
        ['decision', l.decisionBy, !d.decisionStatus || d.decisionStatus === 'REJECTED'],
      ];
      const sent = new Set(d.alertsSent);
      for (const [name, by, applies] of checks) {
        if (!applies) continue;
        const soonKey = `${name}:soon`;
        const missedKey = `${name}:missed`;
        const target = d.ownerId ? [d.ownerId] : [];
        if (by < now && !sent.has(missedKey)) {
          sent.add(missedKey);
          for (const t of target) await this.notifications.notify(t, 'STAFF_ALERT', { subject: `${d.ref}: ${name} limit missed`, detail: `The ${name} limit passed on ${by.toISOString().slice(0, 10)}.` }, { link: `/console/disputes/${d.id}` });
          await this.notifications.notifyRole(['PLATFORM_ADMIN'], `${d.ref}: ${name} limit missed`, d.assignment.ref, `/console/disputes/${d.id}`);
        } else if (by.getTime() - now.getTime() < 24 * 3600_000 && by > now && !sent.has(soonKey)) {
          sent.add(soonKey);
          for (const t of target) await this.notifications.notify(t, 'STAFF_ALERT', { subject: `${d.ref}: ${name} limit tomorrow`, detail: `Due ${by.toISOString().slice(0, 10)}.` }, { link: `/console/disputes/${d.id}` });
        }
      }
      if (sent.size !== d.alertsSent.length) await this.prisma.dispute.update({ where: { id: d.id }, data: { alertsSent: [...sent] } });
    }
  }
}
