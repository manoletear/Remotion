import type { Device } from "../domain/device/index.js";
import { EntityType, EventType, InvitationStatus } from "../shared/enums.js";
import { auditEvent } from "../skills/audit_event.js";
import type { SkillContext } from "../skills/context.js";
import { buildQueryCommand } from "../skills/rtu/protocol.js";

/**
 * Dispatch the "list authorized numbers" query (AL#) to a device. Send-only,
 * like the rest of the RTU path: the device's list arrives later as a separate
 * inbound SMS, is parsed with `parseQueryReply`, and fed to
 * {@link reconcileDevicePhonebook} on a later tick.
 */
export async function requestPhonebookAudit(
  ctx: SkillContext,
  device: Device,
): Promise<void> {
  await ctx.sms.send(device.numero_sim, buildQueryCommand(device.password));
}

/**
 * Security guard. Compares the numbers a device reports as authorized against
 * the ones our records explain — permanent residents of the device's
 * condominium plus visitors loaded (or loading) on this device — and flags every
 * unexplained one with an RTU_SECURITY_RISK event.
 *
 * Deliberately does NOT remove orphans: a number programmed outside the app (a
 * manual SMS, an installer, a botched migration from the old Condogate) is a
 * signal for human review, not something to erase silently. Returns the orphans.
 */
export async function reconcileDevicePhonebook(
  ctx: SkillContext,
  device: Device,
  reportedNumbers: readonly string[],
): Promise<string[]> {
  const expected = new Set<string>();

  // Permanent residents across every property the device serves.
  const properties = await ctx.store.properties.listByCondominium(device.condominio_id);
  for (const property of properties) {
    for (const resident of await ctx.store.residents.listByProperty(property.id)) {
      expected.add(resident.telefono);
    }
  }

  // Visitors whose access is loaded — or being loaded — on this device.
  const loaded = [
    ...(await ctx.store.invitations.listByStatus(InvitationStatus.ACTIVE)),
    ...(await ctx.store.invitations.listByStatus(InvitationStatus.PENDING_SYNC)),
  ];
  for (const inv of loaded) {
    if (inv.dispositivo_id === device.id) expected.add(inv.visitante_telefono);
  }

  const orphans = [...new Set(reportedNumbers)].filter((n) => !expected.has(n));
  for (const phone of orphans) {
    await auditEvent(ctx, {
      tipo: EventType.RTU_SECURITY_RISK,
      entidad: EntityType.DEVICE,
      entidad_id: device.id,
      payload: {
        phone,
        reason: "authorized on device but no matching resident or invitation",
      },
    });
  }
  return orphans;
}
