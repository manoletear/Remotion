import type { NotificationMessage, NotificationPort } from "./port.js";

export interface ResendNotifierConfig {
  /** Optional on purpose — no email account is required for this system to
   *  function (SMS alone satisfies "at least one channel"). When unset,
   *  `notify()` degrades to a console log instead of throwing. */
  apiKey?: string;
  from: string;
}

/**
 * Real email notification adapter — calls Resend's API directly (fetch, no
 * SDK, consistent with this repo's Twilio-via-fetch convention). Only handles
 * the `EMAIL` channel; any other channel is a caller error (route it through
 * `RoutingNotifier` instead).
 */
export class ResendNotifier implements NotificationPort {
  constructor(private readonly config: ResendNotifierConfig) {}

  async notify(message: NotificationMessage): Promise<void> {
    if (message.channel !== "EMAIL") {
      throw new Error(`ResendNotifier only handles the EMAIL channel, got: ${message.channel}`);
    }
    if (!this.config.apiKey) {
      // eslint-disable-next-line no-console
      console.log(`[notify:EMAIL, no RESEND_API_KEY set] -> ${message.to}: ${message.title}`);
      return;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to: message.to,
        subject: message.title,
        text: message.body,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend email notification failed: ${await res.text()}`);
    }
  }
}
