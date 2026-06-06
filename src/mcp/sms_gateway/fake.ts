import { nowIso } from "../../shared/utils.js";
import type { SmsGatewayPort, SmsReply, SmsSendResult } from "./port.js";

export interface SentSms {
  to: string;
  body: string;
  at: string;
}

/**
 * Deterministic SMS gateway for tests and the local demo.
 *
 * Records every outbound message and lets the test supply a `replyFn` that
 * simulates how a real RTU5024 would answer a given command. This is how we
 * validate the full PERMISO -> ACTIVACION -> DISPOSITIVO cycle without hardware.
 */
export class FakeSmsGateway implements SmsGatewayPort {
  readonly outbox: SentSms[] = [];

  constructor(
    /** Produce the device's reply body for a command, or null to simulate no reply. */
    private readonly replyFn: (to: string, body: string) => string | null = () => null,
  ) {}

  async send(to: string, body: string): Promise<SmsSendResult> {
    this.outbox.push({ to, body, at: nowIso() });
    return { messageId: `fake-${this.outbox.length}`, status: "sent" };
  }

  async sendAndAwaitReply(to: string, body: string): Promise<SmsReply | null> {
    await this.send(to, body);
    const reply = this.replyFn(to, body);
    if (reply === null) return null;
    return { from: to, body: reply, receivedAt: nowIso() };
  }
}
