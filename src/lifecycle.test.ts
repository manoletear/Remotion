import assert from "node:assert/strict";
import { test } from "node:test";

import { canTransition } from "./domain/invitation/index.js";
import { ConsoleNotifier } from "./mcp/notifications/console.js";
import { FakeSmsGateway } from "./mcp/sms_gateway/fake.js";
import { InMemoryScheduler } from "./mcp/scheduler/in_memory.js";
import { InMemoryDataStore } from "./mcp/supabase/in_memory.js";
import { tick } from "./orchestration/invitation_lifecycle.js";
import { reconcileDevicePhonebook } from "./orchestration/phonebook_audit.js";
import { RTU_ACK_TIMEOUT_MS } from "./shared/constants.js";
import { EventType, InvitationStatus } from "./shared/enums.js";
import { normalizePhone } from "./shared/utils.js";
import { cancelInvitation } from "./skills/cancel_invitation.js";
import { makeContext, type SkillContext } from "./skills/context.js";
import { createInvitation } from "./skills/create_invitation.js";
import { expireInvitation } from "./skills/expire_invitation.js";
import { buildAddUserCommand } from "./skills/rtu/protocol.js";
import { rtuAddUser } from "./skills/rtu_add_user.js";
import {
  registerCondominium,
  registerDevice,
  registerProperty,
  registerResident,
  updateResident,
} from "./skills/provisioning.js";

function fakeRtu(_to: string, body: string): string {
  if (body.includes("AL#")) return "list: 100:+56911112222";
  if (body.endsWith("##")) return "Delete success";
  return "Add success";
}

async function setup(
  replyFn: (to: string, body: string) => string | null = fakeRtu,
): Promise<{
  ctx: SkillContext;
  sms: FakeSmsGateway;
  store: InMemoryDataStore;
  propertyId: string;
}> {
  const store = new InMemoryDataStore();
  const sms = new FakeSmsGateway(replyFn);
  const ctx = makeContext({
    store,
    sms,
    scheduler: new InMemoryScheduler(),
    notifier: new ConsoleNotifier(),
  });
  const condo = await registerCondominium(ctx, { nombre: "Test" });
  const property = await registerProperty(ctx, { condominio_id: condo.id, numero: "1" });
  await registerDevice(ctx, { condominio_id: condo.id, numero_sim: "+56922223333" });
  return { ctx, sms, store, propertyId: property.id };
}

function window(): { fecha_inicio: string; fecha_fin: string; start: Date; end: Date } {
  const start = new Date();
  const end = new Date(start.getTime() + 3_600_000);
  return { fecha_inicio: start.toISOString(), fecha_fin: end.toISOString(), start, end };
}

test("normalizePhone coerces local numbers to E.164", () => {
  assert.equal(normalizePhone("9 1111 2222"), "+56911112222");
  assert.equal(normalizePhone("+56911112222"), "+56911112222");
  assert.equal(normalizePhone("0056911112222"), "+56911112222");
  assert.equal(normalizePhone("abc"), null);
});

test("state machine forbids illegal transitions", () => {
  assert.ok(canTransition(InvitationStatus.CREATED, InvitationStatus.PENDING_SYNC));
  assert.ok(canTransition(InvitationStatus.ACTIVE, InvitationStatus.REMOVING));
  assert.ok(!canTransition(InvitationStatus.REMOVED, InvitationStatus.ACTIVE));
  assert.ok(!canTransition(InvitationStatus.CREATED, InvitationStatus.ACTIVE));
});

