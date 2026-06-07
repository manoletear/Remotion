/**
 * Local end-to-end demo of the PERMISO -> ACTIVACION -> DISPOSITIVO cycle.
 *
 * Wires the in-memory persistence, a fake SMS gateway that simulates how an
 * RTU5024 answers its commands, and the in-memory scheduler. Runs the full
 * happy path a resident would trigger:
 *   provision -> create invitation -> activate (RTU add) -> expire (RTU remove)
 *
 * Run with: `npm run demo`
 */
import { ConsoleNotifier } from "./mcp/notifications/console.js";
import { FakeSmsGateway } from "./mcp/sms_gateway/fake.js";
import { InMemoryScheduler } from "./mcp/scheduler/in_memory.js";
import { InMemoryDataStore } from "./mcp/supabase/in_memory.js";
import { tick } from "./orchestration/invitation_lifecycle.js";
import { makeContext } from "./skills/context.js";
import { createInvitation } from "./skills/create_invitation.js";
import {
  registerCondominium,
  registerDevice,
  registerProperty,
} from "./skills/provisioning.js";

/** Simulate an RTU5024 replying to add/remove/query SMS commands. */
function fakeRtu(_to: string, body: string): string {
  if (body.includes("AL#")) return "Authorized list: 100:+56911112222";
  if (body.endsWith("##")) return "Delete success";
  return "Add success";
}

async function main(): Promise<void> {
  const store = new InMemoryDataStore();
  const sms = new FakeSmsGateway(fakeRtu);
  const scheduler = new InMemoryScheduler();
  const notifier = new ConsoleNotifier();
  const ctx = makeContext({ store, sms, scheduler, notifier });

  // 1. Admin provisions a condominium with one property and an RTU device.
  const condo = await registerCondominium(ctx, { nombre: "Condominio Las Encinas" });
  const property = await registerProperty(ctx, { condominio_id: condo.id, numero: "12" });
  const device = await registerDevice(ctx, {
    condominio_id: condo.id,
    numero_sim: "+56922223333",
  });
  console.log(`Provisioned condo=${condo.id} property=${property.numero} device.sim=${device.numero_sim}`);

  // 2. Resident creates a 2-hour invitation starting now.
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  let invitation = await createInvitation(ctx, {
    propiedad_id: property.id,
    visitante_nombre: "Juan Visitante",
    visitante_telefono: "9 1111 2222",
    fecha_inicio: now.toISOString(),
    fecha_fin: end.toISOString(),
  });
  console.log(`Created invitation ${invitation.id} estado=${invitation.estado}`);

  // 3. Scheduler tick at start -> activation -> RTU add -> ACTIVE.
  await tick(ctx, now);
  invitation = (await store.invitations.get(invitation.id))!;
  console.log(`After activation tick: estado=${invitation.estado} slot=${invitation.rtu_slot}`);

  // 4. Scheduler tick at window end -> expiration -> RTU remove -> REMOVED.
  await tick(ctx, new Date(end.getTime() + 1000));
  invitation = (await store.invitations.get(invitation.id))!;
  console.log(`After expiration tick: estado=${invitation.estado} slot=${invitation.rtu_slot}`);

  // 5. Inspect what the device actually received and the audit trail.
  console.log("\nSMS sent to device (RTU commands):");
  for (const m of sms.outbox) console.log(`  -> ${m.to}: ${m.body}`);

  console.log("\nAudit trail (bitacora):");
  const events = await store.events.listForEntity(invitation.id, 100);
  for (const e of [...events].reverse()) console.log(`  ${e.fecha}  ${e.tipo}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
