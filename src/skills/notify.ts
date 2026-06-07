import type { Invitation } from "../domain/invitation/index.js";
import type { SkillContext } from "./context.js";

/**
 * Best-effort visitor notification. Notifications are non-critical, so this
 * never throws — a failed push/WhatsApp must not break the access lifecycle or
 * leave an invitation half-synced. Failures are swallowed (the audit trail and
 * RTU_SYNC_* events remain the source of truth for what actually happened).
 */
export async function notifyVisitor(
  ctx: SkillContext,
  invitation: Invitation,
  title: string,
  body: string,
): Promise<void> {
  try {
    await ctx.notifier.notify({
      channel: "WHATSAPP",
      to: invitation.visitante_telefono,
      title,
      body,
      data: { invitationId: invitation.id },
    });
  } catch {
    // Intentionally ignored: notifications are best-effort.
  }
}
