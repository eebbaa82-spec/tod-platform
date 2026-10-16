import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../common/audit.service';
import { hasRole, SessionUser, STAFF_ROLES } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { PARAMETER_DEFAULTS } from '../common/parameters';
import { ParametersService } from '../common/parameters.service';
import { normalisePhone } from '../common/phone';
import { PrismaService } from '../common/prisma.service';
import { PublicationService } from '../integrations/publication';
import { NotificationsService } from '../notifications/notifications.service';

const ALL_ROLES: Role[] = ['TALENT', 'CLIENT', ...STAFF_ROLES];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly params: ParametersService,
    private readonly notifications: NotificationsService,
    private readonly publication: PublicationService,
    private readonly clock: ClockService,
  ) {}

  // ---------------------------------------------------------------- users

  async users(q: { text?: string; role?: string; status?: string; identity?: string; take?: number }) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { roles: { has: q.role as Role } } : {}),
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.identity ? { identityStatus: q.identity as any } : {}),
      ...(q.text
        ? { OR: [{ displayName: { contains: q.text, mode: 'insensitive' } }, { verifiedName: { contains: q.text, mode: 'insensitive' } }, { phone: { contains: q.text.replace(/^0/, '') } }] }
        : {}),
    };
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(q.take ?? 100, 500),
      include: { talentProfile: { select: { vettingStatus: true, publishedAt: true } }, clientProfile: { select: { level: true, enterpriseName: true } } },
    });
    return rows.map((u) => ({
      id: u.id,
      phone: u.phone,
      displayName: u.displayName,
      verifiedName: u.verifiedName,
      roles: u.roles,
      status: u.status,
      identityStatus: u.identityStatus,
      identityMasked: u.identityMasked,
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
      talent: u.talentProfile,
      client: u.clientProfile,
      assisted: !!u.assistedById,
    }));
  }

  // Restricted personal fields are shown only to roles that need them (section 3).
  async user(me: SessionUser, id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { talentProfile: { include: { tiers: { include: { serviceArea: true } } } }, clientProfile: true, consents: { orderBy: { acceptedAt: 'desc' } } } });
    if (!u) throw fail.notFound('User');
    const canSeeInclusion = hasRole(me, 'VETTING_OFFICER', 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN');
    const tp = u.talentProfile;
    const counts = {
      asClient: await this.prisma.assignment.count({ where: { clientId: id } }),
      asTalent: await this.prisma.assignment.count({ where: { talentId: id } }),
      tickets: await this.prisma.ticket.count({ where: { requesterId: id, confidential: false } }),
    };
    return {
      id: u.id,
      phone: u.phone,
      displayName: u.displayName,
      language: u.language,
      roles: u.roles,
      status: u.status,
      suspensionReason: u.suspensionReason,
      mfaEnabled: u.mfaEnabled,
      safeguardingDesignated: u.safeguardingDesignated,
      identity: { status: u.identityStatus, masked: u.identityMasked, verifiedName: u.verifiedName, sex: u.sex, dateOfBirth: u.dateOfBirth, verifiedAt: u.identityVerifiedAt },
      consents: u.consents,
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
      assistedById: u.assistedById,
      talent: tp
        ? {
            headline: tp.headline,
            vettingStatus: tp.vettingStatus,
            publishedAt: tp.publishedAt,
            visibility: tp.visibility,
            tiers: tp.tiers.map((t) => ({ serviceArea: t.serviceArea.code, tier: t.tier, testScore: t.testScore })),
            payout: { channel: tp.payoutChannel, masked: tp.payoutAccountMasked, accountName: tp.payoutAccountName, nameVerified: tp.payoutNameVerified },
            inclusion: canSeeInclusion ? { disability: tp.disability, disabilityConfirmed: tp.disabilityConfirmed, displaced: tp.displaced, otherMarginalised: tp.otherMarginalised } : 'restricted',
          }
        : null,
      client: u.clientProfile,
      counts,
    };
  }

  async suspend(me: SessionUser, id: string, reason: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw fail.notFound('User');
    if (u.roles.includes('SUPER_ADMIN') && !hasRole(me, 'SUPER_ADMIN')) throw fail.forbidden('NOT_ALLOWED', 'Only a super administrator can suspend another super administrator.');
    await this.prisma.user.update({ where: { id }, data: { status: 'SUSPENDED', suspensionReason: reason } });
    await this.audit.log({ actorId: me.id, action: 'ACCOUNT_SUSPENDED', entityType: 'User', entityId: id, before: { status: u.status }, after: { status: 'SUSPENDED', reason } });
    await this.publication.refresh(id);
    await this.notifications.notify(id, 'ACCOUNT_SUSPENDED', { reason }, { sms: true });
    return this.user(me, id);
  }

  async reinstate(me: SessionUser, id: string, reason: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw fail.notFound('User');
    await this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE', suspensionReason: null, failedLoginCount: 0, lockedUntil: null } });
    await this.audit.log({ actorId: me.id, action: 'ACCOUNT_REINSTATED', entityType: 'User', entityId: id, before: { status: u.status }, after: { status: 'ACTIVE', reason } });
    await this.publication.refresh(id);
    await this.notifications.notify(id, 'ACCOUNT_REINSTATED', {}, { sms: true });
    return this.user(me, id);
  }

  // Only a super administrator manages roles and administrator accounts.
  async setRoles(me: SessionUser, id: string, roles: Role[], safeguardingDesignated?: boolean) {
    if (!roles.every((r) => ALL_ROLES.includes(r))) throw fail.bad('BAD_ROLE', 'Unknown role.');
    if (id === me.id && !roles.includes('SUPER_ADMIN')) throw fail.bad('SELF_DEMOTION', 'You cannot remove your own super administrator role.');
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw fail.notFound('User');
    await this.prisma.user.update({ where: { id }, data: { roles, ...(safeguardingDesignated !== undefined ? { safeguardingDesignated } : {}) } });
    await this.audit.log({ actorId: me.id, action: 'ROLES_CHANGED', entityType: 'User', entityId: id, before: { roles: u.roles, safeguardingDesignated: u.safeguardingDesignated }, after: { roles, safeguardingDesignated } });
    return this.user(me, id);
  }

  async createStaff(me: SessionUser, input: { phone: string; displayName: string; roles: Role[]; temporaryPassword: string; safeguardingDesignated?: boolean }) {
    const phone = normalisePhone(input.phone);
    if (await this.prisma.user.findUnique({ where: { phone } })) throw fail.conflict('PHONE_TAKEN', 'This phone number already has an account.');
    if (!input.roles.length || !input.roles.every((r) => STAFF_ROLES.includes(r))) throw fail.bad('BAD_ROLE', 'Give at least one staff role.');
    const u = await this.prisma.user.create({
      data: { phone, displayName: input.displayName, roles: input.roles, status: 'ACTIVE', passwordHash: await bcrypt.hash(input.temporaryPassword, 10), safeguardingDesignated: !!input.safeguardingDesignated },
    });
    await this.audit.log({ actorId: me.id, action: 'STAFF_CREATED', entityType: 'User', entityId: u.id, after: { roles: input.roles, phone } });
    return { id: u.id, phone: u.phone, roles: u.roles };
  }

  // Staff confirm a self-declared disability before the inclusive rate applies.
  async confirmDisability(me: SessionUser, userId: string, confirmed: boolean, note: string) {
    const p = await this.prisma.talentProfile.findUnique({ where: { userId } });
    if (!p) throw fail.notFound('Talent profile');
    if (confirmed && !p.disability) throw fail.bad('NOT_DECLARED', 'The talent has not declared a disability.');
    await this.prisma.talentProfile.update({ where: { userId }, data: { disabilityConfirmed: confirmed } });
    await this.audit.log({ actorId: me.id, action: 'DISABILITY_CONFIRMATION', entityType: 'TalentProfile', entityId: p.id, after: { confirmed, note } });
    return { ok: true };
  }

  // Targeted announcements to user segments (FR-MSG-05).
  async announce(me: SessionUser, input: { role?: Role; subject: string; detail: string; sms?: boolean }) {
    const users = await this.prisma.user.findMany({ where: { status: 'ACTIVE', ...(input.role ? { roles: { has: input.role } } : {}) }, select: { id: true } });
    for (const u of users) await this.notifications.notify(u.id, 'ANNOUNCEMENT', { subject: input.subject, detail: input.detail }, { sms: !!input.sms });
    await this.audit.log({ actorId: me.id, action: 'ANNOUNCEMENT_SENT', entityType: 'Announcement', after: { role: input.role ?? 'ALL', subject: input.subject, recipients: users.length } });
    return { recipients: users.length };
  }

  // ----------------------------------------------------------- parameters

  async parameters() {
    const rows = await this.prisma.parameter.findMany({ orderBy: { key: 'asc' } });
    const pending = await this.prisma.parameterChange.findMany({ where: { status: 'PENDING' }, orderBy: { requestedAt: 'desc' } });
    return { parameters: rows, pending };
  }

  // FR-ADM-02: every change records who, when, old and new value; financial
  // parameters need a second approver before they apply.
  async requestChange(me: SessionUser, key: string, value: unknown, reason: string) {
    const p = await this.prisma.parameter.findUnique({ where: { key } });
    if (!p) throw fail.notFound('Parameter');
    validateParam(key, value);
    const change = await this.prisma.parameterChange.create({ data: { key, oldValue: p.value as any, newValue: value as any, reason, requestedById: me.id } });
    await this.audit.log({ actorId: me.id, action: 'PARAMETER_CHANGE_REQUESTED', entityType: 'Parameter', entityId: key, before: p.value, after: { value, reason, changeId: change.id } });
    if (p.category === 'OPERATIONAL') return this.applyChange(me, change.id, true);
    await this.notifications.notifyRole(['SUPER_ADMIN', 'FINANCE_OFFICER'], `Approve change to ${key}`, reason, '/console/approvals');
    return change;
  }

  async decideChange(me: SessionUser, changeId: string, approve: boolean, note?: string) {
    const c = await this.prisma.parameterChange.findUnique({ where: { id: changeId } });
    if (!c || c.status !== 'PENDING') throw fail.notFound('Pending change');
    if (c.requestedById === me.id) throw fail.forbidden('SAME_PERSON', 'A different person must approve this change.');
    if (!approve) {
      await this.prisma.parameterChange.update({ where: { id: changeId }, data: { status: 'REJECTED', decidedById: me.id, decidedAt: this.clock.now() } });
      await this.audit.log({ actorId: me.id, action: 'PARAMETER_CHANGE_REJECTED', entityType: 'Parameter', entityId: c.key, after: { changeId, note } });
      return { status: 'REJECTED' };
    }
    return this.applyChange(me, changeId, false);
  }

  private async applyChange(me: SessionUser, changeId: string, selfApplied: boolean) {
    const c = await this.prisma.parameterChange.findUniqueOrThrow({ where: { id: changeId } });
    const now = this.clock.now();
    const before = await this.prisma.parameter.findUniqueOrThrow({ where: { key: c.key } });
    await this.prisma.$transaction([
      this.prisma.parameter.update({ where: { key: c.key }, data: { value: c.newValue as any, effectiveFrom: now } }),
      this.prisma.parameterChange.update({ where: { id: changeId }, data: { status: 'APPLIED', decidedById: me.id, decidedAt: now } }),
    ]);
    this.params.invalidate();
    await this.audit.log({ actorId: me.id, action: 'PARAMETER_CHANGED', entityType: 'Parameter', entityId: c.key, before: before.value, after: { value: c.newValue, changeId, requestedById: c.requestedById, approvedById: selfApplied ? null : me.id } });
    return { status: 'APPLIED', key: c.key, value: c.newValue };
  }

  async approvals() {
    const [params, decisions] = await Promise.all([
      this.prisma.parameterChange.findMany({ where: { status: 'PENDING' }, orderBy: { requestedAt: 'asc' } }),
      this.prisma.approval.findMany({ where: { status: 'PENDING' }, orderBy: { requestedAt: 'asc' } }),
    ]);
    const disputes = await this.prisma.dispute.findMany({ where: { id: { in: decisions.map((d) => d.subjectId) } }, select: { id: true, ref: true, amountDisputed: true, assignment: { select: { ref: true, title: true } } } });
    return { parameterChanges: params, disputeDecisions: decisions.map((d) => ({ ...d, dispute: disputes.find((x) => x.id === d.subjectId) })) };
  }

  // ---------------------------------------------------------------- audit

  async auditLog(q: { entityType?: string; entityId?: string; actorId?: string; action?: string; from?: string; to?: string; take?: number }) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(q.entityType ? { entityType: q.entityType } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
        ...(q.actorId ? { actorId: q.actorId } : {}),
        ...(q.action ? { action: { contains: q.action.toUpperCase() } } : {}),
        ...(q.from || q.to ? { at: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: Math.min(q.take ?? 200, 1000),
    });
    return rows.map((r) => ({ ...r, id: r.id.toString() }));
  }

  // Overview counts for the console home page, with oldest-item ageing (FR-ADM-06).
  async overview() {
    const now = this.clock.now();
    const oldest = async (where: Prisma.AssignmentWhereInput) => (await this.prisma.assignment.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }))?.createdAt ?? null;
    return {
      requestsToScope: await this.prisma.assignment.count({ where: { status: 'REQUESTED' } }),
      oldestRequest: await oldest({ status: 'REQUESTED' }),
      openNoProposal: await this.prisma.assignment.count({ where: { status: 'OPEN', proposals: { none: {} } } }),
      awaitingFunding: await this.prisma.assignment.count({ where: { status: 'AGREED' } }),
      inProgress: await this.prisma.assignment.count({ where: { status: { in: ['FUNDED', 'DELIVERED'] } } }),
      openDisputes: await this.prisma.dispute.count({ where: { stage: { not: 'CLOSED' } } }),
      pendingApprovals: (await this.prisma.approval.count({ where: { status: 'PENDING' } })) + (await this.prisma.parameterChange.count({ where: { status: 'PENDING' } })),
      openTickets: await this.prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, confidential: false } }),
      confidentialUnacknowledged: await this.prisma.ticket.count({ where: { confidential: true, acknowledgedAt: null } }),
      identityPending: await this.prisma.user.count({ where: { identityStatus: { in: ['PENDING', 'UNVERIFIED'] }, roles: { hasSome: ['TALENT', 'CLIENT'] }, status: 'ACTIVE' } }),
      vettingPending: await this.prisma.talentProfile.count({ where: { vettingStatus: { in: ['NOT_STARTED', 'IN_PROGRESS'] } } }),
      clientLevelsToConfirm: await this.prisma.clientProfile.count({ where: { level: 'VERIFIED_ENTERPRISE', levelConfirmedAt: null } }),
      at: now,
    };
  }
}

function validateParam(key: string, value: unknown) {
  const def = PARAMETER_DEFAULTS.find((d) => d.key === key);
  if (!def) throw fail.bad('UNKNOWN_PARAMETER', 'Unknown parameter.');
  const expected = Array.isArray(def.value) ? 'array' : def.value === null ? 'null' : typeof def.value;
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (expected !== actual) throw fail.bad('PARAMETER_TYPE', `This parameter takes a value of type ${expected}.`);
  if (key.startsWith('COMMISSION_') && key.endsWith('_RATE') && (typeof value !== 'number' || value < 0 || value > 0.3)) {
    throw fail.bad('PARAMETER_RANGE', 'A commission rate is a fraction between 0 and 0.30, for example 0.05 for 5%.');
  }
}
