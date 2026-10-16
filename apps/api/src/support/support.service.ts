import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { hasRole, isStaff, SessionUser } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { ParametersService } from '../common/parameters.service';
import { normalisePhone } from '../common/phone';
import { PrismaService } from '../common/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { addWorkingDays } from '../common/working-days';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';

export const CATEGORIES = ['ACCOUNT', 'VERIFICATION', 'PAYMENT', 'ASSIGNMENT', 'TECHNICAL', 'ACCOMMODATION', 'FEEDBACK', 'OTHER'];
export const SAFEGUARDING_TYPES = ['HARASSMENT', 'EXPLOITATION', 'DISCRIMINATION', 'FRAUD'];

// Helpdesk (FR-SUP-01) and the confidential channel for harassment,
// exploitation, discrimination or fraud (FR-SUP-02, FR-SUP-03). Confidential
// cases are visible only to the reporter and to designated staff.
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly params: ParametersService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly clock: ClockService,
  ) {}

  private isAgent(me: SessionUser) {
    return isStaff(me.roles) && me.mfa && hasRole(me, 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN');
  }

  private async designated(me: SessionUser) {
    if (!this.isAgent(me)) return false;
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    return u.safeguardingDesignated;
  }

  async create(
    me: SessionUser,
    input: { category: string; subject: string; description: string; source?: string; requesterPhone?: string; assignmentId?: string; fileIds?: string[] },
  ) {
    if (!CATEGORIES.includes(input.category)) throw fail.bad('BAD_CATEGORY', 'Choose a category.');
    let requesterId: string | null = me.id;
    let source = 'APP';
    if (this.isAgent(me) && input.source && input.source !== 'APP') {
      if (!['CALL_LINE', 'ASSISTED_DESK'].includes(input.source)) throw fail.bad('BAD_SOURCE', 'Unknown source.');
      source = input.source;
      requesterId = null;
      if (input.requesterPhone) {
        const u = await this.prisma.user.findUnique({ where: { phone: normalisePhone(input.requesterPhone) } });
        requesterId = u?.id ?? null;
      }
    }
    const ref = await this.sequence.next('ticket', 'TODT');
    const t = await this.prisma.ticket.create({
      data: { ref, requesterId, createdById: me.id, source, category: input.category, subject: input.subject, description: input.description, assignmentId: input.assignmentId, ownerId: source !== 'APP' ? me.id : null },
    });
    if (input.fileIds?.length) await this.files.link(me.id, input.fileIds, 'TICKET', t.id);
    await this.audit.log({ actorId: me.id, action: 'TICKET_CREATED', entityType: 'Ticket', entityId: t.id, after: { ref, category: input.category, source } });
    if (source === 'APP') await this.notifications.notifyRole(['SUPPORT_AGENT'], `New ticket ${ref}`, input.subject, `/console/tickets/${t.id}`);
    return t;
  }

  async report(me: SessionUser, input: { type: string; description: string; assignmentId?: string; fileIds?: string[] }) {
    if (!SAFEGUARDING_TYPES.includes(input.type)) throw fail.bad('BAD_TYPE', 'Choose what you are reporting.');
    const days = await this.params.get<number>('MANUAL_REVIEW_TARGET_WORKING_DAYS');
    const ackBy = addWorkingDays(this.clock.now(), days, await this.params.holidays());
    const ref = await this.sequence.next('case', 'TODC');
    const t = await this.prisma.ticket.create({
      data: { ref, requesterId: me.id, createdById: me.id, source: 'APP', category: 'SAFEGUARDING', subject: `Confidential report: ${input.type.toLowerCase()}`, description: input.description, confidential: true, safeguardingType: input.type, acknowledgeBy: ackBy, assignmentId: input.assignmentId },
    });
    if (input.fileIds?.length) await this.files.link(me.id, input.fileIds, 'TICKET', t.id);
    // The audit log records that a case exists, not its content.
    await this.audit.log({ actorId: me.id, action: 'SAFEGUARDING_CASE_OPENED', entityType: 'Ticket', entityId: t.id, after: { ref, type: input.type } });
    const staff = await this.prisma.user.findMany({ where: { status: 'ACTIVE', safeguardingDesignated: true }, select: { id: true } });
    for (const s of staff) await this.notifications.notify(s.id, 'STAFF_ALERT', { subject: `Confidential case ${ref}`, detail: `Acknowledge by ${ackBy.toISOString().slice(0, 10)}.` }, { sms: true, link: `/console/tickets/${t.id}` });
    return { id: t.id, ref, acknowledgeBy: ackBy };
  }

  async list(me: SessionUser, q: { status?: string; confidential?: string; mine?: string }) {
    if (!this.isAgent(me) || q.mine) {
      return this.prisma.ticket.findMany({ where: { requesterId: me.id }, orderBy: { createdAt: 'desc' }, take: 100 });
    }
    const canSeeConfidential = await this.designated(me);
    const where: Prisma.TicketWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(canSeeConfidential ? (q.confidential === 'true' ? { confidential: true } : q.confidential === 'false' ? { confidential: false } : {}) : { confidential: false }),
    };
    const rows = await this.prisma.ticket.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 });
    const now = this.clock.now();
    return rows.map((t) => ({ ...t, ageHours: Math.round((now.getTime() - t.createdAt.getTime()) / 3600_000), ackOverdue: !!t.acknowledgeBy && !t.acknowledgedAt && t.acknowledgeBy < now }));
  }

  async get(me: SessionUser, id: string) {
    const t = await this.prisma.ticket.findUnique({ where: { id }, include: { updates: { orderBy: { at: 'asc' } } } });
    if (!t) throw fail.notFound('Ticket');
    const own = t.requesterId === me.id;
    if (t.confidential && !own && !(await this.designated(me))) throw fail.notFound('Ticket');
    if (!own && !this.isAgent(me)) throw fail.notFound('Ticket');
    const files = await this.prisma.fileObject.findMany({ where: { linkedType: 'TICKET', linkedId: id }, select: { id: true, name: true, size: true } });
    return { ...t, updates: own && !this.isAgent(me) ? t.updates.filter((u) => !u.internal) : t.updates, files };
  }

  async update(me: SessionUser, id: string, input: { status?: string; ownerId?: string; body?: string; internal?: boolean; outcome?: string }) {
    const t = await this.prisma.ticket.findUnique({ where: { id } });
    if (!t) throw fail.notFound('Ticket');
    const own = t.requesterId === me.id;
    const agent = this.isAgent(me);
    if (t.confidential && !(await this.designated(me)) && !own) throw fail.notFound('Ticket');
    if (!agent && !own) throw fail.notFound('Ticket');
    const now = this.clock.now();
    const data: Prisma.TicketUpdateInput = {};
    if (agent) {
      if (input.status) {
        if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(input.status)) throw fail.bad('BAD_STATUS', 'Unknown status.');
        data.status = input.status;
        if (input.status === 'RESOLVED' || input.status === 'CLOSED') {
          // Safeguarding cases close only with a documented outcome (FR-SUP-03).
          if (t.confidential && !input.outcome && !t.outcome) throw fail.bad('OUTCOME_REQUIRED', 'Record the outcome before closing a confidential case.');
          data.resolvedAt = t.resolvedAt ?? now;
        }
      }
      if (input.ownerId) data.ownerId = input.ownerId;
      if (input.outcome) data.outcome = input.outcome;
      if (!t.ownerId && !input.ownerId) data.ownerId = me.id;
    }
    await this.prisma.ticket.update({ where: { id }, data });
    if (input.body) await this.prisma.ticketUpdate.create({ data: { ticketId: id, authorId: me.id, body: input.body, internal: agent && !!input.internal } });
    await this.audit.log({ actorId: me.id, action: 'TICKET_UPDATED', entityType: 'Ticket', entityId: id, before: { status: t.status }, after: { status: input.status, owner: input.ownerId, hasNote: !!input.body } });
    if (agent && t.requesterId && input.body && !input.internal) await this.notifications.notify(t.requesterId, 'TICKET_UPDATE', { ref: t.ref }, { link: `/help/${id}` });
    return this.get(me, id);
  }

  async acknowledge(me: SessionUser, id: string) {
    const t = await this.prisma.ticket.findUnique({ where: { id } });
    if (!t || !t.confidential || !(await this.designated(me))) throw fail.notFound('Case');
    if (t.acknowledgedAt) return t;
    const updated = await this.prisma.ticket.update({ where: { id }, data: { acknowledgedAt: this.clock.now(), ownerId: t.ownerId ?? me.id, status: 'IN_PROGRESS' } });
    await this.audit.log({ actorId: me.id, action: 'SAFEGUARDING_CASE_ACKNOWLEDGED', entityType: 'Ticket', entityId: id });
    if (t.requesterId) await this.notifications.notify(t.requesterId, 'CASE_ACKNOWLEDGED', { ref: t.ref }, { sms: true, link: `/help/${id}` });
    return updated;
  }

  // Scheduled: alert when a confidential case is close to or past its acknowledgement target.
  async processAcknowledgements() {
    const now = this.clock.now();
    const overdue = await this.prisma.ticket.findMany({ where: { confidential: true, acknowledgedAt: null, acknowledgeBy: { lt: now } } });
    for (const t of overdue) {
      const already = await this.prisma.notification.count({ where: { type: 'STAFF_ALERT', title: `Overdue acknowledgement ${t.ref}` } });
      if (already) continue;
      const staff = await this.prisma.user.findMany({ where: { status: 'ACTIVE', safeguardingDesignated: true }, select: { id: true } });
      for (const s of staff) await this.notifications.notify(s.id, 'STAFF_ALERT', { subject: `Overdue acknowledgement ${t.ref}`, detail: 'This confidential case has not been acknowledged within two working days.' }, { sms: true, link: `/console/tickets/${t.id}` });
    }
  }
}
