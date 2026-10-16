import { Injectable } from '@nestjs/common';
import { ClockService } from '../common/clock.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// A talent profile is visible to clients only when vetting is approved and
// identity is verified (or provisionally verified).
@Injectable()
export class PublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly clock: ClockService,
  ) {}

  async refresh(userId: string): Promise<boolean> {
    const profile = await this.prisma.talentProfile.findUnique({ where: { userId }, include: { user: true } });
    if (!profile) return false;
    const eligible =
      profile.vettingStatus === 'APPROVED' &&
      ['VERIFIED', 'PROVISIONAL'].includes(profile.user.identityStatus) &&
      profile.user.status === 'ACTIVE';
    if (eligible && !profile.publishedAt) {
      await this.prisma.talentProfile.update({ where: { id: profile.id }, data: { publishedAt: this.clock.now() } });
      await this.notifications.notify(userId, 'PROFILE_PUBLISHED', {}, { sms: true, link: '/talent' });
    } else if (!eligible && profile.publishedAt) {
      await this.prisma.talentProfile.update({ where: { id: profile.id }, data: { publishedAt: null } });
    }
    return eligible;
  }
}
