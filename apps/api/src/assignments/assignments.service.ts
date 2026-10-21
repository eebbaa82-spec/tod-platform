import { Injectable } from '@nestjs/common';
import { Assignment, Prisma, Tier } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { hasRole, isStaff, SessionUser } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { formatEtb } from '../common/money';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { addWorkingDays } from '../common/working-days';
import { ClientsService } from '../clients/clients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CommissionService } from '../payments/commission.service';
import { FilesService } from '../files/files.service';
import { PaymentsService } from '../payments/payments.service';
import { AcceptProposalDto, CounterDto, CreateAssignmentDto, RespondInvitationDto, ScopeDto } from './dto';
import { MatchingService } from './matching.service';
import { transition } from './state';

const STAFF_VIEW = ['SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER', 'AUDITOR'] as const;

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly params: ParametersService,
    private readonly notifications: NotificationsService,
    private readonly matching: MatchingService,
    private readonly clients: ClientsService,
    private readonly commission: CommissionService,
    private readonly payments: PaymentsService,
    private readonly clock: ClockService,
    private readonly files: FilesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Creating and scoping requests (FR-MAT-01)
  // ---------------------------------------------------------------------------

  async create(me: SessionUser, dto: CreateAssignmentDto) {
    const onBehalf = !!dto.clientUserId && dto.clientUserId !== me.id;
    if (onBehalf && !hasRole(me, 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')) {
      throw fail.forbidden('ROLE_REQUIRED', 'Only support staff can post on behalf of a client.');
    }
    const clientId = onBehalf ? dto.clientUserId! : me.id;
    const client = await this.prisma.user.findUniqueOrThrow({ where: { id: clientId } });
    if (!client.roles.includes('CLIENT')) throw fail.forbidden('NOT_CLIENT', 'Only clients can post assignments.');
    const { limit } = await this.clients.effectiveLimit(clientId);
    if (limit === 0) throw fail.forbidden('IDENTITY_REQUIRED', 'Verify your identity before posting an assignment.');
    await this.assertNotInArrears(clientId);

    const ref = await this.sequence.next('assignment', 'TODA');
    const deadline = dto.deadline ? new Date(dto.deadline) : null;

    if (dto.packageCode) {
      const pkg = await this.prisma.package.findUnique({ where: { code: dto.packageCode }, include: { currentVersion: true } });
      if (!pkg || pkg.status !== 'ACTIVE' || !pkg.currentVersion) throw fail.bad('PACKAGE_UNAVAILABLE', 'This package is not available.');
      const v = pkg.currentVersion;
      if (limit !== null && v.priceMin > limit) {
        throw fail.bad('VALUE_LIMIT', `Your account level allows assignments up to ${formatEtb(limit)}.`);
      }
      if (dto.directTalentId) await this.assertRepeat(clientId, dto.directTalentId);
      const a = await this.prisma.$transaction(async (tx) => {
        const created = await tx.assignment.create({
          data: {
            ref,
            clientId,
            createdById: me.id,
            packageVersionId: v.id,
            serviceAreaId: pkg.serviceAreaId,
            title: dto.title?.trim() || v.titleEn,
            brief: dto.brief,
            budgetMax: dto.budgetMax,
            deadline,
            status: 'OPEN',
            directTalentId: dto.directTalentId,
          },
        });
        await tx.assignmentEvent.create({ data: { assignmentId: created.id, toStatus: 'OPEN', actorId: me.id, note: onBehalf ? 'Posted by support on behalf of client' : undefined } });
        await this.audit.log({ actorId: me.id, action: 'ASSIGNMENT_POSTED', entityType: 'Assignment', entityId: created.id, after: { ref, package: pkg.code, version: v.version, onBehalf } }, tx);
        return created;
      });
      await this.invite(a, v.minTier, dto.workMode);
      return this.get(me, a.id);
    }

    // A described need: support turns it into a package or custom scope.
    const a = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: { ref, clientId, createdById: me.id, title: dto.title?.trim() || 'Request for help', brief: dto.brief, budgetMax: dto.budgetMax, deadline, status: 'REQUESTED' },
      });
      await tx.assignmentEvent.create({ data: { assignmentId: created.id, toStatus: 'REQUESTED', actorId: me.id } });
      await this.audit.log({ actorId: me.id, action: 'ASSIGNMENT_REQUESTED', entityType: 'Assignment', entityId: created.id, after: { ref, onBehalf } }, tx);
      return created;
    });
    await this.notifications.notifyRole(['SUPPORT_AGENT'], 'New client request to scope', `${ref}: ${a.title}`, `/console/assignments/${a.id}`);
    return this.get(me, a.id);
  }

  async scope(me: SessionUser, id: string, dto: ScopeDto) {
    const a = await this.prisma.assignment.findUnique({ where: { id } });
    if (!a) throw fail.notFound('Assignment');
    if (a.status !== 'REQUESTED') throw fail.conflict('INVALID_STATE', 'Only new requests can be scoped.');
    const { limit } = await this.clients.effectiveLimit(a.clientId);
    let minTier: Tier = 'ENTRY';
    const data: Prisma.AssignmentUpdateInput = {};
    if (dto.packageCode) {
      const pkg = await this.prisma.package.findUnique({ where: { code: dto.packageCode }, include: { currentVersion: true } });
      if (!pkg || pkg.status !== 'ACTIVE' || !pkg.currentVersion) throw fail.bad('PACKAGE_UNAVAILABLE', 'This package is not available.');
      if (limit !== null && pkg.currentVersion.priceMin > limit) throw fail.bad('VALUE_LIMIT', `The client's level allows assignments up to ${formatEtb(limit)}.`);
      data.packageVersion = { connect: { id: pkg.currentVersion.id } };
      data.serviceAreaId = pkg.serviceAreaId;
      data.title = dto.title ?? pkg.currentVersion.titleEn;
      // Extra acceptance criteria agreed with the client are kept on top of the package's own.
      if (dto.acceptanceCriteria?.length) {
        data.brief = `${dto.brief ?? a.brief ?? ''}\n\nAdditional acceptance criteria:\n${dto.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`.trim();
      } else if (dto.brief) data.brief = dto.brief;
      minTier = pkg.currentVersion.minTier;
    } else {
      // Custom-scoped work goes to Expert-tier talents only (FR-CAT-05).
      if (!dto.serviceAreaCode || !dto.title || !dto.brief || !dto.budgetMax || !dto.acceptanceCriteria?.length) {
        throw fail.bad('CUSTOM_SCOPE', 'A custom scope needs a service area, title, brief, budget and acceptance criteria.');
      }
      if (limit !== null && dto.budgetMax > limit) throw fail.bad('VALUE_LIMIT', `The client's level allows assignments up to ${formatEtb(limit)}.`);
      const area = await this.prisma.serviceArea.findUnique({ where: { code: dto.serviceAreaCode } });
      if (!area) throw fail.bad('UNKNOWN_SERVICE_AREA', 'Unknown service area.');
      data.custom = true;
      data.serviceAreaId = area.id;
      data.title = dto.title;
      data.brief = `${dto.brief}\n\nAcceptance criteria:\n${dto.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`;
      data.budgetMax = dto.budgetMax;
      minTier = 'EXPERT';
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.assignment.update({ where: { id }, data });
      const fresh = await tx.assignment.findUniqueOrThrow({ where: { id } });
      await transition(tx, fresh, 'OPEN', me.id, 'Scoped by support');
      await this.audit.log({ actorId: me.id, action: 'ASSIGNMENT_SCOPED', entityType: 'Assignment', entityId: id, after: { package: dto.packageCode, custom: !dto.packageCode } }, tx);
      return fresh;
    });
    await this.invite(updated, minTier);
    return this.get(me, id);
  }

  // ---------------------------------------------------------------------------
  // Matching and invitations (FR-MAT-02 to FR-MAT-04)
  // ---------------------------------------------------------------------------

  private async invite(a: Assignment, minTier: Tier, workMode?: 'REMOTE' | 'ONSITE' | 'BOTH') {
    const hours = await this.params.get<number>('INVITATION_RESPONSE_HOURS');
    const respondBy = new Date(this.clock.now().getTime() + hours * 3600_000);
    const pv = a.packageVersionId ? await this.prisma.packageVersion.findUnique({ where: { id: a.packageVersionId } }) : null;
    const priceText = pv ? formatEtb(pv.priceStandard) : a.budgetMax ? `up to ${formatEtb(a.budgetMax)}` : 'your price';

    let candidates: { talentUserId: string; score: number; detail: object; inclusionSlot: boolean }[];
    if (a.directTalentId) {
      candidates = [{ talentUserId: a.directTalentId, score: 100, detail: { repeat: 1 }, inclusionSlot: false }];
    } else {
      const already = await this.prisma.invitation.findMany({ where: { assignmentId: a.id }, select: { talentId: true } });
      candidates = await this.matching.shortlist({
        serviceAreaId: a.serviceAreaId!,
        minTier,
        workMode,
        excludeUserIds: [a.clientId, ...already.map((x) => x.talentId)],
      });
    }
    const existingCount = await this.prisma.invitation.count({ where: { assignmentId: a.id } });
    let rank = existingCount;
    for (const c of candidates) {
      rank++;
      await this.prisma.invitation.create({
        data: { assignmentId: a.id, talentId: c.talentUserId, rank, score: c.score, scoreDetail: c.detail as any, inclusionSlot: c.inclusionSlot, respondBy },
      });
      await this.notifications.notify(
        c.talentUserId,
        'INVITATION',
        { title: a.title, price: priceText, due: respondBy.toISOString().slice(0, 16).replace('T', ' ') },
        { sms: true, link: `/assignments/${a.id}` },
      );
    }
    await this.audit.log({ action: 'INVITATIONS_SENT', entityType: 'Assignment', entityId: a.id, after: { count: candidates.length, talents: candidates.map((c) => ({ id: c.talentUserId, score: c.score, inclusionSlot: c.inclusionSlot })) } });
    if (!candidates.length) {
      await this.notifications.notifyRole(['SUPPORT_AGENT'], 'No eligible talent found', `${a.ref}: ${a.title}`, `/console/assignments/${a.id}`);
    }
    return candidates.length;
  }

  // Support can widen the search when nobody responded.
  async reinvite(me: SessionUser, id: string) {
    const a = await this.prisma.assignment.findUnique({ where: { id }, include: { packageVersion: true } });
    if (!a) throw fail.notFound('Assignment');
    if (a.status !== 'OPEN') throw fail.conflict('INVALID_STATE', 'Only open assignments can be re-matched.');
    const count = await this.invite({ ...a, directTalentId: null }, a.packageVersion?.minTier ?? 'EXPERT');
    await this.audit.log({ actorId: me.id, action: 'ASSIGNMENT_REMATCHED', entityType: 'Assignment', entityId: id, after: { invited: count } });
    return { invited: count };
  }

  // Talent accepts at the package price, proposes within the band, or declines.
  async respond(me: SessionUser, assignmentId: string, dto: RespondInvitationDto) {
    const inv = await this.prisma.invitation.findUnique({ where: { assignmentId_talentId: { assignmentId, talentId: me.id } }, include: { assignment: { include: { packageVersion: true } } } });
    if (!inv) throw fail.notFound('Invitation');
    const a = inv.assignment;
    const now = this.clock.now();
    if (a.status !== 'OPEN') throw fail.conflict('INVALID_STATE', 'This assignment is no longer taking proposals.');
    if (inv.status !== 'INVITED') throw fail.conflict('ALREADY_RESPONDED', 'You have already responded to this invitation.');
    if (inv.respondBy < now) throw fail.conflict('INVITATION_EXPIRED', 'The time to respond has passed.');

    const minutes = Math.round((now.getTime() - inv.createdAt.getTime()) / 60000);
    await this.recordResponseTime(me.id, minutes);

    if (dto.action === 'DECLINE') {
      await this.prisma.invitation.update({ where: { id: inv.id }, data: { status: 'DECLINED', respondedAt: now, declineReason: dto.reason } });
      return { ok: true };
    }

    const pv = a.packageVersion;
    let amount: number;
    if (dto.action === 'ACCEPT_PRICE') {
      if (!pv) throw fail.bad('NO_PACKAGE_PRICE', 'This assignment has no package price. Send a proposal with your price.');
      amount = pv.priceStandard;
    } else {
      if (!dto.amount) throw fail.bad('AMOUNT_REQUIRED', 'Enter your price.');
      amount = dto.amount;
      if (pv && (amount < pv.priceMin || amount > pv.priceMax)) {
        throw fail.bad('PRICE_BAND', `Your price must be between ${formatEtb(pv.priceMin)} and ${formatEtb(pv.priceMax)}.`);
      }
      if (!pv && a.budgetMax && amount > a.budgetMax) throw fail.bad('OVER_BUDGET', `The client's budget is ${formatEtb(a.budgetMax)}.`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({ where: { id: inv.id }, data: { status: 'PROPOSED', respondedAt: now } });
      await tx.proposal.create({
        data: { assignmentId, talentId: me.id, amount, atPackagePrice: dto.action === 'ACCEPT_PRICE', deliveryDays: dto.deliveryDays ?? pv?.turnaroundDays, message: dto.message },
      });
      await tx.priceRecord.create({ data: { assignmentId, actorId: me.id, actorRole: 'TALENT', talentId: me.id, kind: 'OFFERED', amount } });
    });
    const talent = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    await this.notifications.notify(a.clientId, 'PROPOSAL_RECEIVED', { talent: talent.verifiedName ?? talent.displayName, price: formatEtb(amount), title: a.title }, { link: `/assignments/${a.id}` });
    return { ok: true };
  }

  private async recordResponseTime(talentUserId: string, minutes: number) {
    // Running average of response time to invitations (FR-TAL-05).
    const responded = await this.prisma.invitation.findMany({ where: { talentId: talentUserId, respondedAt: { not: null } }, select: { createdAt: true, respondedAt: true }, take: 50, orderBy: { createdAt: 'desc' } });
    const all = [...responded.map((r) => (r.respondedAt!.getTime() - r.createdAt.getTime()) / 60000), minutes];
    const avg = Math.round(all.reduce((s, x) => s + x, 0) / all.length);
    await this.prisma.talentProfile.update({ where: { userId: talentUserId }, data: { avgResponseMinutes: avg } });
  }

  // Client counter-offers on a proposal; the talent accepts or refuses (FR-MAT-06).
  async counter(me: SessionUser, proposalId: string, dto: CounterDto) {
    const p = await this.prisma.proposal.findUnique({ where: { id: proposalId }, include: { assignment: { include: { packageVersion: true } } } });
    if (!p || p.assignment.clientId !== me.id) throw fail.notFound('Proposal');
    if (p.assignment.status !== 'OPEN' || p.status !== 'SUBMITTED') throw fail.conflict('INVALID_STATE', 'This proposal cannot be countered now.');
    const pv = p.assignment.packageVersion;
    if (pv && (dto.amount < pv.priceMin || dto.amount > pv.priceMax)) throw fail.bad('PRICE_BAND', `The price must be between ${formatEtb(pv.priceMin)} and ${formatEtb(pv.priceMax)}.`);
    await this.prisma.$transaction([
      this.prisma.proposal.update({ where: { id: p.id }, data: { status: 'COUNTERED', counterAmount: dto.amount, counterReason: dto.reason } }),
      this.prisma.priceRecord.create({ data: { assignmentId: p.assignmentId, actorId: me.id, actorRole: 'CLIENT', talentId: p.talentId, kind: 'COUNTERED', amount: dto.amount, reason: dto.reason } }),
    ]);
    await this.notifications.notify(p.talentId, 'STAFF_ALERT', { subject: 'Counter-offer received', detail: `The client offered ${formatEtb(dto.amount)} for "${p.assignment.title}".` }, { link: `/assignments/${p.assignmentId}` });
    return { ok: true };
  }

  async respondCounter(me: SessionUser, proposalId: string, accept: boolean, reason?: string) {
    const p = await this.prisma.proposal.findUnique({ where: { id: proposalId }, include: { assignment: true } });
    if (!p || p.talentId !== me.id) throw fail.notFound('Proposal');
    if (p.status !== 'COUNTERED' || !p.counterAmount) throw fail.conflict('INVALID_STATE', 'There is no counter-offer to answer.');
    await this.prisma.$transaction([
      this.prisma.proposal.update({ where: { id: p.id }, data: accept ? { status: 'SUBMITTED', amount: p.counterAmount, atPackagePrice: false } : { status: 'SUBMITTED', counterAmount: null } }),
      this.prisma.priceRecord.create({ data: { assignmentId: p.assignmentId, actorId: me.id, actorRole: 'TALENT', talentId: me.id, kind: accept ? 'ACCEPTED' : 'REFUSED', amount: p.counterAmount, reason } }),
    ]);
    return { ok: true };
  }

  async rejectProposal(me: SessionUser, proposalId: string, reason?: string) {
    const p = await this.prisma.proposal.findUnique({ where: { id: proposalId }, include: { assignment: true } });
    if (!p || p.assignment.clientId !== me.id) throw fail.notFound('Proposal');
    if (p.status === 'ACCEPTED') throw fail.conflict('INVALID_STATE', 'This proposal was already accepted.');
    await this.prisma.$transaction([
      this.prisma.proposal.update({ where: { id: p.id }, data: { status: 'REJECTED', rejectReason: reason } }),
      this.prisma.priceRecord.create({ data: { assignmentId: p.assignmentId, actorId: me.id, actorRole: 'CLIENT', talentId: p.talentId, kind: 'REFUSED', amount: p.amount, reason } }),
    ]);
    await this.notifications.notify(p.talentId, 'PROPOSAL_DECLINED', { title: p.assignment.title }, { link: `/assignments/${p.assignmentId}` });
    return { ok: true };
  }

  // Acceptance creates the agreement with its milestones (FR-MAT-05), fixes the
  // commission rate and asks the client to pay into escrow.
  async acceptProposal(me: SessionUser, proposalId: string, dto: AcceptProposalDto) {
    const p = await this.prisma.proposal.findUnique({ where: { id: proposalId }, include: { assignment: { include: { packageVersion: true } } } });
    if (!p || p.assignment.clientId !== me.id) throw fail.notFound('Proposal');
    const a = p.assignment;
    if (a.status !== 'OPEN') throw fail.conflict('INVALID_STATE', 'This assignment is no longer open.');
    if (p.status !== 'SUBMITTED') throw fail.conflict('INVALID_STATE', 'This proposal cannot be accepted now.');

    const { limit } = await this.clients.effectiveLimit(a.clientId);
    if (limit !== null && p.amount > limit) throw fail.bad('VALUE_LIMIT', `Your account level allows assignments up to ${formatEtb(limit)}.`);

    // The talent must still be within their concurrency limit (FR-TAL-06).
    const concurrency = await this.params.get<Record<string, number>>('TIER_CONCURRENCY');
    const tier = a.serviceAreaId
      ? await this.prisma.talentTier.findFirst({ where: { talent: { userId: p.talentId }, serviceAreaId: a.serviceAreaId } })
      : null;
    const active = await this.prisma.assignment.count({ where: { talentId: p.talentId, status: { in: ['AGREED', 'FUNDED', 'DELIVERED', 'DISPUTED'] } } });
    if (tier && active >= (concurrency[tier.tier] ?? 1)) throw fail.conflict('TALENT_BUSY', 'This talent has reached their limit of active assignments. Choose another proposal.');

    const holidays = await this.params.holidays();
    const now = this.clock.now();
    const turnaround = p.deliveryDays ?? a.packageVersion?.turnaroundDays ?? 5;
    const plan = dto.milestones?.length
      ? dto.milestones
      : [{ title: a.packageVersion?.deliverableEn ?? a.title, amount: p.amount, dueInWorkingDays: turnaround }];
    const total = plan.reduce((s, m) => s + m.amount, 0);
    if (total !== p.amount) throw fail.bad('MILESTONE_TOTAL', `Milestone amounts must add up to ${formatEtb(p.amount)}.`);

    const rate = await this.commission.rateFor(p.talentId);

    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.assignment.findUniqueOrThrow({ where: { id: a.id } });
      await transition(tx, fresh, 'AGREED', me.id, `Accepted proposal ${p.id}`, {
        talentId: p.talentId,
        agreedPrice: p.amount,
        agreedAt: now,
        commissionRate: new Prisma.Decimal(rate.rate),
        commissionRule: rate.rule,
      });
      let seq = 0;
      for (const m of plan) {
        seq++;
        await tx.milestone.create({ data: { assignmentId: a.id, seq, title: m.title, amount: m.amount, deadline: addWorkingDays(now, m.dueInWorkingDays, holidays) } });
      }
      await tx.proposal.update({ where: { id: p.id }, data: { status: 'ACCEPTED' } });
      await tx.priceRecord.create({ data: { assignmentId: a.id, actorId: me.id, actorRole: 'CLIENT', talentId: p.talentId, kind: 'ACCEPTED', amount: p.amount } });
      const others = await tx.proposal.findMany({ where: { assignmentId: a.id, id: { not: p.id }, status: { in: ['SUBMITTED', 'COUNTERED'] } } });
      for (const o of others) {
        await tx.proposal.update({ where: { id: o.id }, data: { status: 'REJECTED', rejectReason: 'Client chose another proposal' } });
        await tx.priceRecord.create({ data: { assignmentId: a.id, actorId: me.id, actorRole: 'CLIENT', talentId: o.talentId, kind: 'REFUSED', amount: o.amount, reason: 'Client chose another proposal' } });
      }
      await tx.invitation.updateMany({ where: { assignmentId: a.id, status: 'INVITED' }, data: { status: 'WITHDRAWN' } });
      await this.audit.log({ actorId: me.id, action: 'PROPOSAL_ACCEPTED', entityType: 'Assignment', entityId: a.id, after: { proposalId: p.id, talentId: p.talentId, amount: p.amount, commissionRate: rate.rate, commissionRule: rate.rule, milestones: plan } }, tx);
    });

    const losers = await this.prisma.proposal.findMany({ where: { assignmentId: a.id, status: 'REJECTED', rejectReason: 'Client chose another proposal' } });
    for (const l of losers) await this.notifications.notify(l.talentId, 'PROPOSAL_DECLINED', { title: a.title }, { link: `/assignments/${a.id}` });
    // The talent is told the proposal was accepted, but not to start (FR-ASG-02).
    await this.notifications.notify(p.talentId, 'PROPOSAL_ACCEPTED', { title: a.title }, { link: `/assignments/${a.id}` });

    const agreed = await this.prisma.assignment.findUniqueOrThrow({ where: { id: a.id } });
    const instruction = await this.payments.createFundingInstruction(agreed);
    return { assignment: await this.get(me, a.id), payment: instruction };
  }

  // ---------------------------------------------------------------------------
  // Cancellation (FR-ASG-07)
  // ---------------------------------------------------------------------------

  async cancel(me: SessionUser, id: string, reason: string) {
    const a = await this.prisma.assignment.findUnique({ where: { id }, include: { milestones: true } });
    if (!a) throw fail.notFound('Assignment');
    const isClient = a.clientId === me.id;
    const isTalent = a.talentId === me.id;
    const isSupport = hasRole(me, 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN') && me.mfa;
    if (!isClient && !isTalent && !isSupport) throw fail.notFound('Assignment');

    // Before funding: free of charge.
    if (['REQUESTED', 'OPEN', 'AGREED'].includes(a.status)) {
      if (isTalent && a.status !== 'AGREED') throw fail.forbidden('NOT_ALLOWED', 'Decline the invitation instead.');
      await this.prisma.$transaction(async (tx) => {
        await transition(tx, a, 'CANCELLED', me.id, reason, { cancelReason: reason, closedAt: this.clock.now() });
        await tx.paymentInstruction.updateMany({ where: { assignmentId: id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
        await tx.milestone.updateMany({ where: { assignmentId: id }, data: { status: 'CANCELLED' } });
        await tx.invitation.updateMany({ where: { assignmentId: id, status: 'INVITED' }, data: { status: 'WITHDRAWN' } });
        await this.audit.log({ actorId: me.id, action: 'ASSIGNMENT_CANCELLED', entityType: 'Assignment', entityId: id, after: { reason, beforeFunding: true } }, tx);
      });
      const other = isClient ? a.talentId : a.clientId;
      if (other) await this.notifications.notify(other, 'CANCELLED', { title: a.title, detail: 'No charge applies because it was not yet funded.' }, { link: `/assignments/${id}` });
      return this.get(me, id);
    }

    // After funding: by agreed refund (both parties) or through a dispute.
    if (a.status === 'FUNDED' || a.status === 'DELIVERED') {
      if (!a.cancelRequestedById) {
        await this.prisma.assignment.update({ where: { id }, data: { cancelRequestedById: me.id, cancelRequestedAt: this.clock.now(), cancelReason: reason } });
        await this.audit.log({ actorId: me.id, action: 'CANCELLATION_REQUESTED', entityType: 'Assignment', entityId: id, after: { reason } });
        const other = isClient ? a.talentId! : a.clientId;
        await this.notifications.notify(other, 'STAFF_ALERT', { subject: 'Cancellation requested', detail: `The other party asked to cancel "${a.title}" with a refund of the unpaid amount. Agree, or open a dispute if you disagree.` }, { link: `/assignments/${id}` });
        return this.get(me, id);
      }
      if (a.cancelRequestedById === me.id) throw fail.conflict('WAITING_FOR_OTHER_PARTY', 'Waiting for the other party to agree to the cancellation.');
      // Second party agrees: refund every milestone not yet settled.
      await this.audit.log({ actorId: me.id, action: 'CANCELLATION_AGREED', entityType: 'Assignment', entityId: id, after: { reason } });
      for (const m of a.milestones.filter((x) => ['PENDING', 'IN_PROGRESS', 'DELIVERED', 'REVISION_REQUESTED'].includes(x.status))) {
        await this.prisma.milestone.update({ where: { id: m.id }, data: { status: 'CANCELLED' } });
        await this.payments.refundMilestone(m.id, 'CANCELLED_BY_AGREEMENT');
      }
      const after = await this.prisma.assignment.findUniqueOrThrow({ where: { id } });
      if (!['CANCELLED', 'CLOSED'].includes(after.status)) {
        const anySettled = await this.prisma.milestone.count({ where: { assignmentId: id, status: 'SETTLED' } });
        await this.prisma.$transaction(async (tx) => {
          if (anySettled) {
            await transition(tx, after, 'ACCEPTED', me.id, 'Remaining milestones cancelled');
            await transition(tx, after, 'CLOSED', me.id, 'Closed after partial cancellation', { closedAt: this.clock.now() });
          } else {
            await transition(tx, after, 'CANCELLED', me.id, 'Cancelled by agreement with refund', { closedAt: this.clock.now() });
          }
        });
      }
      const other = isClient ? a.talentId! : a.clientId;
      await this.notifications.notify(other, 'CANCELLED', { title: a.title, detail: 'The unpaid amount is being refunded to the client.' }, { link: `/assignments/${id}` });
      return this.get(me, id);
    }
    throw fail.conflict('INVALID_STATE', 'This assignment cannot be cancelled now. Open a dispute instead.');
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async get(me: SessionUser, id: string) {
    const a = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        packageVersion: { include: { package: { include: { serviceArea: true } } } },
        milestones: { orderBy: { seq: 'asc' }, include: { deliveries: { orderBy: { submittedAt: 'desc' } }, settlement: true } },
        events: { orderBy: { at: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        disputes: { select: { id: true, ref: true, stage: true, milestoneId: true, openedByRole: true, reason: true, amountDisputed: true, remedy: true, releaseAmount: true, refundAmount: true, createdAt: true, closedAt: true, appealedAt: true } },
        ratings: true,
      },
    });
    if (!a) throw fail.notFound('Assignment');
    const isClient = a.clientId === me.id;
    const isTalent = a.talentId === me.id;
    const invitation = await this.prisma.invitation.findUnique({ where: { assignmentId_talentId: { assignmentId: id, talentId: me.id } } });
    const staff = isStaff(me.roles) && me.mfa && hasRole(me, ...STAFF_VIEW);
    if (!isClient && !isTalent && !invitation && !staff) throw fail.notFound('Assignment');

    const viewerRole = isClient ? 'CLIENT' : isTalent ? 'TALENT' : invitation ? 'INVITED_TALENT' : 'STAFF';
    const proposals = await this.prisma.proposal.findMany({
      where: { assignmentId: id, ...(isClient || staff ? {} : { talentId: me.id }) },
      orderBy: { createdAt: 'asc' },
    });
    const proposalsWithTalent = await Promise.all(
      proposals.map(async (p) => {
        const u = await this.prisma.user.findUniqueOrThrow({ where: { id: p.talentId }, include: { talentProfile: { include: { tiers: { include: { serviceArea: true } } } } } });
        const tier = u.talentProfile?.tiers.find((t) => t.serviceAreaId === a.serviceAreaId);
        return { ...p, talent: { userId: u.id, name: u.verifiedName ?? u.displayName, headline: u.talentProfile?.headline, tier: tier?.tier ?? null, testScore: tier?.testScore ?? null, verified: u.identityStatus === 'VERIFIED' } };
      }),
    );
    const client = await this.prisma.user.findUniqueOrThrow({ where: { id: a.clientId }, include: { clientProfile: true } });
    const talent = a.talentId ? await this.prisma.user.findUnique({ where: { id: a.talentId } }) : null;

    const ratings = a.ratings
      .filter((r) => r.publishedAt || r.raterId === me.id || staff)
      .map((r) => ({ ...r, removedById: undefined }));

    // File names for each delivery, so people see what they are opening.
    const deliveryFiles = await this.files.describe(a.milestones.flatMap((m) => m.deliveries.flatMap((d) => d.fileIds)));
    const milestones = a.milestones.map((m) => ({
      ...m,
      deliveries: m.deliveries.map((d) => ({ ...d, files: d.fileIds.map((fid) => deliveryFiles.find((f) => f.id === fid)).filter(Boolean) })),
    }));
    // An invited talent sees the commission that would apply before proposing (FR-PAY transparency).
    const commissionPreview = viewerRole === 'INVITED_TALENT' || viewerRole === 'TALENT' ? await this.commission.rateFor(me.id) : undefined;

    return {
      ...a,
      milestones,
      commissionPreview,
      ratings,
      viewerRole,
      invitation,
      proposals: proposalsWithTalent,
      invitationCount: isClient || staff ? await this.prisma.invitation.count({ where: { assignmentId: id } }) : undefined,
      invitations: staff ? await this.prisma.invitation.findMany({ where: { assignmentId: id }, orderBy: { rank: 'asc' } }) : undefined,
      priceRecords: staff ? await this.prisma.priceRecord.findMany({ where: { assignmentId: id }, orderBy: { at: 'asc' } }) : undefined,
      client: { userId: client.id, name: client.clientProfile?.enterpriseName ?? client.verifiedName ?? client.displayName, level: client.clientProfile?.level, verified: client.identityStatus === 'VERIFIED' },
      talent: talent ? { userId: talent.id, name: talent.verifiedName ?? talent.displayName, verified: talent.identityStatus === 'VERIFIED' } : null,
      payments: isClient || staff ? a.payments : [],
    };
  }

  async listMine(me: SessionUser, as: 'client' | 'talent') {
    if (as === 'client') {
      return this.prisma.assignment.findMany({
        where: { clientId: me.id },
        orderBy: { updatedAt: 'desc' },
        include: { milestones: { select: { id: true, seq: true, status: true, amount: true, deadline: true, reviewWindowEndsAt: true } }, _count: { select: { proposals: true } } },
      });
    }
    const [assigned, invitations] = await Promise.all([
      this.prisma.assignment.findMany({
        where: { talentId: me.id },
        orderBy: { updatedAt: 'desc' },
        include: { milestones: { select: { id: true, seq: true, status: true, amount: true, deadline: true, reviewWindowEndsAt: true } } },
      }),
      this.prisma.invitation.findMany({
        where: { talentId: me.id, status: { in: ['INVITED', 'PROPOSED'] }, assignment: { status: 'OPEN' } },
        orderBy: { createdAt: 'desc' },
        include: { assignment: { include: { packageVersion: true } } },
      }),
    ]);
    return { assigned, invitations };
  }

  // Staff list with filters (FR-ADM-04).
  async search(q: { status?: string; text?: string; clientId?: string; talentId?: string; take?: number }) {
    return this.prisma.assignment.findMany({
      where: {
        ...(q.status ? { status: q.status as any } : {}),
        ...(q.clientId ? { clientId: q.clientId } : {}),
        ...(q.talentId ? { talentId: q.talentId } : {}),
        ...(q.text ? { OR: [{ ref: { contains: q.text, mode: 'insensitive' } }, { title: { contains: q.text, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(q.take ?? 100, 500),
      include: { _count: { select: { proposals: true, invitations: true } } },
    });
  }

  private async assertRepeat(clientId: string, talentId: string) {
    const prior = await this.prisma.assignment.count({ where: { clientId, talentId, status: 'CLOSED' } });
    if (!prior) throw fail.bad('NOT_REPEAT', 'You can re-engage a talent directly only after completing an assignment with them.');
  }

  // Pay-later arrears block new assignments (FR-BNP-07). The pay-later module is
  // switched off at launch; this check is the hook for it.
  private async assertNotInArrears(_clientId: string) {
    return;
  }
}
