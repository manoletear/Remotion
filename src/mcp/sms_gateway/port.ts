/**
 * SMS Gateway port.
 *
 * The RTU is programmed over SMS, so every RTU operation ultimately becomes one
 * outbound SMS to the device SIM plus (optionally) an awaited reply SMS. A
 * concrete adapter wraps a provider such as Twilio.
 */

export interface SmsSendResult {
  /** Provider message id. */
  messageId: string;
  /** Provider-reported delivery status at send time. */
  status: "queued" | "sent" | "failed";
}

export interface SmsReply {
  from: string;
  body: string;
  receivedAt: string;
}

export interface SmsGatewayPort {
  /** Send an SMS to a destination number. */
  send(to: string, body: string): Promise<SmsSendResult>;

  /**
   * Send an SMS and wait for the device to reply within `timeoutMs`.
   * Returns `null` on timeout. Used for RTU commands that confirm via reply
   * (add/delete/query). Implementations correlate the reply by sender number.
   */
  sendAndAwaitReply(
    to: string,
    body: string,
    timeoutMs: number,
  ): Promise<SmsReply | null>;
}
