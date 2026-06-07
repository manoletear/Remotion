import type { Invitation } from "../domain/invitation/index.js";
import { NOTIFY_TIMEOUT_MS } from "../shared/constants.js";
import type { SkillContext } from "./context.js";

/**
 * Best-effort visitor notification. Notifications are non-critical, so this
 * never throws — a failed push/WhatsApp must not break the access lifecycle or
 * leave an invitation half-synced. Failures are swallowed (the audit trail and
 * RTU_SYNC_* events remain the source of truth for what actually happened).
 *
 * The wait is also time-bounded: a notifier that hangs must not stall the
 * cancel/expire/activate flows it is attached to.
 */
export async function notifyVisitor(
  ctx: SkillContext,
  invitation: Invitation,
  title: string,
  body: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ctx.notifier.notify({
        channel: "WHATSAPP",
        to: invitation.visitante_telefono,
        title,
        body,
        data: { invitationId: invitation.id },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("notify timeout")),
          NOTIFY_TIMEOUT_MS,
        );
      }),
    ]);
  } catch {
    // Intentionally ignored: notifications are best-effort.
  } finally {
    if (timer) clearTimeout(timer);
  }
}
