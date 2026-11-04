import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { ClockService } from '../common/clock.service';
import { fail } from '../common/errors';
import { formatEtb } from '../common/money';
import { normalisePhone } from '../common/phone';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';

// FR-ADM-07: live transactions are limited to cohorts approved by the Project
// Director (a super administrator), each with its own value limit and
// pay-later eligibility. Every approval is logged.
@Injectable()
export class CohortsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly params: ParametersService,
  ) {}

  list() {
    return this.prisma.cohort.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { members: true } } } });
  }

  async get(id: string) {
    const c = await this.prisma.cohort.findUnique({
      where: { id },
      include: { members: { select: { id: true, displayName: true, phone: true, roles: true, identityStatus: true } } },
    });
    if (!c) throw fail.notFound('Cohort');
    return c;
  }

  async create(me: { id: string }, dto: { name: string; description?: string; valueLimit?: number | null; payLaterEligible?: boolean }) {
    if (await this.prisma.cohort.findUnique({ where: { name: dto.name } })) throw fail.conflict('COHORT_EXISTS', 'A cohort with this name already exists.');
    const c = await this.prisma.cohort.create({ data: { name: dto.name, description: dto.description, valueLimit: dto.valueLimit ?? null, payLaterEligible: dto.payLaterEligible ?? false, createdById: me.id } });
    await this.audit.log({ actorId: me.id, action: 'COHORT_CREATED', entityType: 'Cohort', entityId: c.id, after: { name: c.name, valueLimit: c.valueLimit, payLaterEligible: c.payLaterEligible } });
    return c;
  }

  async approve(me: { id: string }, id: string, note?: string) {
    const c = await this.get(id);
    if (c.status === 'APPROVED') return c;
    if (c.status === 'CLOSED') throw fail.conflict('COHORT_CLOSED', 'This cohort is closed.');
    const updated = await this.prisma.cohort.update({ where: { id }, data: { status: 'APPROVED', approvedById: me.id, approvedAt: this.clock.now() } });
    await this.audit.log({ actorId: me.id, action: 'COHORT_APPROVED', entityType: 'Cohort', entityId: id, after: { name: c.name, members: c.members.length, valueLimit: c.valueLimit, payLaterEligible: c.payLaterEligible, note } });
    return updated;
  }

  async close(me: { id: string }, id: string, reason: string) {
    await this.get(id);
    const updated = await this.prisma.cohort.update({ where: { id }, data: { status: 'CLOSED' } });
    await this.audit.log({ actorId: me.id, action: 'COHORT_CLOSED', entityType: 'Cohort', entityId: id, after: { reason } });
    return updated;
  }

  async setMembers(me: { id: string }, id: string, add: string[], remove: string[], addPhones: string[] = []) {
    const c = await this.get(id);
    if (c.status === 'CLOSED') throw fail.conflict('COHORT_CLOSED', 'This cohort is closed.');
    if (addPhones.length) {
      const phones = addPhones.map((p) => normalisePhone(p));
      const found = await this.prisma.user.findMany({ where: { phone: { in: phones } }, select: { id: true, phone: true } });
      const missing = phones.filter((p) => !found.some((f) => f.phone === p));
      if (missing.length) throw fail.bad('UNKNOWN_PHONE', `No account found for ${missing.join(', ')}.`);
      add = [...add, ...found.map((f) => f.id)];
    }
    if (add.length) await this.prisma.user.updateMany({ where: { id: { in: add } }, data: { cohortId: id } });
    if (remove.length) await this.prisma.user.updateMany({ where: { id: { in: remove }, cohortId: id }, data: { cohortId: null } });
    await this.audit.log({ actorId: me.id, action: 'COHORT_MEMBERS_CHANGED', entityType: 'Cohort', entityId: id, after: { added: add, removed: remove } });
    return this.get(id);
  }

  // Called before a client is asked to pay: both parties must belong to an
  // approved cohort, and the amount must be within the cohort's limit.
  async assertLiveAllowed(clientId: string, talentId: string, amount: number) {
    if (!(await this.params.get<boolean>('COHORT_CONTROL_ENABLED'))) return;
    const users = await this.prisma.user.findMany({ where: { id: { in: [clientId, talentId] } }, include: { cohort: true } });
    for (const u of users) {
      if (!u.cohort || u.cohort.status !== 'APPROVED') {
        throw fail.forbidden('COHORT_NOT_APPROVED', u.id === clientId ? 'Your account is not yet in an approved pilot group, so you cannot pay for work yet. ToD will contact you.' : 'This talent is not yet in an approved pilot group. Choose another proposal.');
      }
      if (u.cohort.valueLimit !== null && amount > u.cohort.valueLimit) {
        throw fail.bad('VALUE_LIMIT', `During the pilot this group allows assignments up to ${formatEtb(u.cohort.valueLimit)}.`);
      }
    }
  }
}
