import { Injectable, Logger } from '@nestjs/common';
import { Assignment, Milestone } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { formatEtb, splitCommission } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { transition } from '../assignments/state';
import { ParametersService } from '../common/parameters.service';
import { EscrowGateway, Party } from '../integrations/escrow';
import { NotificationsService } from '../notifications/notifications.service';

// The marketplace side of payments: it creates payment instructions, works
// out commission and tells the escrow module what to release or refund. It
// holds no money and keeps no escrow ledger (that is the escrow module's job).
@Injectable()
export class PaymentsService {
  private log = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly escrow: EscrowGateway,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly clock: ClockService,
    private readonly params: ParametersService,
  ) {}

  // FR-ESC-14: until the partner bank confirms regulated escrow, the
  // arrangement is "interim" and every release and refund needs two people.
  async isInterim() {
    return (await this.params.get<string>('ESCROW_MODE')) !== 'REGULATED';
  }

  async party(userId: string): Promise<Party> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { talentProfile: true } });
    return {
      userId: u.id,
      name: u.verifiedName ?? u.displayName,
      channel: u.talentProfile?.payoutChannel ?? null,
      accountRef: u.talentProfile?.payoutAccountMasked ?? null,
    };
  }

  // FR-ESC-01 payment instruction with a unique reference for each funded assignment.
  async createFundingInstruction(assignment: Assignment) {
    const existing = await this.prisma.paymentInstruction.findFirst({ where: { assignmentId: assignment.id, status: 'PENDING' } });
    if (existing) return existing;
    const reference = await this.sequence.next('payment', 'TODP');
    const instruction = await this.prisma.paymentInstruction.create({
      data: { assignmentId: assignment.id, reference, amount: assignment.agreedPrice! },
    });
    // Every assignment that takes money gets a named case owner and, in
    // interim mode, the "interim" label (FR-ESC-14).
    await this.prisma.assignment.update({
      where: { id: assignment.id },
      data: { interim: await this.isInterim(), caseOwnerId: assignment.caseOwnerId ?? (await this.pickCaseOwner()) },
    });
    const res = await this.escrow.requestCollection({
      idempotencyKey: `collect:${reference}`,
      assignmentRef: assignment.ref,
      paymentReference: reference,
      amount: instruction.amount,
      payer: await this.party(assignment.clientId),
    });
    const saved = await this.prisma.paymentInstruction.update({
      where: { id: instruction.id },
      data: { instructionsEn: res?.instructionsEn ?? null, instructionsAm: res?.instructionsAm ?? null, checkoutUrl: res?.checkoutUrl ?? null },
    });
    await this.notifications.notify(
      assignment.clientId,
      'PAYMENT_INSTRUCTION',
      { amount: formatEtb(instruction.amount), title: assignment.title, reference },
      { sms: true, link: `/assignments/${assignment.id}` },
    );
    return saved;
  }

  // Release a milestone to the talent, net of commission (FR-ESC-05, FR-ESC-06).
  async settleMilestone(milestoneId: string, reason: 'ACCEPTED' | 'REVIEW_WINDOW_EXPIRED') {
    const m = await this.prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId }, include: { assignment: true, settlement: true } });
    if (m.settlement) return m.settlement;
    const a = m.assignment;
    const rate = Number(a.commissionRate);
    const { gross, commission, net } = splitCommission(m.amount, rate);
    const instructionRef = await this.sequence.next('settlement', 'TODS');
    const interim = await this.isInterim();
    const settlement = await this.prisma.settlement.create({
      data: { milestoneId: m.id, gross, commissionRate: a.commissionRate!, commission, net, kind: 'RELEASE', instructionRef, reason, status: interim ? 'AWAITING_APPROVAL' : 'INSTRUCTED' },
    });
    if (interim) return this.holdForApproval(settlement.id, a, `Release ${formatEtb(gross)} to the talent`);
    return this.instructRelease(settlement.id);
  }

  // Sends a release to the escrow module (directly, or after two finance officers agree in interim mode).
  private async instructRelease(settlementId: string) {
    const settlement = await this.prisma.settlement.findUniqueOrThrow({ where: { id: settlementId }, include: { milestone: { include: { assignment: true } } } });
    const m = settlement.milestone;
    const a = m.assignment;
    const { gross, commission, net, instructionRef } = settlement;
    const reason = settlement.reason as 'ACCEPTED' | 'REVIEW_WINDOW_EXPIRED';
    const rate = Number(settlement.commissionRate);
    if (settlement.status === 'AWAITING_APPROVAL') await this.prisma.settlement.update({ where: { id: settlementId }, data: { status: 'INSTRUCTED' } });
    await this.escrow.release({
      idempotencyKey: `release:${m.id}`,
      assignmentRef: a.ref,
      milestoneSeq: m.seq,
      instructionRef,
      gross,
      commission,
      net,
      payee: await this.party(a.talentId!),
      reason,
    });
    await this.audit.log({ action: 'RELEASE_INSTRUCTED', entityType: 'Milestone', entityId: m.id, after: { instructionRef, gross, commission, net, rate, reason } });
    await this.notifications.notify(a.talentId!, 'ACCEPTED_TALENT', { title: a.title, net: formatEtb(net), commission: formatEtb(commission) }, { sms: true, link: `/assignments/${a.id}` });
    if (this.escrow.provider.completesImmediately) await this.payoutCompleted(instructionRef, 'test-stand-in');
    return this.prisma.settlement.findUniqueOrThrow({ where: { id: settlementId } });
  }

  // Money returned to the client for a milestone that will not be paid
  // (cancellation after funding by agreement). Goes to the originating account (FR-ESC-10).
  async refundMilestone(milestoneId: string, reason: string) {
    const m = await this.prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId }, include: { assignment: true, settlement: true } });
    if (m.settlement) return m.settlement;
    const a = m.assignment;
    const instructionRef = await this.sequence.next('settlement', 'TODS');
    const interim = await this.isInterim();
    const settlement = await this.prisma.settlement.create({
      data: { milestoneId: m.id, gross: 0, commissionRate: 0, commission: 0, net: 0, refundAmount: m.amount, kind: 'REFUND', instructionRef, reason, status: interim ? 'AWAITING_APPROVAL' : 'INSTRUCTED' },
    });
    if (interim) return this.holdForApproval(settlement.id, a, `Refund ${formatEtb(m.amount)} to the client`);
    return this.instructRefund(settlement.id);
  }

  private async instructRefund(settlementId: string) {
    const settlement = await this.prisma.settlement.findUniqueOrThrow({ where: { id: settlementId }, include: { milestone: { include: { assignment: true } } } });
    const m = settlement.milestone;
    const a = m.assignment;
    const { instructionRef, reason } = settlement;
    if (settlement.status === 'AWAITING_APPROVAL') await this.prisma.settlement.update({ where: { id: settlementId }, data: { status: 'INSTRUCTED' } });
    await this.escrow.refund({ idempotencyKey: `refund:${m.id}`, assignmentRef: a.ref, milestoneSeq: m.seq, instructionRef, amount: settlement.refundAmount, payer: await this.party(a.clientId), reason });
    await this.audit.log({ action: 'REFUND_INSTRUCTED', entityType: 'Milestone', entityId: m.id, after: { instructionRef, amount: settlement.refundAmount, reason } });
    if (this.escrow.provider.completesImmediately) await this.payoutCompleted(instructionRef, 'test-stand-in');
    return this.prisma.settlement.findUniqueOrThrow({ where: { id: settlementId } });
  }

  // ---------------------------------------------------------------------------
  // Interim mode (FR-ESC-14): a finance officer proposes the release or refund,
  // a second, different finance officer approves it, and only then is it sent.
  // ---------------------------------------------------------------------------

  private async holdForApproval(settlementId: string, a: Assignment, summary: string) {
    await this.audit.log({ action: 'SETTLEMENT_HELD_INTERIM', entityType: 'Settlement', entityId: settlementId, after: { assignmentRef: a.ref, summary } });
    await this.notifications.notifyRole(['FINANCE_OFFICER'], `${a.ref}: ${summary}`, 'Interim escrow: two finance officers must authorise this.', '/console/funding');
    return this.prisma.settlement.findUniqueOrThrow({ where: { id: settlementId } });
  }

  async awaitingApproval() {
    const rows = await this.prisma.settlement.findMany({
      where: { status: 'AWAITING_APPROVAL' },
      orderBy: { createdAt: 'asc' },
      include: { milestone: { select: { seq: true, title: true, amount: true, assignment: { select: { id: true, ref: true, title: true, caseOwnerId: true } } } } },
    });
    const approvals = await this.prisma.approval.findMany({ where: { subjectId: { in: rows.map((r) => r.id) }, status: 'PENDING' } });
    return rows.map((r) => ({ ...r, approval: approvals.find((x) => x.subjectId === r.id) ?? null }));
  }

  // First finance officer: proposes the instruction.
  async authorise(settlementId: string, me: { id: string }, note?: string) {
    const s = await this.prisma.settlement.findUnique({ where: { id: settlementId } });
    if (!s) throw fail.notFound('Settlement');
    if (s.status !== 'AWAITING_APPROVAL') throw fail.conflict('NOT_AWAITING', 'This instruction is not waiting for authorisation.');
    const open = await this.prisma.approval.findFirst({ where: { subjectId: s.id, status: 'PENDING' } });
    if (open) throw fail.conflict('ALREADY_AUTHORISED', 'This instruction already waits for a second approver.');
    const ap = await this.prisma.approval.create({
      data: { kind: s.kind === 'REFUND' ? 'INTERIM_REFUND' : 'INTERIM_RELEASE', subjectId: s.id, payload: { instructionRef: s.instructionRef, gross: s.gross, net: s.net, refundAmount: s.refundAmount }, requestedById: me.id, note: note ?? null },
    });
    await this.audit.log({ actorId: me.id, action: 'INTERIM_INSTRUCTION_AUTHORISED', entityType: 'Settlement', entityId: s.id, after: { approvalId: ap.id, instructionRef: s.instructionRef } });
    return ap;
  }

  // Second finance officer: approves (sends it) or rejects.
  async decide(approvalId: string, me: { id: string }, approve: boolean, note?: string) {
    const ap = await this.prisma.approval.findUnique({ where: { id: approvalId } });
    if (!ap || !ap.kind.startsWith('INTERIM_')) throw fail.notFound('Approval');
    if (ap.status !== 'PENDING') throw fail.conflict('ALREADY_DECIDED', 'This approval has already been decided.');
    if (ap.requestedById === me.id) throw fail.forbidden('SAME_PERSON', 'A second, different person must approve this.');
    await this.prisma.approval.update({ where: { id: ap.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: me.id, decidedAt: this.clock.now(), note: note ?? ap.note } });
    await this.audit.log({ actorId: me.id, action: approve ? 'INTERIM_INSTRUCTION_APPROVED' : 'INTERIM_INSTRUCTION_REJECTED', entityType: 'Settlement', entityId: ap.subjectId, after: { approvalId: ap.id, requestedById: ap.requestedById, note } });
    if (!approve) return { status: 'REJECTED' };
    const s = ap.kind === 'INTERIM_REFUND' ? await this.instructRefund(ap.subjectId) : await this.instructRelease(ap.subjectId);
    return { status: 'APPROVED', settlement: s };
  }

  // The support agent with the fewest open cases becomes the case owner.
  private async pickCaseOwner(): Promise<string | null> {
    const staff = await this.prisma.user.findMany({ where: { roles: { has: 'SUPPORT_AGENT' }, status: 'ACTIVE' }, select: { id: true } });
    if (!staff.length) return null;
    const load = await this.prisma.assignment.groupBy({ by: ['caseOwnerId'], where: { caseOwnerId: { in: staff.map((s) => s.id) }, status: { notIn: ['CLOSED', 'CANCELLED'] } }, _count: { _all: true } });
    const count = (id: string) => load.find((l) => l.caseOwnerId === id)?._count._all ?? 0;
    return staff.sort((x, y) => count(x.id) - count(y.id))[0].id;
  }

  // Dispute outcome split between talent and client (FR-DSP-05).
  async splitMilestone(milestoneId: string, releaseAmount: number, refundAmount: number, approvals: { requestedById: string; approvedById: string }, disputeRef: string) {
    const m = await this.prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId }, include: { assignment: true, settlement: true } });
    if (m.settlement) return m.settlement;
    if (releaseAmount + refundAmount !== m.amount) throw fail.bad('SPLIT_TOTAL', 'The release and refund must add up to the milestone amount.');
    const a = m.assignment;
    const rate = Number(a.commissionRate);
    const { gross, commission, net } = splitCommission(releaseAmount, rate);
    const instructionRef = await this.sequence.next('settlement', 'TODS');
    const kind = refundAmount === 0 ? 'RELEASE' : releaseAmount === 0 ? 'REFUND' : 'SPLIT';
    const settlement = await this.prisma.settlement.create({
      data: { milestoneId: m.id, gross, commissionRate: a.commissionRate!, commission, net, refundAmount, kind, instructionRef, reason: 'DISPUTE_DECISION' },
    });
    await this.escrow.unfreeze({ idempotencyKey: `unfreeze:${disputeRef}`, assignmentRef: a.ref, milestoneSeq: m.seq, amount: m.amount, disputeRef });
    await this.escrow.split({
      idempotencyKey: `split:${m.id}`,
      assignmentRef: a.ref,
      milestoneSeq: m.seq,
      instructionRef,
      toTalent: { gross, commission, net, payee: await this.party(a.talentId!) },
      toClient: { amount: refundAmount, payer: await this.party(a.clientId) },
      approvals,
    });
    await this.audit.log({ actorId: approvals.approvedById, action: 'SPLIT_INSTRUCTED', entityType: 'Milestone', entityId: m.id, after: { instructionRef, releaseAmount, refundAmount, commission, net, disputeRef, approvals } });
    if (this.escrow.provider.completesImmediately) await this.payoutCompleted(instructionRef, 'test-stand-in');
    return settlement;
  }

  // Called by the escrow module when the bank or provider confirms the payout
  // or refund. Idempotent.
  async payoutCompleted(instructionRef: string, providerRef: string) {
    const s = await this.prisma.settlement.findUnique({ where: { instructionRef }, include: { milestone: { include: { assignment: true } } } });
    if (!s) throw fail.notFound('Settlement');
    if (s.status === 'PAID') return s;
    const now = this.clock.now();
    const updated = await this.prisma.settlement.update({ where: { id: s.id }, data: { status: 'PAID', paidAt: now } });
    const m = s.milestone;
    const a = m.assignment;
    await this.prisma.milestone.update({ where: { id: m.id }, data: { status: s.kind === 'REFUND' ? 'REFUNDED' : 'SETTLED' } });
    await this.audit.log({ action: 'SETTLEMENT_PAID', entityType: 'Settlement', entityId: s.id, after: { instructionRef, providerRef } });

    // Receipt to both parties (FR-ESC-06).
    if (s.kind !== 'REFUND') {
      const vars = { ref: instructionRef, title: a.title, gross: formatEtb(s.gross), commission: formatEtb(s.commission), net: formatEtb(s.net) };
      await this.notifications.notify(a.clientId, 'RECEIPT', vars, { link: `/assignments/${a.id}` });
      await this.notifications.notify(a.talentId!, 'RECEIPT', vars, { link: `/assignments/${a.id}` });
    }

    // Close the assignment once every milestone is settled or refunded.
    const milestones = await this.prisma.milestone.findMany({ where: { assignmentId: a.id } });
    const done = milestones.every((x) => ['SETTLED', 'REFUNDED', 'CANCELLED'].includes(x.status));
    if (done) {
      const anyPaid = milestones.some((x) => x.status === 'SETTLED');
      await this.prisma.$transaction(async (tx) => {
        const fresh = await tx.assignment.findUniqueOrThrow({ where: { id: a.id } });
        if (fresh.status === 'CLOSED' || fresh.status === 'CANCELLED') return;
        if (anyPaid) {
          if (fresh.status !== 'ACCEPTED' && fresh.status !== 'DISPUTED') await transition(tx, fresh, 'ACCEPTED', null, 'All milestones settled');
          await transition(tx, fresh, 'CLOSED', null, 'Settled', { closedAt: now });
        } else {
          await transition(tx, fresh, 'CANCELLED', null, 'Refunded', { closedAt: now });
        }
      });
      if (anyPaid) {
        await this.notifications.notify(a.clientId, 'RATE_PROMPT', { title: a.title }, { link: `/assignments/${a.id}#rate` });
        await this.notifications.notify(a.talentId!, 'RATE_PROMPT', { title: a.title }, { link: `/assignments/${a.id}#rate` });
      }
    }
    return updated;
  }

  async receipt(instructionRef: string, userId: string, isStaffUser: boolean) {
    const s = await this.prisma.settlement.findUnique({ where: { instructionRef }, include: { milestone: { include: { assignment: true } } } });
    if (!s) throw fail.notFound('Receipt');
    const a = s.milestone.assignment;
    if (!isStaffUser && a.clientId !== userId && a.talentId !== userId) throw fail.forbidden('NOT_PARTY', 'This receipt belongs to another assignment.');
    const [client, talent] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: a.clientId }, include: { clientProfile: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: a.talentId! } }),
    ]);
    return {
      receiptNo: s.instructionRef,
      kind: s.kind,
      status: s.status,
      issuedAt: s.paidAt ?? s.createdAt,
      assignment: { ref: a.ref, title: a.title },
      milestone: { seq: s.milestone.seq, title: s.milestone.title, amount: s.milestone.amount },
      client: { name: client.clientProfile?.enterpriseName ?? client.verifiedName ?? client.displayName, tin: client.clientProfile?.tin ?? null },
      talent: { name: talent.verifiedName ?? talent.displayName },
      gross: s.gross,
      commissionRate: Number(s.commissionRate),
      commission: s.commission,
      net: s.net,
      refund: s.refundAmount,
      note: 'Client funds are held by the partner bank in escrow. The platform commission is deducted from the talent payout.',
    };
  }
}

export type MilestoneWithAssignment = Milestone & { assignment: Assignment };
