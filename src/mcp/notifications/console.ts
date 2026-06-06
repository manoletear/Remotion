import type { NotificationMessage, NotificationPort } from "./port.js";

/** No-op notifier that logs to the console. Default for local/dev. */
export class ConsoleNotifier implements NotificationPort {
  readonly sent: NotificationMessage[] = [];

  async notify(message: NotificationMessage): Promise<void> {
    this.sent.push(message);
    // eslint-disable-next-line no-console
    console.log(`[notify:${message.channel}] -> ${message.to}: ${message.title}`);
  }
}
