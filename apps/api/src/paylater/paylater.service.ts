import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PayLaterAgreement, PayLaterInstallment } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { formatEtb } from '../common/money';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { LenderGateway } from '../integrations/lender';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentEventsService } from '../payments/payment-events.service';

// Buy now, pay later (FR-BNP-01 to FR-BNP-13).
//
// A client with an agreed assignment may ask to pay later instead of paying
// into escrow now. ToD checks eligibility and limits, passes the agreed data to
// the lender and records the lender's decision; it never decides credit itself.
// Once the client signs the acknowledgement of debt, the facility pays into
// escrow and the work starts as usual. Each accepted milestone adds an
// instalment due tenorDays later. Repayments go to the lender and are recorded
// here by finance. There is no automatic rollover: a client with a balance
// cannot open another pay-later agreement.

export interface Limits { lenderPerEnterprise: number; lenderPerAssignment: number; lenderPortfolio: number; firstCycle: number; sectorShare: number; stepUp: number }
export interface Risk { defaultDays: number; arrearsDays: number; freezeShare: number; freezeLimitCut: number }

const DAY = 86_400_000;
const OPEN = ['AWAITING_REASSESSMENT', 'SUBMITTED', 'APPROVED', 'ACTIVE', 'DEFAULTED'];
const COMMITTED = ['APPROVED', 'ACTIVE', 'DEFAULTED'];
const STAGES = ['BEFORE', 'DUE', 'LATE_1', 'LATE_8', 'LATE_31'] as const;

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class PayLaterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly params: ParametersService,
    private readonly notifications: NotificationsService,
    private readonly sequence: SequenceService,
    private readonly clock: ClockService,
    private readonly lender: LenderGateway,
    private readonly paymentEvents: PaymentEventsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Balances
  // ---------------------------------------------------------------------------

  daysPastDue(i: Pick<PayLaterInstallment, 'amount' | 'paid' | 'dueOn'>, now = this.clock.now()) {
    if (i.paid >= i.amount) return 0;
    return Math.max(0, Math.floor((startOfDay(now).getTime() - startOfDay(i.dueOn).getTime()) / DAY));
  }

  // Money the facility got back from escrow on refunded milestones.
  private async refunded(assignmentId: string) {
    const s = await this.prisma.settlement.aggregate({ where: { milestone: { assignmentId } }, _sum: { refundAmount: true } });
    return s._sum.refundAmount ?? 0;
  }

  async outstanding(a: Pick<PayLaterAgreement, 'status' | 'amount' | 'disbursed' | 'repaid' | 'assignmentId'>) {
    if (a.status === 'APPROVED') return a.amount; // committed, not yet drawn
    if (!['ACTIVE', 'DEFAULTED'].includes(a.status)) return 0;
    return Math.max(0, a.disbursed - a.repaid - (await this.refunded(a.assignmentId)));
  }

  private async portfolioCommitted(where: object = {}) {
    const rows = await this.prisma.payLaterAgreement.findMany({ where: { status: { in: COMMITTED }, ...where } });
    let total = 0;
    for (const r of rows) total += await this.outstanding(r);
    return total;
  }

  async isFrozen() {
    const last = await this.prisma.payLaterPortfolioEvent.findFirst({ orderBy: { createdAt: 'desc' } });
    return last?.kind === 'FREEZE';
  }

  private async clientLimit(profile: { payLaterLimit: number | null }) {
    const l = await this.params.get<Limits>('PAY_LATER_LIMITS');
    return Math.min(l.lenderPerEnterprise, profile.payLaterLimit ?? l.firstCycle);
  }

  // ---------------------------------------------------------------------------
  // Eligibility (FR-BNP-02, BR-06) and limits (FR-BNP-04)
  // ---------------------------------------------------------------------------

  async eligibility(clientId: string, amount?: number) {
    const reasons: string[] = [];
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: clientId }, include: { clientProfile: true, cohort: true } });
    const p = user.clientProfile;
    const limits = await this.params.get<Limits>('PAY_LATER_LIMITS');
    const tenor = await this.params.get<{ min: number; max: number }>('PAY_LATER_TENOR_DAYS');
    if (!(await this.params.get<boolean>('PAY_LATER_ENABLED'))) reasons.push('PAY_LATER_OFF');
    if (!p?.payLaterEnabled) reasons.push('CLIENT_NOT_ENABLED');
    if (p?.level !== 'VERIFIED_ENTERPRISE' || !p.levelConfirmedAt) reasons.push('NOT_VERIFIED_ENTERPRISE');
    if (user.identityStatus !== 'VERIFIED') reasons.push('IDENTITY_NOT_VERIFIED');
    if (user.status !== 'ACTIVE' || !p?.establishedOn) reasons.push('NOT_ACTIVE_BUSINESS');
    if (!user.cohort || user.cohort.status !== 'APPROVED' || !user.cohort.payLaterEligible) reasons.push('COHORT_NOT_ELIGIBLE');
    if (await this.isFrozen()) reasons.push('PORTFOLIO_FROZEN');

    const mine = await this.prisma.payLaterAgreement.findMany({ where: { clientId }, include: { installments: true } });
    if (mine.some((a) => a.status === 'DEFAULTED')) reasons.push('DEFAULTED');
    if (mine.some((a) => a.installments.some((i) => this.daysPastDue(i) > 0))) reasons.push('ARREARS');
    // No rollover (FR-BNP-09): a balance must be repaid before the next agreement.
    if (mine.some((a) => OPEN.includes(a.status))) reasons.push('BALANCE_OPEN');

    const limit = p ? await this.clientLimit(p) : 0;
    if (amount !== undefined) {
      if (amount > limits.lenderPerAssignment) reasons.push('ASSIGNMENT_LIMIT');
      if (amount > limit) reasons.push('ENTERPRISE_LIMIT');
      const portfolio = await this.portfolioCommitted();
      if (portfolio + amount > limits.lenderPortfolio) reasons.push('PORTFOLIO_LIMIT');
      if (user.cohort?.payLaterCap != null) {
        const cohort = await this.portfolioCommitted({ clientId: { in: (await this.prisma.user.findMany({ where: { cohortId: user.cohortId }, select: { id: true } })).map((u) => u.id) } });
        if (cohort + amount > user.cohort.payLaterCap) reasons.push('COHORT_CAP');
      }
      if (p?.sector) {
        const peers = await this.prisma.clientProfile.findMany({ where: { sector: p.sector }, select: { userId: true } });
        const sector = await this.portfolioCommitted({ clientId: { in: peers.map((x) => x.userId) } });
        if (sector + amount > limits.lenderPortfolio * limits.sectorShare) reasons.push('SECTOR_CAP');
      }
    }
    const cycle = mine.filter((a) => a.status === 'REPAID').length + 1;
    return { eligible: reasons.length === 0, reasons, limit, cycle, needsReassessment: cycle > 1, tenor };
  }

  // What the client sees on an agreed assignment's payment panel.
  async offer(me: SessionUser, assignmentId: string) {
    const a = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!a || a.clientId !== me.id) throw fail.notFound('Assignment');
    const agreement = await this.prisma.payLaterAgreement.findFirst({ where: { assignmentId, status: { notIn: ['CANCELLED'] } }, orderBy: { createdAt: 'desc' } });
    if (!(await this.params.get<boolean>('PAY_LATER_ENABLED'))) return { available: false, agreement };
    const profile = await this.prisma.clientProfile.findUnique({ where: { userId: me.id } });
    if (!profile?.payLaterEnabled) return { available: false, agreement };
    const e = await this.eligibility(me.id, a.agreedPrice ?? undefined);
    return { available: true, amount: a.agreedPrice, ...e, agreement };
  }

  // ---------------------------------------------------------------------------
  // Applying, the lender's decision and the acknowledgement of debt
  // ---------------------------------------------------------------------------

  async apply(me: SessionUser, dto: { assignmentId: string; tenorDays: number; purpose: string }) {
    const a = await this.prisma.assignment.findUnique({ where: { id: dto.assignmentId }, include: { payments: true } });
    if (!a || a.clientId !== me.id) throw fail.notFound('Assignment');
    if (a.status !== 'AGREED' || !a.payments.some((p) => p.status === 'PENDING')) throw fail.conflict('INVALID_STATE', 'Pay-later can only fund an agreed assignment that is waiting for payment.');
    const e = await this.eligibility(me.id, a.agreedPrice!);
    if (!e.eligible) throw fail.forbidden('PAY_LATER_NOT_ELIGIBLE', `Pay-later is not available for this assignment (${e.reasons.join(', ')}).`);
    if (dto.tenorDays < e.tenor.min || dto.tenorDays > e.tenor.max) throw fail.bad('TENOR', `Choose ${e.tenor.min} to ${e.tenor.max} days to repay.`);
    const ref = await this.sequence.next('paylater', 'TODL');
    const ag = await this.prisma.payLaterAgreement.create({
      data: {
        ref, clientId: me.id, assignmentId: a.id, amount: a.agreedPrice!, tenorDays: dto.tenorDays, purpose: dto.purpose.trim(), cycle: e.cycle,
        status: e.needsReassessment ? 'AWAITING_REASSESSMENT' : 'SUBMITTED', application: {}, lender: this.lender.connector.name,
      },
    });
    await this.audit.log({ actorId: me.id, action: 'PAY_LATER_APPLIED', entityType: 'PayLaterAgreement', entityId: ag.id, after: { ref, assignment: a.ref, amount: ag.amount, tenorDays: ag.tenorDays, cycle: ag.cycle } });
    if (e.needsReassessment) {
      // FR-BNP-13: repeat use needs an affordability reassessment first.
      await this.notifications.notifyRole(['FINANCE_OFFICER'], `${ref}: affordability reassessment needed`, `Repeat pay-later request of ${formatEtb(ag.amount)} for ${a.ref}.`, `/console/pay-later/${ag.id}`);
      return this.get(me, ag.id);
    }
    await this.submit(ag.id);
    return this.get(me, ag.id);
  }

  // FR-BNP-03: the agreed application data goes to the lender.
  private async submit(agreementId: string) {
    const ag = await this.prisma.payLaterAgreement.findUniqueOrThrow({ where: { id: agreementId }, include: { assignment: true } });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ag.clientId }, include: { clientProfile: true } });
    const p = user.clientProfile!;
    const limits = await this.params.get<Limits>('PAY_LATER_LIMITS');
    const done = await this.prisma.assignment.findMany({ where: { clientId: ag.clientId, status: 'CLOSED' }, select: { agreedPrice: true } });
    const disputes = await this.prisma.dispute.count({ where: { assignment: { clientId: ag.clientId } } });
    const previous = await this.prisma.payLaterAgreement.findMany({ where: { clientId: ag.clientId, status: 'REPAID' }, include: { installments: true } });
    const late = previous.flatMap((x) => x.installments).filter((i) => i.paidAt && i.paidAt > i.dueOn).length;
    const now = this.clock.now();
    const application = {
      idempotencyKey: `apply:${ag.ref}`,
      agreementRef: ag.ref,
      amount: ag.amount,
      tenorDays: ag.tenorDays,
      purpose: ag.purpose,
      cycle: ag.cycle,
      enterprise: {
        name: p.enterpriseName, tin: p.tin, tradeLicenceNo: p.tradeLicenceNo,
        beneficialOwner: p.beneficialOwner, beneficialOwnerVerified: user.identityStatus === 'VERIFIED',
        establishedOn: p.establishedOn ? ymd(p.establishedOn) : null,
        monthsInOperation: p.establishedOn ? Math.floor((now.getTime() - p.establishedOn.getTime()) / (30.44 * DAY)) : null,
        sector: p.sector, subCity: p.subCity, staffSize: p.staffSize, bankReference: user.identityMasked,
      },
      history: { completedAssignments: done.length, valueCompleted: done.reduce((s, x) => s + (x.agreedPrice ?? 0), 0), disputes, previousCycles: previous.length, latePayments: late },
      limits: { enterprise: await this.clientLimit(p), assignment: limits.lenderPerAssignment },
    };
    await this.prisma.payLaterAgreement.update({ where: { id: ag.id }, data: { application: application as any, status: 'SUBMITTED' } });
    const res = await this.lender.submit(application);
    await this.prisma.payLaterAgreement.update({ where: { id: ag.id }, data: { lenderRef: res.lenderRef } });
    await this.audit.log({ action: 'PAY_LATER_SUBMITTED', entityType: 'PayLaterAgreement', entityId: ag.id, after: { ref: ag.ref, lender: ag.lender, lenderRef: res.lenderRef } });
    if (res.decision) await this.lenderDecision({ lenderRef: res.lenderRef, decision: res.decision, reason: res.reason });
  }

  // The lender's decision, recorded as given (FR-BNP-03). Idempotent. A
  // lender adapter that decides later calls this directly.
  async lenderDecision(input: { lenderRef: string; decision: 'APPROVED' | 'DECLINED'; reason?: string }) {
    const ag = await this.prisma.payLaterAgreement.findFirst({ where: { lenderRef: input.lenderRef }, include: { assignment: { include: { payments: true } } } });
    if (!ag) throw fail.notFound('Pay-later agreement');
    if (ag.status !== 'SUBMITTED') return ag;
    const now = this.clock.now();
    const updated = await this.prisma.payLaterAgreement.updateMany({ where: { id: ag.id, status: 'SUBMITTED' }, data: { status: input.decision, lenderReason: input.reason ?? null, decidedAt: now } });
    if (updated.count !== 1) return ag;
    await this.audit.log({ action: `PAY_LATER_${input.decision}`, entityType: 'PayLaterAgreement', entityId: ag.id, after: { ref: ag.ref, lenderRef: input.lenderRef, reason: input.reason } });
    const vars = { title: ag.assignment.title, amount: formatEtb(ag.amount), days: ag.tenorDays, reference: ag.assignment.payments.find((p) => p.status === 'PENDING')?.reference ?? '' };
    await this.notifications.notify(ag.clientId, input.decision === 'APPROVED' ? 'PAY_LATER_APPROVED' : 'PAY_LATER_DECLINED', vars, { sms: true, link: `/assignments/${ag.assignmentId}` });
    return this.prisma.payLaterAgreement.findUniqueOrThrow({ where: { id: ag.id } });
  }

  // FR-BNP-13: finance records the affordability reassessment before repeat use.
  async reassess(me: SessionUser, id: string, dto: { affordable: boolean; note: string }) {
    const ag = await this.prisma.payLaterAgreement.findUnique({ where: { id } });
    if (!ag) throw fail.notFound('Pay-later agreement');
    if (ag.status !== 'AWAITING_REASSESSMENT') throw fail.conflict('INVALID_STATE', 'This request is not waiting for a reassessment.');
    const reassessment = { affordable: dto.affordable, note: dto.note, byId: me.id, at: this.clock.now().toISOString() };
    await this.prisma.payLaterAgreement.update({ where: { id }, data: { reassessment, ...(dto.affordable ? {} : { status: 'DECLINED', lenderReason: 'Affordability reassessment not passed', decidedAt: this.clock.now() }) } });
    await this.audit.log({ actorId: me.id, action: 'PAY_LATER_REASSESSED', entityType: 'PayLaterAgreement', entityId: id, after: reassessment });
    if (dto.affordable) await this.submit(id);
    else {
      const a = await this.prisma.assignment.findUniqueOrThrow({ where: { id: ag.assignmentId }, include: { payments: true } });
      await this.notifications.notify(ag.clientId, 'PAY_LATER_DECLINED', { title: a.title, reference: a.payments.find((p) => p.status === 'PENDING')?.reference ?? '' }, { sms: true, link: `/assignments/${a.id}` });
    }
    return this.get(me, id);
  }

  acknowledgementText(ag: { ref: string; amount: number; tenorDays: number }, enterprise: string, language: string) {
    return language === 'am'
      ? `እኔ፣ ${enterprise}ን ወክዬ፣ አበዳሪው ለዚህ ሥራ እስከ ${formatEtb(ag.amount)} ወደ ኤስክሮ እንደሚከፍል እና ይህ ዕዳ መሆኑን አረጋግጣለሁ። እያንዳንዱን ደረጃ ከተቀበልኩ በ${ag.tenorDays} ቀናት ውስጥ የተቀበልኩትን ሥራ ዋጋ ለአበዳሪው ለመክፈል እስማማለሁ። ክፍያ ከዘገየ አዲስ ሥራ መለጠፍ እንደማልችል፣ ከ60 ቀናት በላይ ከዘገየም አበዳሪው ሕጋዊ እርምጃ ሊወስድ እንደሚችል ተረድቻለሁ። ዕዳው በሌላ የበኋላ ክፍያ ሊተካ አይችልም። መለያ ቁጥር ${ag.ref}።`
      : `I, on behalf of ${enterprise}, acknowledge that the lender will pay up to ${formatEtb(ag.amount)} into escrow for this assignment and that this is a debt. I agree to repay the lender the value of each stage I accept within ${ag.tenorDays} days of accepting it. I understand that while a repayment is late I cannot post new assignments, that after more than 60 days the lender may take legal action, and that this debt cannot be paid with another pay-later agreement. Reference ${ag.ref}.`;
  }

  // FR-BNP-06: the client signs the acknowledgement of debt with their
  // password or PIN; only then does the facility fund escrow.
  async acknowledge(me: SessionUser, id: string, password: string, ip: string) {
    const ag = await this.prisma.payLaterAgreement.findUnique({ where: { id }, include: { assignment: { include: { payments: true } } } });
    if (!ag || ag.clientId !== me.id) throw fail.notFound('Pay-later agreement');
    if (ag.status !== 'APPROVED') throw fail.conflict('INVALID_STATE', 'Only an approved pay-later agreement can be signed.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id }, include: { clientProfile: true } });
    if (!(await bcrypt.compare(password, user.passwordHash))) throw fail.bad('SIGN_OFF_PASSWORD', 'Your password or PIN is not right.');
    const pi = ag.assignment.payments.find((p) => p.status === 'PENDING');
    if (!pi) {
      await this.prisma.payLaterAgreement.update({ where: { id }, data: { status: 'CANCELLED', closedAt: this.clock.now() } });
      throw fail.conflict('ALREADY_PAID', 'This assignment has already been paid.');
    }
    const text = this.acknowledgementText(ag, user.clientProfile?.enterpriseName ?? user.verifiedName ?? user.displayName, user.language);
    const now = this.clock.now();
    await this.prisma.payLaterAgreement.update({ where: { id }, data: { acknowledgedAt: now, acknowledgementText: text, acknowledgementIp: ip } });
    await this.audit.log({ actorId: me.id, action: 'PAY_LATER_ACKNOWLEDGED', entityType: 'PayLaterAgreement', entityId: id, after: { ref: ag.ref, amount: ag.amount, at: now, ip } });
    const { drawdownRef } = await this.lender.drawdown({ idempotencyKey: `drawdown:${ag.ref}`, lenderRef: ag.lenderRef!, agreementRef: ag.ref, amount: ag.amount, paymentReference: pi.reference });
    await this.prisma.payLaterAgreement.update({ where: { id }, data: { status: 'ACTIVE', drawdownRef, disbursed: ag.amount } });
    await this.paymentEvents.fundingConfirmed({ paymentReference: pi.reference, amount: ag.amount, providerRef: drawdownRef, channel: 'PAY_LATER_FACILITY' });
    return this.get(me, id);
  }

  // ---------------------------------------------------------------------------
  // Repayment schedule (FR-BNP-05) and repayments (FR-BNP-08)
  // ---------------------------------------------------------------------------

  // Called once a milestone of a pay-later assignment is settled to the
  // talent: the client owes what was released, tenorDays from now.
  async onMilestoneSettled(milestoneId: string) {
    const m = await this.prisma.milestone.findUnique({ where: { id: milestoneId }, include: { settlement: true } });
    if (!m?.settlement || m.settlement.gross <= 0) return null;
    const ag = await this.prisma.payLaterAgreement.findFirst({ where: { assignmentId: m.assignmentId, status: { in: ['ACTIVE', 'DEFAULTED'] } }, include: { assignment: true } });
    if (!ag) return null;
    const existing = await this.prisma.payLaterInstallment.findUnique({ where: { milestoneId } });
    if (existing) return existing;
    const dueOn = startOfDay(new Date(this.clock.now().getTime() + ag.tenorDays * DAY));
    const inst = await this.prisma.payLaterInstallment.create({ data: { agreementId: ag.id, milestoneId, amount: m.settlement.gross, dueOn } });
    await this.audit.log({ action: 'PAY_LATER_SCHEDULED', entityType: 'PayLaterAgreement', entityId: ag.id, after: { milestoneSeq: m.seq, amount: inst.amount, dueOn: ymd(dueOn) } });
    await this.notifications.notify(ag.clientId, 'PAY_LATER_SCHEDULE', { title: ag.assignment.title, amount: formatEtb(inst.amount), due: ymd(dueOn), ref: ag.ref }, { sms: true, link: `/pay-later/${ag.id}` });
    return inst;
  }

  // Finance records a repayment the lender received; it is applied to the
  // oldest instalment first, so partial payments are tracked.
  async recordRepayment(me: SessionUser, id: string, dto: { amount: number; reference: string; paidOn?: string; note?: string }) {
    const ag = await this.prisma.payLaterAgreement.findUnique({ where: { id }, include: { installments: { orderBy: { dueOn: 'asc' } } } });
    if (!ag) throw fail.notFound('Pay-later agreement');
    if (!['ACTIVE', 'DEFAULTED'].includes(ag.status)) throw fail.conflict('INVALID_STATE', 'This agreement has no balance to repay.');
    const balance = await this.outstanding(ag);
    if (dto.amount <= 0 || dto.amount > balance) throw fail.bad('REPAYMENT_AMOUNT', `The repayment must be between 1 santim and the balance of ${formatEtb(balance)}.`);
    if (await this.prisma.payLaterRepayment.findUnique({ where: { reference: dto.reference } })) throw fail.conflict('DUPLICATE_REFERENCE', 'A repayment with this reference is already recorded.');
    const paidOn = dto.paidOn ? new Date(dto.paidOn) : this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.payLaterRepayment.create({ data: { agreementId: id, amount: dto.amount, reference: dto.reference, paidOn, note: dto.note, recordedById: me.id } });
      let left = dto.amount;
      for (const i of ag.installments) {
        if (left <= 0) break;
        const take = Math.min(left, i.amount - i.paid);
        if (take <= 0) continue;
        left -= take;
        await tx.payLaterInstallment.update({ where: { id: i.id }, data: { paid: i.paid + take, paidAt: i.paid + take >= i.amount ? paidOn : null } });
      }
      await tx.payLaterAgreement.update({ where: { id }, data: { repaid: ag.repaid + dto.amount } });
      await this.audit.log({ actorId: me.id, action: 'PAY_LATER_REPAYMENT', entityType: 'PayLaterAgreement', entityId: id, after: { amount: dto.amount, reference: dto.reference, paidOn: ymd(paidOn) } }, tx);
    });
    await this.lender.reportRepayment({ idempotencyKey: `repay:${dto.reference}`, lenderRef: ag.lenderRef!, agreementRef: ag.ref, amount: dto.amount, reference: dto.reference, paidOn: ymd(paidOn) });
    const fresh = await this.prisma.payLaterAgreement.findUniqueOrThrow({ where: { id } });
    const left = await this.outstanding(fresh);
    await this.notifications.notify(ag.clientId, 'PAY_LATER_REPAYMENT', { amount: formatEtb(dto.amount), ref: ag.ref, balance: formatEtb(left) }, { sms: true, link: `/pay-later/${id}` });
    await this.closeIfRepaid(id);
    return this.get(me, id);
  }

  // Fully repaid once nothing is owed and no stage of the work is still open.
  // A clean repayment steps the client's limit up (FR-BNP-04).
  private async closeIfRepaid(id: string) {
    const ag = await this.prisma.payLaterAgreement.findUniqueOrThrow({ where: { id } });
    if (ag.status !== 'ACTIVE' && ag.status !== 'DEFAULTED') return;
    if ((await this.outstanding(ag)) > 0) return;
    const open = await this.prisma.milestone.count({ where: { assignmentId: ag.assignmentId, settlement: null, status: { notIn: ['CANCELLED', 'REFUNDED'] } } });
    if (open) return;
    const wasDefaulted = ag.status === 'DEFAULTED';
    await this.prisma.payLaterAgreement.update({ where: { id }, data: { status: 'REPAID', closedAt: this.clock.now() } });
    const limits = await this.params.get<Limits>('PAY_LATER_LIMITS');
    const profile = await this.prisma.clientProfile.findUniqueOrThrow({ where: { userId: ag.clientId } });
    const before = await this.clientLimit(profile);
    const after = wasDefaulted ? before : Math.min(limits.lenderPerEnterprise, Math.round(before * limits.stepUp));
    if (after !== before) await this.prisma.clientProfile.update({ where: { userId: ag.clientId }, data: { payLaterLimit: after } });
    await this.audit.log({ action: 'PAY_LATER_REPAID', entityType: 'PayLaterAgreement', entityId: id, after: { ref: ag.ref, limitBefore: before, limitAfter: after } });
  }

  // ---------------------------------------------------------------------------
  // Exceptions and negotiated repayments (FR-BNP-13); no rollover (FR-BNP-09)
  // ---------------------------------------------------------------------------

  async requestException(me: SessionUser, id: string, dto: { kind: 'RESCHEDULE' | 'OTHER'; installmentId?: string; newDueOn?: string; reason: string }) {
    const ag = await this.prisma.payLaterAgreement.findUnique({ where: { id }, include: { installments: true } });
    if (!ag) throw fail.notFound('Pay-later agreement');
    if (dto.kind === 'RESCHEDULE') {
      const i = ag.installments.find((x) => x.id === dto.installmentId);
      if (!i || !dto.newDueOn) throw fail.bad('RESCHEDULE_DETAIL', 'Choose the instalment and its new due date.');
      if (i.paid >= i.amount) throw fail.bad('ALREADY_PAID', 'This instalment is already paid.');
      const tenor = await this.params.get<{ min: number; max: number }>('PAY_LATER_TENOR_DAYS');
      const latest = new Date(i.createdAt.getTime() + tenor.max * 2 * DAY);
      if (new Date(dto.newDueOn) > latest) throw fail.bad('RESCHEDULE_TOO_LONG', `A negotiated repayment can move the due date to ${ymd(latest)} at the latest.`);
    }
    const x = await this.prisma.payLaterException.create({ data: { agreementId: id, kind: dto.kind, installmentId: dto.installmentId, newDueOn: dto.newDueOn ? startOfDay(new Date(dto.newDueOn)) : null, reason: dto.reason, requestedById: me.id } });
    await this.audit.log({ actorId: me.id, action: 'PAY_LATER_EXCEPTION_REQUESTED', entityType: 'PayLaterAgreement', entityId: id, after: { exceptionId: x.id, kind: dto.kind, newDueOn: dto.newDueOn, reason: dto.reason } });
    await this.notifications.notifyRole(['FINANCE_OFFICER', 'SUPER_ADMIN'], `${ag.ref}: pay-later exception to approve`, dto.reason, `/console/pay-later/${id}`);
    return x;
  }

  async decideException(me: SessionUser, exceptionId: string, approve: boolean, note?: string) {
    const x = await this.prisma.payLaterException.findUnique({ where: { id: exceptionId } });
    if (!x) throw fail.notFound('Exception');
    if (x.status !== 'PENDING') throw fail.conflict('ALREADY_DECIDED', 'This exception has already been decided.');
    if (x.requestedById === me.id) throw fail.forbidden('SAME_PERSON', 'A different person must approve an exception.');
    await this.prisma.$transaction(async (tx) => {
      await tx.payLaterException.update({ where: { id: x.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: me.id, decidedAt: this.clock.now(), note } });
      if (approve && x.kind === 'RESCHEDULE' && x.installmentId && x.newDueOn) {
        await tx.payLaterInstallment.update({ where: { id: x.installmentId }, data: { dueOn: x.newDueOn, remindersSent: [] } });
      }
      await this.audit.log({ actorId: me.id, action: approve ? 'PAY_LATER_EXCEPTION_APPROVED' : 'PAY_LATER_EXCEPTION_REJECTED', entityType: 'PayLaterAgreement', entityId: x.agreementId, after: { exceptionId: x.id, kind: x.kind, newDueOn: x.newDueOn, reason: x.reason, requestedById: x.requestedById, note } }, tx);
    });
    return this.prisma.payLaterException.findUniqueOrThrow({ where: { id: x.id } });
  }

  // ---------------------------------------------------------------------------
  // Daily rules: reminders, arrears, default and the portfolio freeze
  // (FR-BNP-07, FR-BNP-08, FR-BNP-11)
  // ---------------------------------------------------------------------------

  private stageFor(days: number, daysBefore: number, before: number): (typeof STAGES)[number] | null {
    if (days >= 31) return 'LATE_31';
    if (days >= 8) return 'LATE_8';
    if (days >= 1) return 'LATE_1';
    if (before === 0) return 'DUE';
    if (before > 0 && before <= daysBefore) return 'BEFORE';
    return null;
  }

  async processDaily() {
    const now = this.clock.now();
    const today = startOfDay(now).getTime();
    const risk = await this.params.get<Risk>('PAY_LATER_RISK');
    const daysBefore = await this.params.get<number>('PAY_LATER_REMINDER_DAYS_BEFORE');
    const open = await this.prisma.payLaterInstallment.findMany({ where: { agreement: { status: { in: ['ACTIVE', 'DEFAULTED'] } } }, include: { agreement: true } });
    let reminders = 0, defaulted = 0;
    for (const i of open) {
      const remaining = i.amount - i.paid;
      if (remaining <= 0) continue;
      const late = this.daysPastDue(i, now);
      const before = Math.round((startOfDay(i.dueOn).getTime() - today) / DAY);
      const stage = this.stageFor(late, daysBefore, before);
      if (stage && !i.remindersSent.includes(stage)) {
        const vars = { amount: formatEtb(remaining), ref: i.agreement.ref, due: ymd(i.dueOn), days: late };
        const type = stage === 'BEFORE' ? 'PAY_LATER_REMINDER' : stage === 'DUE' ? 'PAY_LATER_DUE_TODAY' : 'PAY_LATER_OVERDUE';
        await this.notifications.notify(i.agreement.clientId, type, vars, { sms: true, link: `/pay-later/${i.agreementId}` });
        // Earlier stages that were skipped (for example after downtime) count as sent.
        const sent = STAGES.slice(0, STAGES.indexOf(stage) + 1);
        await this.prisma.payLaterInstallment.update({ where: { id: i.id }, data: { remindersSent: [...new Set([...i.remindersSent, ...sent])] } });
        await this.audit.log({ action: 'PAY_LATER_REMINDER', entityType: 'PayLaterAgreement', entityId: i.agreementId, after: { installmentId: i.id, stage, remaining, dueOn: ymd(i.dueOn) } });
        if (stage === 'LATE_31') await this.notifications.notifyRole(['FINANCE_OFFICER'], `${i.agreement.ref}: more than 30 days late`, `${formatEtb(remaining)} due ${ymd(i.dueOn)}.`, `/console/pay-later/${i.agreementId}`);
        reminders++;
      }
      if (late > risk.defaultDays && i.agreement.status === 'ACTIVE') {
        const res = await this.prisma.payLaterAgreement.updateMany({ where: { id: i.agreementId, status: 'ACTIVE' }, data: { status: 'DEFAULTED', defaultedAt: now } });
        if (res.count) {
          defaulted++;
          await this.audit.log({ action: 'PAY_LATER_DEFAULTED', entityType: 'PayLaterAgreement', entityId: i.agreementId, after: { ref: i.agreement.ref, daysPastDue: late } });
          await this.notifications.notifyRole(['FINANCE_OFFICER'], `${i.agreement.ref}: in default`, `More than ${risk.defaultDays} days past due. The evidence pack is ready for the lender.`, `/console/pay-later/${i.agreementId}`);
        }
      }
    }
    const freeze = await this.checkFreeze();
    return { reminders, defaulted, ...freeze };
  }

  // FR-BNP-11: arrears over 30 days above 5% of the outstanding balance
  // freeze new approvals, cut client limits and alert the finance lead.
  async checkFreeze() {
    const risk = await this.params.get<Risk>('PAY_LATER_RISK');
    const p = await this.portfolio();
    if (p.outstanding === 0 || p.arrearsShare <= risk.freezeShare || (await this.isFrozen())) return { frozen: await this.isFrozen(), arrearsShare: p.arrearsShare };
    const profiles = await this.prisma.clientProfile.findMany({ where: { payLaterEnabled: true } });
    const cuts: { userId: string; before: number; after: number }[] = [];
    for (const c of profiles) {
      const before = await this.clientLimit(c);
      const after = Math.round(before * risk.freezeLimitCut);
      await this.prisma.clientProfile.update({ where: { id: c.id }, data: { payLaterLimit: after } });
      cuts.push({ userId: c.userId, before, after });
    }
    const ev = await this.prisma.payLaterPortfolioEvent.create({ data: { kind: 'FREEZE', arrearsShare: p.arrearsShare, detail: { outstanding: p.outstanding, arrears: p.arrears, threshold: risk.freezeShare, limitCuts: cuts } } });
    await this.audit.log({ action: 'PAY_LATER_FROZEN', entityType: 'PayLaterPortfolioEvent', entityId: ev.id, after: { arrearsShare: p.arrearsShare, limitCuts: cuts.length } });
    await this.notifications.notifyRole(['FINANCE_OFFICER', 'SUPER_ADMIN'], 'Pay-later frozen', `Arrears over ${risk.arrearsDays} days are ${(p.arrearsShare * 100).toFixed(1)}% of the outstanding balance. New approvals are frozen, limits are cut, and the event is flagged for the weekly snapshot to SNV.`, '/console/pay-later');
    return { frozen: true, arrearsShare: p.arrearsShare };
  }

  async unfreeze(me: SessionUser, reason: string) {
    if (!(await this.isFrozen())) throw fail.conflict('NOT_FROZEN', 'Pay-later is not frozen.');
    const p = await this.portfolio();
    const ev = await this.prisma.payLaterPortfolioEvent.create({ data: { kind: 'UNFREEZE', arrearsShare: p.arrearsShare, detail: { reason }, actorId: me.id } });
    await this.audit.log({ actorId: me.id, action: 'PAY_LATER_UNFROZEN', entityType: 'PayLaterPortfolioEvent', entityId: ev.id, after: { reason, arrearsShare: p.arrearsShare } });
    return ev;
  }

  // FR-BNP-01: per-client switch.
  async setClientEnabled(me: SessionUser, userId: string, enabled: boolean) {
    const profile = await this.prisma.clientProfile.findUnique({ where: { userId } });
    if (!profile) throw fail.notFound('Client');
    await this.prisma.clientProfile.update({ where: { userId }, data: { payLaterEnabled: enabled } });
    await this.audit.log({ actorId: me.id, action: 'PAY_LATER_CLIENT_SWITCH', entityType: 'ClientProfile', entityId: profile.id, before: { enabled: profile.payLaterEnabled }, after: { enabled } });
    return { userId, enabled, limit: await this.clientLimit(profile) };
  }

  // ---------------------------------------------------------------------------
  // Reading: agreements, the portfolio view and the evidence pack
  // ---------------------------------------------------------------------------

  async get(me: SessionUser, id: string) {
    const ag = await this.prisma.payLaterAgreement.findUnique({
      where: { id },
      include: { assignment: { select: { id: true, ref: true, title: true, status: true, agreedPrice: true } }, installments: { orderBy: { dueOn: 'asc' } }, repayments: { orderBy: { paidOn: 'asc' } }, exceptions: { orderBy: { requestedAt: 'asc' } } },
    });
    if (!ag) throw fail.notFound('Pay-later agreement');
    const staff = me.roles.some((r) => ['FINANCE_OFFICER', 'SUPER_ADMIN', 'PLATFORM_ADMIN', 'AUDITOR', 'LENDER_VIEWER', 'SUPPORT_AGENT'].includes(r)) && me.mfa;
    if (!staff && ag.clientId !== me.id) throw fail.notFound('Pay-later agreement');
    const client = await this.prisma.user.findUniqueOrThrow({ where: { id: ag.clientId }, include: { clientProfile: true } });
    const now = this.clock.now();
    return {
      ...ag,
      application: staff ? ag.application : undefined,
      client: { id: client.id, name: client.verifiedName ?? client.displayName, enterprise: client.clientProfile?.enterpriseName, sector: client.clientProfile?.sector, phone: staff ? client.phone : undefined },
      outstanding: await this.outstanding(ag),
      installments: ag.installments.map((i) => ({ ...i, remaining: i.amount - i.paid, daysPastDue: this.daysPastDue(i, now) })),
      acknowledgementPreview: ag.status === 'APPROVED' ? this.acknowledgementText(ag, client.clientProfile?.enterpriseName ?? client.displayName, me.id === client.id ? me.language : 'en') : undefined,
    };
  }

  async mine(me: SessionUser) {
    const rows = await this.prisma.payLaterAgreement.findMany({ where: { clientId: me.id }, orderBy: { createdAt: 'desc' }, include: { assignment: { select: { ref: true, title: true } }, installments: true } });
    const profile = await this.prisma.clientProfile.findUnique({ where: { userId: me.id } });
    const out = [];
    for (const r of rows) out.push({ ...r, application: undefined, outstanding: await this.outstanding(r), nextDue: r.installments.filter((i) => i.paid < i.amount).sort((a, b) => +a.dueOn - +b.dueOn)[0] ?? null });
    return { enabled: !!profile?.payLaterEnabled && (await this.params.get<boolean>('PAY_LATER_ENABLED')), limit: profile ? await this.clientLimit(profile) : 0, agreements: out };
  }

  async list(status?: string) {
    const rows = await this.prisma.payLaterAgreement.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, include: { assignment: { select: { ref: true, title: true } }, installments: true, exceptions: { where: { status: 'PENDING' } } } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.clientId) } }, include: { clientProfile: true } });
    const now = this.clock.now();
    const out = [];
    for (const r of rows) {
      const u = users.find((x) => x.id === r.clientId);
      out.push({
        id: r.id, ref: r.ref, status: r.status, amount: r.amount, tenorDays: r.tenorDays, cycle: r.cycle, createdAt: r.createdAt, assignment: r.assignment,
        client: { id: r.clientId, enterprise: u?.clientProfile?.enterpriseName ?? u?.displayName, sector: u?.clientProfile?.sector },
        outstanding: await this.outstanding(r),
        maxDaysPastDue: Math.max(0, ...r.installments.map((i) => this.daysPastDue(i, now))),
        pendingExceptions: r.exceptions.length,
      });
    }
    return out;
  }

  async clients() {
    const rows = await this.prisma.clientProfile.findMany({ where: { level: 'VERIFIED_ENTERPRISE' }, include: { user: { include: { cohort: true } } }, orderBy: { enterpriseName: 'asc' } });
    const out = [];
    for (const c of rows) out.push({ userId: c.userId, enterprise: c.enterpriseName, sector: c.sector, enabled: c.payLaterEnabled, limit: await this.clientLimit(c), cohort: c.user.cohort ? { name: c.user.cohort.name, approved: c.user.cohort.status === 'APPROVED', payLaterEligible: c.user.cohort.payLaterEligible } : null });
    return out;
  }

  // FR-BNP-08, FR-BNP-12: the weekly portfolio view.
  async portfolio() {
    const now = this.clock.now();
    const risk = await this.params.get<Risk>('PAY_LATER_RISK');
    const limits = await this.params.get<Limits>('PAY_LATER_LIMITS');
    const rows = await this.prisma.payLaterAgreement.findMany({ where: { status: { in: ['ACTIVE', 'DEFAULTED', 'REPAID'] } }, include: { installments: true } });
    const profiles = await this.prisma.clientProfile.findMany({ where: { userId: { in: rows.map((r) => r.clientId) } } });
    const ageing = { current: 0, d1to7: 0, d8to30: 0, d31to60: 0, over60: 0 };
    const ageingCount = { current: 0, d1to7: 0, d8to30: 0, d31to60: 0, over60: 0 };
    let disbursed = 0, repaid = 0, outstanding = 0, arrears = 0, overDefault = 0, maturedCount = 0, maturedValue = 0;
    const bySector = new Map<string, number>(), byClient = new Map<string, number>();
    for (const r of rows) {
      disbursed += r.disbursed;
      repaid += r.repaid;
      const o = await this.outstanding(r);
      outstanding += o;
      const sector = profiles.find((p) => p.userId === r.clientId)?.sector ?? 'Unknown';
      if (o > 0) {
        bySector.set(sector, (bySector.get(sector) ?? 0) + o);
        byClient.set(r.clientId, (byClient.get(r.clientId) ?? 0) + o);
      }
      const scheduled = r.installments.reduce((s, i) => s + (i.amount - i.paid), 0);
      // Value drawn but not yet due (stages still in progress) counts as current.
      ageing.current += Math.max(0, o - scheduled);
      for (const i of r.installments) {
        const rem = i.amount - i.paid;
        if (rem <= 0) continue;
        const d = this.daysPastDue(i, now);
        const k = d === 0 ? 'current' : d <= 7 ? 'd1to7' : d <= 30 ? 'd8to30' : d <= 60 ? 'd31to60' : 'over60';
        ageing[k] += rem;
        ageingCount[k]++;
        if (d > risk.arrearsDays) arrears += rem;
        if (d > risk.defaultDays) overDefault += rem;
      }
      const lastDue = r.installments.length ? Math.max(...r.installments.map((i) => +i.dueOn)) : null;
      // Matured: the last instalment has fallen due, or the agreement is closed.
      if (r.status === 'REPAID' || (lastDue !== null && lastDue <= now.getTime())) {
        maturedCount++;
        maturedValue += r.disbursed;
      }
    }
    const share = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10000) / 10000 : 0);
    const borrowers = new Set(rows.map((r) => r.clientId));
    const repeatBorrowers = new Set(rows.filter((r) => r.cycle > 1).map((r) => r.clientId));
    const events = await this.prisma.payLaterPortfolioEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
    const pending = await this.prisma.payLaterAgreement.groupBy({ by: ['status'], where: { status: { in: ['AWAITING_REASSESSMENT', 'SUBMITTED', 'APPROVED'] } }, _count: true, _sum: { amount: true } });
    return {
      asOf: now.toISOString(),
      enabled: await this.params.get<boolean>('PAY_LATER_ENABLED'),
      frozen: await this.isFrozen(),
      lender: this.lender.connector.name,
      limits,
      agreements: rows.length,
      borrowers: borrowers.size,
      disbursed, repaid, outstanding,
      portfolioHeadroom: Math.max(0, limits.lenderPortfolio - outstanding),
      defaultRate: share(overDefault, disbursed),
      arrears,
      arrearsShare: share(arrears, outstanding),
      ageing, ageingCount,
      matured: { count: maturedCount, value: maturedValue },
      repeatUse: { borrowers: repeatBorrowers.size, agreements: rows.filter((r) => r.cycle > 1).length },
      concentration: {
        bySector: [...bySector.entries()].map(([sector, value]) => ({ sector, value, share: share(value, outstanding) })).sort((a, b) => b.value - a.value),
        largestBorrowerShare: share(Math.max(0, ...byClient.values()), outstanding),
      },
      pipeline: pending.map((p) => ({ status: p.status, count: p._count, value: p._sum.amount ?? 0 })),
      events,
    };
  }

  // FR-BNP-12: everything the lender needs for collections and legal recourse.
  async evidence(me: SessionUser, id: string) {
    const ag = await this.get(me, id);
    const reminders = await this.prisma.notification.findMany({ where: { userId: ag.clientId, type: { startsWith: 'PAY_LATER_' } }, orderBy: { createdAt: 'asc' }, select: { type: true, title: true, body: true, channels: true, createdAt: true, link: true } });
    const relevant = reminders.filter((r) => r.link === `/pay-later/${id}` || r.link === `/assignments/${ag.assignmentId}`);
    const trail = await this.prisma.auditLog.findMany({ where: { entityType: 'PayLaterAgreement', entityId: id }, orderBy: { at: 'asc' }, select: { at: true, action: true, actorId: true, after: true, hash: true } });
    const settlements = await this.prisma.settlement.findMany({ where: { milestone: { assignmentId: ag.assignmentId } }, include: { milestone: { select: { seq: true, title: true, acceptedAt: true } } } });
    await this.audit.log({ actorId: me.id, action: 'PAY_LATER_EVIDENCE_VIEWED', entityType: 'PayLaterAgreement', entityId: id });
    return {
      generatedAt: this.clock.now().toISOString(),
      agreement: { ref: ag.ref, status: ag.status, amount: ag.amount, tenorDays: ag.tenorDays, purpose: ag.purpose, cycle: ag.cycle, lender: ag.lender, lenderRef: ag.lenderRef, lenderReason: ag.lenderReason, decidedAt: ag.decidedAt, drawdownRef: ag.drawdownRef, disbursed: ag.disbursed, repaid: ag.repaid, outstanding: ag.outstanding, defaultedAt: ag.defaultedAt },
      borrower: ag.client,
      application: ag.application,
      reassessment: ag.reassessment,
      acknowledgement: { at: ag.acknowledgedAt, text: ag.acknowledgementText, ip: ag.acknowledgementIp },
      assignment: ag.assignment,
      workAccepted: settlements.map((s) => ({ seq: s.milestone.seq, title: s.milestone.title, acceptedAt: s.milestone.acceptedAt, releasedToTalent: s.gross, refundedToFacility: s.refundAmount, instructionRef: s.instructionRef })),
      schedule: ag.installments,
      reminders: relevant,
      repayments: ag.repayments,
      exceptions: ag.exceptions,
      auditTrail: trail.map((t) => ({ ...t, id: undefined })),
    };
  }

  // FR-BNP-07: a client with a late repayment cannot post new assignments.
  async inArrears(clientId: string) {
    const late = await this.prisma.payLaterInstallment.findMany({ where: { agreement: { clientId, status: { in: ['ACTIVE', 'DEFAULTED'] } }, dueOn: { lt: startOfDay(this.clock.now()) } } });
    return late.some((i) => i.paid < i.amount);
  }
}
