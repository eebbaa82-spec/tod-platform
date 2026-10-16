import { Logger } from '@nestjs/common';
import { config } from '../common/config';

// Outbound channel adapters (IF-05, IF-06). Each provider sits behind this
// interface so a gateway can be replaced without touching the rest of the code.
export interface OutboundChannel {
  readonly name: string;
  send(to: string, body: string): Promise<{ ok: boolean; providerRef?: string; error?: string }>;
}

export class ConsoleSms implements OutboundChannel {
  readonly name = 'console-sms';
  private log = new Logger('SMS');
  async send(to: string, body: string) {
    this.log.log(`to ${to}: ${body}`);
    return { ok: true };
  }
}

// AfroMessage (Ethiopian SMS gateway). Configure AFROMESSAGE_TOKEN and AFROMESSAGE_SENDER.
// Confirm the endpoint and parameters against the provider's current API documentation.
export class AfroMessageSms implements OutboundChannel {
  readonly name = 'afromessage';
  async send(to: string, body: string) {
    const token = process.env.AFROMESSAGE_TOKEN;
    if (!token) return { ok: false, error: 'AFROMESSAGE_TOKEN not set' };
    const url = new URL('https://api.afromessage.com/api/send');
    url.searchParams.set('to', to);
    url.searchParams.set('message', body);
    if (process.env.AFROMESSAGE_SENDER) url.searchParams.set('sender', process.env.AFROMESSAGE_SENDER);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const json: any = await res.json().catch(() => ({}));
      return res.ok && json.acknowledge === 'success'
        ? { ok: true, providerRef: json.response?.message_id }
        : { ok: false, error: JSON.stringify(json).slice(0, 500) };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }
}

// Telegram Bot API, for users who opted in and linked their chat.
export class TelegramChannel implements OutboundChannel {
  readonly name = 'telegram';
  async send(chatId: string, body: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: body }),
    }).catch((e) => ({ ok: false, statusText: String(e) }) as any);
    return res.ok ? { ok: true } : { ok: false, error: res.statusText };
  }
}

// Email is logged until an SMTP or API provider is chosen.
export class ConsoleEmail implements OutboundChannel {
  readonly name = 'console-email';
  private log = new Logger('Email');
  async send(to: string, body: string) {
    this.log.log(`to ${to}: ${body}`);
    return { ok: true };
  }
}

export function smsChannel(): OutboundChannel {
  return config.smsProvider === 'afromessage' ? new AfroMessageSms() : new ConsoleSms();
}
