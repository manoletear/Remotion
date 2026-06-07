import { RTU_ACK_TIMEOUT_MS } from "../../shared/constants.js";
import type { SmsGatewayPort, SmsReply, SmsSendResult } from "./port.js";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Sender number (the gateway SIM/long-code), E.164. */
  from: string;
  /**
   * Non-blocking lookup of a device reply. Inbound SMS arrives via a Twilio
   * webhook out of band, so the deployment persists replies (e.g. a Supabase
   * `inbound_sms` table written by the webhook) and exposes the oldest unconsumed
   * reply from `from` at/after `sinceIso` here, consuming it. Returns the reply
   * body, or null if none has arrived yet.
   */
  pollInbound?: (from: string, sinceIso: string) => Promise<string | null>;
}

/**
 * Twilio-backed SMS gateway adapter.
 *
 * `send` calls the Twilio Messages REST API directly via fetch (no SDK needed).
 * `pollReply` defers to {@link TwilioConfig.pollInbound} to correlate the
 * device's reply — inbound delivery is webhook-driven, so the reconciler polls
 * the persisted replies on each tick instead of blocking.
 */
export class TwilioSmsGateway implements SmsGatewayPort {
  constructor(private readonly config: TwilioConfig) {}

  async send(to: string, body: string): Promise<SmsSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");

    // Bound the request so a stalled network can't hang lifecycle processing.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RTU_ACK_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: this.config.from, Body: body }),
        signal: controller.signal,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { messageId: "", status: "failed", ...{ detail } } as SmsSendResult;
    } finally {
      clearTimeout(timer);
    }
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

  async pollReply(from: string, sinceIso: string): Promise<SmsReply | null> {
    if (!this.config.pollInbound) return null;
    const body = await this.config.pollInbound(from, sinceIso);
    if (body === null) return null;
    return { from, body, receivedAt: new Date().toISOString() };
  }
}
