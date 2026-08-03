/**
 * Notification port.
 *
 * Out-of-band messages to residents/visitors over push, WhatsApp or email.
 * Distinct from the SMS Gateway, which is reserved for RTU control traffic.
 */

export type NotificationChannel = "PUSH" | "WHATSAPP" | "EMAIL" | "SMS";

export interface NotificationMessage {
  channel: NotificationChannel;
  /** Recipient address: device token, phone, or email depending on channel. */
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface NotificationPort {
  notify(message: NotificationMessage): Promise<void>;
}
