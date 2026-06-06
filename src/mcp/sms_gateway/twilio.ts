import { RTU_ACK_TIMEOUT_MS } from "../../shared/constants.js";
import type { SmsGatewayPort, SmsReply, SmsSendResult } from "./port.js";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Sender number (the gateway SIM/long-code), E.164. */
  from: string;
  /**
   * Resolve an inbound reply from the device. Inbound SMS arrives via a Twilio
   * webhook out of band, so the lifecycle layer must persist replies somewhere
   * (e.g. a Supabase `inbound_sms` table) and expose them here. Returns the
   * reply body once available, or null on timeout.
   */
  awaitInbound?: (from: string, sinceIso: string, timeoutMs: number) => Promise<string | null>;
}

/**
 * Twilio-backed SMS gateway adapter.
 *
 * `send` calls the Twilio Messages REST API directly via fetch (no SDK needed).
 * `sendAndAwaitReply` sends, then defers to {@link TwilioConfig.awaitInbound} to
 * correlate the device's reply — because inbound delivery is webhook-driven and
 * cannot be awaited inline without an external store.
 */
export class TwilioSmsGateway implements SmsGatewayPort {
  constructor(private readonly config: TwilioConfig) {}

  async send(to: string, body: string): Promise<SmsSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: this.config.from, Body: body }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { messageId: "", status: "failed", ...{ detail } } as SmsSendResult;
    }
    const json = (await res.json()) as { sid: string; status: string };
    return {
      messageId: json.sid,
      status: json.status === "failed" ? "failed" : "sent",
    };
  }

  async sendAndAwaitReply(
    to: string,
    body: string,
    timeoutMs: number = RTU_ACK_TIMEOUT_MS,
  ): Promise<SmsReply | null> {
    const sentAt = new Date().toISOString();
    const sent = await this.send(to, body);
    if (sent.status === "failed") return null;
    if (!this.config.awaitInbound) return null;

    const reply = await this.config.awaitInbound(to, sentAt, timeoutMs);
    if (reply === null) return null;
    return { from: to, body: reply, receivedAt: new Date().toISOString() };
  }
}
