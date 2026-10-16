import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../common/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { IDENTITY_PROVIDER, IdentityVerificationProvider } from '../integrations/identity';
import { PublicationService } from '../integrations/publication';
import { NotificationsService } from '../notifications/notifications.service';

// Data-subject rights and the user's own entry points to identity and vetting.
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly sequence: SequenceService,
    private readonly notifications: NotificationsService,
    private readonly publication: PublicationService,
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityVerificationProvider,
  ) {}

  // Hands over to the Fayda module (developer). Until it is connected the
  // request waits for staff (PendingIdentityProvider).
  async startIdentity(me: SessionUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (u.identityStatus === 'VERIFIED') return { status: 'VERIFIED' };
    const r = await this.identity.start(me.id);
    await this.prisma.user.update({ where: { id: me.id }, data: { identityStatus: 'PENDING' } });
    await this.audit.log({ actorId: me.id, action: 'IDENTITY_STARTED', entityType: 'User', entityId: me.id, after: { provider: this.identity.name } });
    if (this.identity.name === 'not-connected') await this.notifications.notifyRole(['VETTING_OFFICER', 'SUPPORT_AGENT'], 'Identity check waiting', `${u.displayName} asked to verify identity.`, `/console/users/${u.id}`);
    return r;
  }

  // Hands the talent to the vetting workflow (developer).
  async requestVetting(me: SessionUser) {
    const p = await this.prisma.talentProfile.findUnique({ where: { userId: me.id } });
    if (!p) throw fail.bad('NO_TALENT_PROFILE', 'Complete your talent profile first.');
    if (p.vettingStatus !== 'NOT_STARTED') return { status: p.vettingStatus };
    if (!p.headline || !p.skills.length) throw fail.bad('PROFILE_INCOMPLETE', 'Add a headline and at least one skill before asking for vetting.');
    await this.prisma.talentProfile.update({ where: { userId: me.id }, data: { vettingStatus: 'IN_PROGRESS' } });
    await this.audit.log({ actorId: me.id, action: 'VETTING_REQUESTED', entityType: 'TalentProfile', entityId: p.id });
    await this.notifications.notifyRole(['VETTING_OFFICER'], 'Vetting requested', `A talent asked to be vetted.`, `/console/users/${me.id}`);
    return { status: 'IN_PROGRESS' };
  }

  // Everything held about the user, in a portable form (data-subject access).
  async exportData(me: SessionUser) {
    const id = me.id;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true, phone: true, displayName: true, language: true, roles: true, status: true, email: true, notifyChannels: true,
        identityStatus: true, identityMasked: true, verifiedName: true, sex: true, dateOfBirth: true, createdAt: true, lastSignInAt: true,
        consents: true, talentProfile: { include: { tiers: true, portfolio: true } }, clientProfile: true,
      },
    });
    if (user.talentProfile) (user.talentProfile as any).payoutAccountEnc = undefined;
    const data = {
      exportedAt: this.clock.now(),
      user,
      assignments: await this.prisma.assignment.findMany({ where: { OR: [{ clientId: id }, { talentId: id }] }, include: { milestones: { include: { settlement: true } } } }),
      proposals: await this.prisma.proposal.findMany({ where: { talentId: id } }),
      messagesSent: await this.prisma.message.findMany({ where: { senderId: id } }),
      ratingsGiven: await this.prisma.rating.findMany({ where: { raterId: id } }),
      ratingsReceived: await this.prisma.rating.findMany({ where: { rateeId: id, publishedAt: { not: null } } }),
      tickets: await this.prisma.ticket.findMany({ where: { requesterId: id, confidential: false }, include: { updates: { where: { internal: false } } } }),
      notifications: await this.prisma.notification.findMany({ where: { userId: id } }),
    };
    await this.audit.log({ actorId: id, action: 'PERSONAL_DATA_EXPORTED', entityType: 'User', entityId: id });
    return data;
  }

  // FR-ACC-08. Deactivation hides the profile; records needed by law stay.
  async deactivate(me: SessionUser, password: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await bcrypt.compare(password, u.passwordHash))) throw fail.forbidden('BAD_PASSWORD', 'The password is not correct.');
    const live = await this.prisma.assignment.count({ where: { OR: [{ clientId: me.id }, { talentId: me.id }], status: { in: ['AGREED', 'FUNDED', 'DELIVERED', 'DISPUTED'] } } });
    if (live) throw fail.conflict('LIVE_ASSIGNMENTS', 'Finish or cancel your active assignments before deactivating.');
    await this.prisma.user.update({ where: { id: me.id }, data: { status: 'DEACTIVATED', deactivatedAt: this.clock.now() } });
    await this.publication.refresh(me.id);
    await this.audit.log({ actorId: me.id, action: 'ACCOUNT_DEACTIVATED', entityType: 'User', entityId: me.id });
    return { status: 'DEACTIVATED' };
  }

  // Erasure is logged and handled by staff, because financial records must
  // be kept for the legal and funder retention period.
  async requestErasure(me: SessionUser, reason?: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (u.erasureRequestedAt) return { requestedAt: u.erasureRequestedAt };
    const now = this.clock.now();
    await this.prisma.user.update({ where: { id: me.id }, data: { erasureRequestedAt: now } });
    const ref = await this.sequence.next('ticket', 'TODT');
    await this.prisma.ticket.create({
      data: { ref, requesterId: me.id, createdById: me.id, source: 'APP', category: 'ACCOUNT', subject: 'Request to erase personal data', description: reason || 'The user asked for their personal data to be erased.' },
    });
    await this.audit.log({ actorId: me.id, action: 'ERASURE_REQUESTED', entityType: 'User', entityId: me.id, after: { ticket: ref } });
    await this.notifications.notifyRole(['PLATFORM_ADMIN', 'SUPER_ADMIN'], 'Erasure request', `Ticket ${ref}`, '/console/tickets');
    return { requestedAt: now, ticket: ref };
  }
}
