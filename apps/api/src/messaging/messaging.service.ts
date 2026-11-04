import { Injectable } from '@nestjs/common';
import { hasRole, isStaff, SessionUser } from '../common/auth.decorators';
import { fail } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { maskContacts } from './masking';

export const OFF_PLATFORM_NOTICE = {
  en: 'Keep all communication here. Messages, calls or chats outside the platform are not accepted as evidence in a dispute.',
  am: 'ሁሉንም ግንኙነት እዚህ ያድርጉ። ከመድረኩ ውጭ የሚደረጉ መልእክቶች፣ ጥሪዎች ወይም ውይይቶች በቅሬታ ጊዜ እንደ ማስረጃ አይቆጠሩም።',
};

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService, private readonly notifications: NotificationsService) {}

  // Resolve which thread the user may access. A client passes the talent they
  // are talking to; a talent always uses their own thread.
  private async access(me: SessionUser, assignmentId: string, talentId?: string) {
    const a = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!a) throw fail.notFound('Assignment');
    if (a.clientId === me.id) {
      const t = talentId ?? a.talentId;
      if (!t) throw fail.bad('TALENT_REQUIRED', 'Choose which talent to message.');
      const allowed = t === a.talentId || (a.status === 'OPEN' && (await this.prisma.invitation.findUnique({ where: { assignmentId_talentId: { assignmentId, talentId: t } } })));
      if (!allowed) throw fail.forbidden('NO_THREAD', 'You can message invited talents while the assignment is open, and the chosen talent afterwards.');
      return { a, threadTalentId: t, counterpart: t, role: 'CLIENT' as const };
    }
    const inv = await this.prisma.invitation.findUnique({ where: { assignmentId_talentId: { assignmentId, talentId: me.id } } });
    if (a.talentId === me.id || (inv && a.status === 'OPEN')) return { a, threadTalentId: me.id, counterpart: a.clientId, role: 'TALENT' as const };
    if (isStaff(me.roles) && me.mfa && hasRole(me, 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'AUDITOR')) {
      return { a, threadTalentId: talentId ?? a.talentId ?? '', counterpart: null, role: 'STAFF' as const };
    }
    throw fail.notFound('Assignment');
  }

  async list(me: SessionUser, assignmentId: string, talentId?: string) {
    const { a, threadTalentId } = await this.access(me, assignmentId, talentId);
    const messages = await this.prisma.message.findMany({ where: { assignmentId, threadTalentId }, orderBy: { createdAt: 'asc' }, take: 500 });
    const files = await this.prisma.fileObject.findMany({ where: { id: { in: messages.flatMap((m) => m.fileIds) } }, select: { id: true, name: true, size: true, mime: true } });
    return { assignmentId, threadTalentId, contactsHidden: !a.fundedAt, notice: OFF_PLATFORM_NOTICE, messages, files };
  }

  async send(me: SessionUser, assignmentId: string, body: string, fileIds: string[] = [], talentId?: string) {
    const { a, threadTalentId, counterpart, role } = await this.access(me, assignmentId, talentId);
    if (role === 'STAFF') throw fail.forbidden('STAFF_READ_ONLY', 'Staff can read but not post in a party thread. Use the dispute or ticket instead.');
    if (['CLOSED', 'CANCELLED'].includes(a.status)) throw fail.conflict('THREAD_CLOSED', 'This conversation is closed.');
    if (fileIds.length) await this.files.link(me.id, fileIds, 'ASSIGNMENT', assignmentId);
    const { text, masked } = a.fundedAt ? { text: body, masked: false } : maskContacts(body);
    const msg = await this.prisma.message.create({ data: { assignmentId, threadTalentId, senderId: me.id, body: text, fileIds, masked } });
    if (counterpart) await this.notifications.notify(counterpart, 'NEW_MESSAGE', { title: a.title }, { link: `/assignments/${assignmentId}#messages` });
    return msg;
  }

  // Threads a client has on one assignment (one per invited talent).
  async threads(me: SessionUser, assignmentId: string) {
    const a = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!a || a.clientId !== me.id) throw fail.notFound('Assignment');
    const groups = await this.prisma.message.groupBy({ by: ['threadTalentId'], where: { assignmentId }, _count: true, _max: { createdAt: true } });
    // Every invited talent gets a thread, even before the first message, with their name.
    const invited = await this.prisma.invitation.findMany({ where: { assignmentId }, select: { talentId: true } });
    const ids = [...new Set([...invited.map((i) => i.talentId), ...groups.map((g) => g.threadTalentId), ...(a.talentId ? [a.talentId] : [])])];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, verifiedName: true } });
    return ids
      .map((talentId) => {
        const g = groups.find((x) => x.threadTalentId === talentId);
        const u = users.find((x) => x.id === talentId);
        return { talentId, name: u?.verifiedName ?? u?.displayName ?? null, count: g?._count ?? 0, lastAt: g?._max.createdAt ?? null };
      })
      .sort((x, y) => (y.lastAt?.getTime() ?? 0) - (x.lastAt?.getTime() ?? 0));
  }
}
