import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { transition } from '../assignments/state';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from './payments.service';

// Inbound events from the developer's escrow module. Each method is idempotent:
// a repeated confirmation changes nothing (FR-ESC-11).
@Injectable()
export class PaymentEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly clock: ClockService,
  ) {}

  // The bank or payment provider confirmed the client's money is in escrow.
  // Only this marks an assignment Funded (FR-ESC-02), and only then is the
  // talent told to start (FR-ASG-02).
  async fundingConfirmed(input: { paymentReference: string; amount: number; providerRef: string; channel: string }) {
    const pi = await this.prisma.paymentInstruction.findUnique({ where: { reference: input.paymentReference }, include: { assignment: true } });
    if (!pi) throw fail.notFound('Payment reference');
    if (pi.status === 'CONFIRMED') return { assignmentId: pi.assignmentId, alreadyConfirmed: true };
    if (input.amount < pi.amount) {
      await this.audit.log({ action: 'FUNDING_SHORT', entityType: 'PaymentInstruction', entityId: pi.id, after: input });
      throw fail.bad('FUNDING_SHORT', 'The amount received is less than the amount due.');
    }
    const now = this.clock.now();
    const a = pi.assignment;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentInstruction.updateMany({ where: { id: pi.id, status: 'PENDING' }, data: { status: 'CONFIRMED', providerRef: input.providerRef, channel: input.channel, confirmedAt: now } });
      if (updated.count !== 1) return;
      const fresh = await tx.assignment.findUniqueOrThrow({ where: { id: a.id } });
      await transition(tx, fresh, 'FUNDED', null, `Payment ${input.paymentReference} confirmed`, { fundedAt: now });
      const first = await tx.milestone.findFirst({ where: { assignmentId: a.id }, orderBy: { seq: 'asc' } });
      if (first) await tx.milestone.update({ where: { id: first.id }, data: { status: 'IN_PROGRESS' } });
      await this.audit.log({ action: 'ASSIGNMENT_FUNDED', entityType: 'Assignment', entityId: a.id, after: { reference: input.paymentReference, amount: input.amount, channel: input.channel, providerRef: input.providerRef } }, tx);
    });
    const first = await this.prisma.milestone.findFirst({ where: { assignmentId: a.id }, orderBy: { seq: 'asc' } });
    await this.notifications.notify(a.talentId!, 'FUNDED_START', { title: a.title, deadline: first?.deadline?.toISOString().slice(0, 10) ?? '' }, { sms: true, link: `/assignments/${a.id}` });
    await this.notifications.notify(a.clientId, 'FUNDED_CLIENT', { title: a.title }, { link: `/assignments/${a.id}` });
    return { assignmentId: a.id, alreadyConfirmed: false };
  }

  payoutCompleted(input: { instructionRef: string; providerRef: string }) {
    return this.payments.payoutCompleted(input.instructionRef, input.providerRef);
  }

  refundCompleted(input: { instructionRef: string; providerRef: string }) {
    return this.payments.payoutCompleted(input.instructionRef, input.providerRef);
  }
}