test("happy path: create -> activate -> expire reaches REMOVED", async () => {
  const { ctx, store, sms, propertyId } = await setup();
  const w = window();
  const inv = await createInvitation(ctx, {
    propiedad_id: propertyId,
    visitante_nombre: "Visitor",
    visitante_telefono: "9 1111 2222",
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
  });
  assert.equal(inv.estado, InvitationStatus.CREATED);

  await tick(ctx, w.start);
  const active = (await store.invitations.get(inv.id))!;
  assert.equal(active.estado, InvitationStatus.ACTIVE);
  assert.equal(active.rtu_slot, 100);

  await tick(ctx, new Date(w.end.getTime() + 1000));
  const removed = (await store.invitations.get(inv.id))!;
  assert.equal(removed.estado, InvitationStatus.REMOVED);
  assert.equal(removed.rtu_slot, null);

  // The visitor was notified on activation (WhatsApp).
  assert.ok(
    (ctx.notifier as ConsoleNotifier).sent.some(
      (m) => m.channel === "WHATSAPP" && m.to === "+56911112222",
    ),
  );

  // One add command, one remove command went to the device.
  assert.equal(sms.outbox.length, 2);
  // RTU5024 expects the phone without a leading '+' on the wire (see protocol.ts).
  assert.match(sms.outbox[0]!.body, /^1234A100#56911112222#$/);
  assert.match(sms.outbox[1]!.body, /^1234A100##$/);
});

test("failed RTU add lands invitation in ERROR with attempts counted", async () => {
  const { ctx, store, propertyId } = await setup(() => "ERROR: wrong password");
  const w = window();
  const inv = await createInvitation(ctx, {
    propiedad_id: propertyId,
    visitante_nombre: "Visitor",
    visitante_telefono: "+56911112222",
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
  });
  await tick(ctx, w.start);
  const errored = (await store.invitations.get(inv.id))!;
  assert.equal(errored.estado, InvitationStatus.ERROR);
  assert.ok(errored.sync_attempts >= 1);
  assert.ok(errored.last_error?.includes("RTU add failed"));
});

test("cancel before activation closes out without touching device", async () => {
  const { ctx, store, sms, propertyId } = await setup();
  const w = window();
  const inv = await createInvitation(ctx, {
    propiedad_id: propertyId,
    visitante_nombre: "Visitor",
    visitante_telefono: "+56911112222",
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
  });
  const cancelled = await cancelInvitation(ctx, inv.id);
  assert.equal(cancelled.estado, InvitationStatus.REMOVED);
  assert.equal(sms.outbox.length, 0); // never loaded -> no SMS
});

test("failed add schedules a RETRY that later recovers to ACTIVE", async () => {
  let healthy = false;
  const reply = (_to: string, body: string): string => {
    if (body.includes("AL#")) return "list: 100:+56911112222";
    if (body.endsWith("##")) return "Delete success";
    return healthy ? "Add success" : "ERROR: device unreachable";
  };
  const { ctx, store, propertyId } = await setup(reply);
  const w = window();
  const inv = await createInvitation(ctx, {
    propiedad_id: propertyId,
    visitante_nombre: "Visitor",
    visitante_telefono: "+56911112222",
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
  });

  await tick(ctx, w.start); // activation fails -> ERROR + scheduled RETRY
  assert.equal((await store.invitations.get(inv.id))!.estado, InvitationStatus.ERROR);

  healthy = true; // device recovers
  const retryAt = new Date(w.start.getTime() + 6 * 60_000); // past the 5-min RETRY delay
  await tick(ctx, retryAt);

  const recovered = (await store.invitations.get(inv.id))!;
  assert.equal(recovered.estado, InvitationStatus.ACTIVE);
  assert.equal(recovered.rtu_slot, 100);
});

test("a device that never replies times out into ERROR after the ack window", async () => {
  // Device accepts nothing back (no reply) -> the add stays in-flight until the
  // ack window elapses, then the confirm sweep times it out.
  const { ctx, store, propertyId } = await setup(() => null);
  const w = window();
  const inv = await createInvitation(ctx, {
    propiedad_id: propertyId,
    visitante_nombre: "Visitor",
    visitante_telefono: "+56911112222",
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
  });

  await tick(ctx, w.start); // dispatched, no reply -> still PENDING_SYNC
  assert.equal((await store.invitations.get(inv.id))!.estado, InvitationStatus.PENDING_SYNC);

  // A later tick, past the ack window, times the in-flight add out.
  await tick(ctx, new Date(w.start.getTime() + RTU_ACK_TIMEOUT_MS + 1000));
  const after = (await store.invitations.get(inv.id))!;
  assert.equal(after.estado, InvitationStatus.ERROR);
  assert.match(after.last_error ?? "", /not confirmed/);
});

test("cancellation whose removal fails retries toward removal, never re-adds", async () => {
  let removeOk = false;
  const reply = (_to: string, body: string): string => {
    if (body.includes("AL#")) return "list: 100:+56911112222";
    if (body.endsWith("##")) return removeOk ? "Delete success" : "ERROR";
    return "Add success";
  };
  const { ctx, store, sms, propertyId } = await setup(reply);
  const w = window();
  const inv = await createInvitation(ctx, {
    propiedad_id: propertyId,
    visitante_nombre: "Visitor",
    visitante_telefono: "+56911112222",
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
  });
  await tick(ctx, w.start); // ACTIVE on slot 100

  await cancelInvitation(ctx, inv.id); // removal fails -> ERROR, cancelled=true
  const errored = (await store.invitations.get(inv.id))!;
  assert.equal(errored.estado, InvitationStatus.ERROR);
  assert.equal(errored.cancelled, true);

  removeOk = true;
  await tick(ctx, new Date(w.start.getTime() + 6 * 60_000)); // RETRY -> removal
  const removed = (await store.invitations.get(inv.id))!;
  assert.equal(removed.estado, InvitationStatus.REMOVED);

  // Exactly one add command was ever sent; the retry re-drove removal, not add.
  const addCommands = sms.outbox.filter(
    (m) => !m.body.includes("AL#") && !m.body.endsWith("##"),
  );
  assert.equal(addCommands.length, 1);
});

test("RTU command builder rejects passwords with protocol delimiters", () => {
  assert.throws(() => buildAddUserCommand("12#4", 100, "+56911112222"), /RTU password/);
  assert.throws(() => buildAddUserCommand("A234", 100, "+56911112222"), /RTU password/);
  assert.equal(buildAddUserCommand("1234", 100, "+56911112222"), "1234A100#56911112222#");
});

test("devices.getBySimNumber finds a device by its SIM and misses otherwise", async () => {
  const { store, propertyId } = await setup();
  const device = (await store.devices.getForProperty(propertyId))!;
  assert.deepEqual(await store.devices.getBySimNumber(device.numero_sim), device);
  assert.equal(await store.devices.getBySimNumber("+56900000000"), null);
});

test("rtuAddUser rejects a non-E.164 phone", async () => {
  const { ctx, store, propertyId } = await setup();
  const device = (await store.devices.getForProperty(propertyId))!;
  await assert.rejects(rtuAddUser(ctx, { device, phone: "12345", slot: 100 }), /Invalid phone/);
});

test("expireInvitation is idempotent", async () => {
  const { ctx, store, propertyId } = await setup();
  const w = window();
  const inv = await createInvitation(ctx, {
    propiedad_id: propertyId,
    visitante_nombre: "Visitor",
    visitante_telefono: "+56911112222",
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
  });
  await tick(ctx, w.start); // ACTIVE
  const first = await expireInvitation(ctx, inv.id);
  assert.equal(first.estado, InvitationStatus.REMOVED);
  const second = await expireInvitation(ctx, inv.id); // no throw, still REMOVED
  assert.equal(second.estado, InvitationStatus.REMOVED);
  // No INVITATION_EXPIRED duplicate: exactly one in the audit trail.
  const events = await store.events.listForEntity(inv.id, 100);
  const expiredCount = events.filter((e) => e.tipo === "INVITATION_EXPIRED").length;
  assert.equal(expiredCount, 1);
});

test("updateResident changes fields and emits USER_UPDATED", async () => {
  const { ctx, store, propertyId } = await setup();
  const r = await registerResident(ctx, {
    propiedad_id: propertyId,
    nombre: "Ana",
    telefono: "+56911110000",
  });
  const updated = await updateResident(ctx, {
    id: r.id,
    nombre: "Ana Pérez",
    telefono: "9 2222 3333",
  });
  assert.equal(updated.nombre, "Ana Pérez");
  assert.equal(updated.telefono, "+56922223333");
  const events = await store.events.listForEntity(r.id, 50);
  assert.ok(events.some((e) => e.tipo === "USER_UPDATED"));
});

test("concurrent active invitations get distinct device slots", async () => {
  const { ctx, store, propertyId } = await setup();
  const w = window();
  const common = { fecha_inicio: w.fecha_inicio, fecha_fin: w.fecha_fin, propiedad_id: propertyId };
  const a = await createInvitation(ctx, { ...common, visitante_nombre: "A", visitante_telefono: "+56911110001" });
  const b = await createInvitation(ctx, { ...common, visitante_nombre: "B", visitante_telefono: "+56911110002" });

  await tick(ctx, w.start); // both activations due in the same tick

  const ia = (await store.invitations.get(a.id))!;
  const ib = (await store.invitations.get(b.id))!;
  assert.equal(ia.estado, InvitationStatus.ACTIVE);
  assert.equal(ib.estado, InvitationStatus.ACTIVE);
  assert.equal(ia.dispositivo_id, ib.dispositivo_id); // same device
  assert.notEqual(ia.rtu_slot, ib.rtu_slot); // distinct slots
});

test("invalid validity window is rejected", async () => {
  const { ctx, propertyId } = await setup();
  await assert.rejects(
    createInvitation(ctx, {
      propiedad_id: propertyId,
      visitante_nombre: "Visitor",
      visitante_telefono: "+56911112222",
      fecha_inicio: new Date(Date.now() + 3_600_000).toISOString(),
      fecha_fin: new Date().toISOString(),
    }),
    /validity window/i,
  );
});

test("phonebook audit flags unexplained device numbers as RTU_SECURITY_RISK", async () => {
  const { ctx, store, propertyId } = await setup();
  const device = (await store.devices.getForProperty(propertyId))!;

  // A permanent resident and an active visitor — both legitimately authorized.
  await registerResident(ctx, {
    propiedad_id: propertyId,
    nombre: "Resident",
    telefono: "+56911110000",
  });
  const w = window();
  const inv = await createInvitation(ctx, {
    propiedad_id: propertyId,
    visitante_nombre: "Visitor",
    visitante_telefono: "+56911112222",
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
  });
  await tick(ctx, w.start); // visitor ACTIVE on the device

  // The device reports an extra number nobody created through the app.
  const orphan = "+56999998888";
  const orphans = await reconcileDevicePhonebook(ctx, device, [
    "+56911110000", // resident
    "+56911112222", // active visitor
    orphan,
  ]);

  assert.deepEqual(orphans, [orphan]);

  const risks = (await store.events.listForEntity(device.id)).filter(
    (e) => e.tipo === EventType.RTU_SECURITY_RISK,
  );
  assert.equal(risks.length, 1);
  assert.equal(risks[0]!.payload.phone, orphan);

  // The flag does NOT remove the legitimate visitor.
  assert.equal((await store.invitations.get(inv.id))!.estado, InvitationStatus.ACTIVE);
});
