import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ConsoleEmail, OutboundChannel, TelegramChannel, smsChannel } from './channels';
import { render } from './templates';

export interface NotifyOptions {
  link?: string;
  sms?: boolean; // key events also go by SMS (FR-MSG-02)
}

@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');
  private sms: OutboundChannel = smsChannel();
  private telegram = new TelegramChannel();
  private email = new ConsoleEmail();

  constructor(private readonly prisma: PrismaService) {}

  async notify(userId: string, type: string, vars: Record<string, string | number>, opts: NotifyOptions = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const { title, body } = render(type, user.language, vars);
    const channels = ['IN_APP'];
    if (opts.sms && user.notifyChannels.includes('SMS')) {
      await this.sendSms(user.phone, `${title}: ${body}`);
      channels.push('SMS');
    }
    if (user.notifyChannels.includes('TELEGRAM') && user.telegramChatId) {
      await this.dispatch(this.telegram, 'TELEGRAM', user.telegramChatId, `${title}\n${body}`);
      channels.push('TELEGRAM');
    }
    if (user.notifyChannels.includes('EMAIL') && user.email) {
      await this.dispatch(this.email, 'EMAIL', user.email, `${title}\n${body}`);
      channels.push('EMAIL');
    }
    await this.prisma.notification.create({
      data: { userId, type, title, body, link: opts.link, channels },
    });
  }

  // Notify every active user holding one of these staff roles.
  async notifyRole(roles: string[], subject: string, detail: string, link?: string) {
    const staff = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { hasSome: roles as any } },
      select: { id: true },
    });
    for (const s of staff) await this.notify(s.id, 'STAFF_ALERT', { subject, detail }, { link });
  }

  async sendSms(phone: string, body: string) {
    return this.dispatch(this.sms, 'SMS', phone, body);
  }

  private async dispatch(channel: OutboundChannel, kind: string, to: string, body: string) {
    const res = await channel.send(to, body);
    await this.prisma.outboundMessage.create({
      data: {
        channel: kind,
        to,
        // One-time codes are not stored in clear text.
        body: body.replace(/\b\d{6}\b/g, '******'),
        status: res.ok ? 'SENT' : 'FAILED',
        provider: channel.name,
        error: res.error,
      },
    });
    if (!res.ok) this.log.warn(`${kind} to ${to} failed: ${res.error}`);
    return res;
  }
}
