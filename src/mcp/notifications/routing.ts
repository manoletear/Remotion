import type { NotificationMessage, NotificationPort } from "./port.js";

/**
 * Routes a notification to the adapter that actually handles its channel.
 * `SMS` and `EMAIL` go to real adapters (005); `WHATSAPP` and `PUSH` go to
 * whatever `fallback` is given — today, `ConsoleNotifier`, since real
 * WhatsApp/push delivery remain explicitly out of scope everywhere in this
 * system (existing visitor notifications included).
 */
export class RoutingNotifier implements NotificationPort {
  constructor(
    private readonly sms: NotificationPort,
    private readonly email: NotificationPort,
    private readonly fallback: NotificationPort,
  ) {}

  notify(message: NotificationMessage): Promise<void> {
    switch (message.channel) {
      case "SMS":
        return this.sms.notify(message);
      case "EMAIL":
        return this.email.notify(message);
      default:
        return this.fallback.notify(message);
    }
  }
}
