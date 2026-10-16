import { Injectable, Logger } from '@nestjs/common';
import { Assignment, Milestone } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { formatEtb, splitCommission } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { transition } from '../assignments/state';
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
  ) {}

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
    const res = await this.escrow.requestCollection({
      idempotencyKey: `collect:${reference}`,
      assignmentRef: assignment.ref,
      paymentReference: reference,
      amount: instruction.amount,
      payer: await this.party(assignment.clientId),
    });
    await this.notifications.notify(
      assignment.clientId,
      'PAYMENT_INSTRUCTION',
      { amount: formatEtb(instruction.amount), title: assignment.title, reference },
      { sms: true, link: `/assignments/${assignment.id}` },
    );
    return { ...instruction, instructionsEn: res?.instructionsEn, instructionsAm: res?.instructionsAm, checkoutUrl: res?.checkoutUrl };
  }

  // Release a milestone to the talent, net of commission (FR-ESC-05, FR-ESC-06).
  async settleMilestone(milestoneId: string, reason: 'ACCEPTED' | 'REVIEW_WINDOW_EXPIRED') {
    const m = await this.prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId }, include: { assignment: true, settlement: true } });
    if (m.settlement) return m.settlement;
    const a = m.assignment;
    const rate = Number(a.commissionRate);
    const { gross, commission, net } = splitCommission(m.amount, rate);
    const instructionRef = await this.sequence.next('settlement', 'TODS');
    const settlement = await this.prisma.settlement.create({
      data: { milestoneId: m.id, gross, commissionRate: a.commissionRate!, commission, net, kind: 'RELEASE', instructionRef, reason },
    });
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
    return settlement;
  }

  // Money returned to the client for a milestone that will not be paid
  // (cancellation after funding by agreement). Goes to the originating account (FR-ESC-10).
  async refundMilestone(milestoneId: string, reason: string) {
    const m = await this.prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId }, include: { assignment: true, settlement: true } });
    if (m.settlement) return m.settlement;
    const a = m.assignment;
    const instructionRef = await this.sequence.next('settlement', 'TODS');
    const settlement = await this.prisma.settlement.create({
      data: { milestoneId: m.id, gross: 0, commissionRate: 0, commission: 0, net: 0, refundAmount: m.amount, kind: 'REFUND', instructionRef, reason },
    });
    await this.escrow.refund({ idempotencyKey: `refund:${m.id}`, assignmentRef: a.ref, milestoneSeq: m.seq, instructionRef, amount: m.amount, payer: await this.party(a.clientId), reason });
    await this.audit.log({ action: 'REFUND_INSTRUCTED', entityType: 'Milestone', entityId: m.id, after: { instructionRef, amount: m.amount, reason } });
    if (this.escrow.provider.completesImmediately) await this.payoutCompleted(instructionRef, 'test-stand-in');
    return settlement;
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
