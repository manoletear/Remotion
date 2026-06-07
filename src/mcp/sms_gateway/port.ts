/**
 * SMS Gateway port.
 *
 * The RTU is programmed over SMS, so every RTU operation becomes one outbound
 * SMS to the device SIM; the device's confirmation arrives later as a separate
 * inbound SMS. Dispatch (`send`) and confirmation (`pollReply`) are decoupled so
 * the lifecycle reconciler never blocks waiting for a reply. A concrete adapter
 * wraps a provider such as Twilio.
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
  /** Send an SMS to a destination number (fire-and-forget dispatch). */
  send(to: string, body: string): Promise<SmsSendResult>;

  /**
   * Non-blocking: consume the oldest device reply from `from` received at or
   * after `sinceIso`, or `null` if none has arrived yet. The reconciler calls
   * this to confirm an in-flight RTU command WITHOUT waiting — a reply that has
   * not arrived is simply picked up on a later tick. Implementations correlate
   * by sender number and must consume the reply they return (not hand it out
   * twice).
   */
  pollReply(from: string, sinceIso: string): Promise<SmsReply | null>;
}
