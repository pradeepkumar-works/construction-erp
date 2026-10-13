import { Injectable, Logger } from '@nestjs/common';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Sends notifications through the Expo push service (https://docs.expo.dev/push-notifications/sending-notifications/).
 * No SDK: a single HTTPS call with the native fetch. Set EXPO_ACCESS_TOKEN when the Expo project enforces push security.
 * Returns the tokens Expo reports as no longer registered so the caller can forget them.
 */
@Injectable()
export class ExpoPushService {
  private readonly log = new Logger(ExpoPushService.name);
  private readonly endpoint = process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send';
  private readonly accessToken = process.env.EXPO_ACCESS_TOKEN;

  static isExpoToken(token: string): boolean {
    return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
  }

  get enabled(): boolean {
    return process.env.PUSH_DISABLED !== 'true';
  }

  async send(messages: PushMessage[]): Promise<{ sent: number; invalidTokens: string[] }> {
    const valid = messages.filter((m) => ExpoPushService.isExpoToken(m.to));
    if (!this.enabled || valid.length === 0) return { sent: 0, invalidTokens: [] };
    const invalidTokens: string[] = [];
    let sent = 0;
    for (let i = 0; i < valid.length; i += 100) {
      const chunk = valid.slice(i, i + 100).map((m) => ({ ...m, sound: 'default', channelId: 'default', priority: 'high' }));
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
          },
          body: JSON.stringify(chunk),
        });
        if (!res.ok) {
          this.log.warn(`Expo push service responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
          continue;
        }
        const json = (await res.json()) as { data?: ExpoTicket[] };
        (json.data ?? []).forEach((ticket, idx) => {
          if (ticket.status === 'ok') sent++;
          else if (ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(chunk[idx].to);
          else this.log.warn(`Push to ${chunk[idx].to} failed: ${ticket.message ?? ticket.details?.error ?? 'unknown error'}`);
        });
      } catch (e) {
        this.log.warn(`Expo push request failed: ${(e as Error).message}`);
      }
    }
    return { sent, invalidTokens };
  }
}
