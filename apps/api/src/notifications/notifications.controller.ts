import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, SessionUser } from '../common/auth.decorators';
import { PrismaService } from '../common/prisma.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() me: SessionUser, @Query('unread') unread?: string) {
    const items = await this.prisma.notification.findMany({
      where: { userId: me.id, ...(unread ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const unreadCount = await this.prisma.notification.count({ where: { userId: me.id, readAt: null } });
    return { items, unreadCount };
  }

  @Post(':id/read')
  async read(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: me.id }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post('read-all')
  async readAll(@CurrentUser() me: SessionUser) {
    await this.prisma.notification.updateMany({ where: { userId: me.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // FR-MSG-03 notification language and channels.
  @Post('preferences')
  async prefs(@CurrentUser() me: SessionUser, @Body() body: { language?: 'en' | 'am'; channels?: string[]; email?: string; telegramChatId?: string }) {
    const allowed = ['IN_APP', 'SMS', 'TELEGRAM', 'EMAIL'];
    const channels = body.channels ? Array.from(new Set(['IN_APP', ...body.channels.filter((c) => allowed.includes(c))])) : undefined;
    const user = await this.prisma.user.update({
      where: { id: me.id },
      data: {
        language: body.language,
        notifyChannels: channels,
        email: body.email,
        telegramChatId: body.telegramChatId,
      },
    });
    return { language: user.language, channels: user.notifyChannels, email: user.email, telegramChatId: user.telegramChatId };
  }
}
