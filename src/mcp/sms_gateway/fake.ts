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
 * Records every outbound message and, via `replyFn`, simulates how a real
 * RTU5024 answers a given command — the simulated reply is queued in an internal
 * inbox immediately, modeling a device that answers right away. `pollReply` then
 * consumes it. This validates the decoupled dispatch/confirm cycle (and the
 * single-tick happy path) without hardware.
 */
export class FakeSmsGateway implements SmsGatewayPort {
  readonly outbox: SentSms[] = [];
  private readonly inbox: SmsReply[] = [];

  constructor(
    /** Produce the device's reply body for a command, or null to simulate no reply. */
    private readonly replyFn: (to: string, body: string) => string | null = () => null,
  ) {}

  async send(to: string, body: string): Promise<SmsSendResult> {
    this.outbox.push({ to, body, at: nowIso() });
    const reply = this.replyFn(to, body);
    if (reply !== null) {
      // The device at `to` answers from its own number.
      this.inbox.push({ from: to, body: reply, receivedAt: nowIso() });
    }
    return { messageId: `fake-${this.outbox.length}`, status: "sent" };
  }

  async pollReply(from: string, sinceIso: string): Promise<SmsReply | null> {
    const idx = this.inbox.findIndex(
      (r) => r.from === from && r.receivedAt >= sinceIso,
    );
    if (idx === -1) return null;
    const [reply] = this.inbox.splice(idx, 1); // consume
    return reply ?? null;
  }
}
