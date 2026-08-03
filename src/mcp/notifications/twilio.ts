import type { NotificationMessage, NotificationPort } from "./port.js";

export interface TwilioNotifierConfig {
  accountSid: string;
  authToken: string;
  /** Sender number (the same Twilio number already used for RTU SMS), E.164. */
  from: string;
}

/**
 * Real SMS notification adapter — calls the Twilio Messages API directly
 * (fetch, no SDK), same account/number as `TwilioSmsGateway`, but a
 * deliberately separate code path: `TwilioSmsGateway` is reserved for RTU
 * control traffic (dispatch + inbound-poll wiring), this is for messages to
 * humans (owner invitations today). Only handles the `SMS` channel; any other
 * channel is a caller error (route it through `RoutingNotifier` instead).
 */
export class TwilioNotifier implements NotificationPort {
  constructor(private readonly config: TwilioNotifierConfig) {}

  async notify(message: NotificationMessage): Promise<void> {
    if (message.channel !== "SMS") {
      throw new Error(`TwilioNotifier only handles the SMS channel, got: ${message.channel}`);
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");
    const body = message.title ? `${message.title}\n${message.body}` : message.body;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: message.to, From: this.config.from, Body: body }),
    });
    if (!res.ok) {
      throw new Error(`Twilio SMS notification failed: ${await res.text()}`);
    }
  }
}
