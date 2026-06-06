import assert from "node:assert/strict";
import { test } from "node:test";

import { canTransition } from "./domain/invitation/index.js";
import { ConsoleNotifier } from "./mcp/notifications/console.js";
import { FakeSmsGateway } from "./mcp/sms_gateway/fake.js";
import { InMemoryScheduler } from "./mcp/scheduler/in_memory.js";
import { InMemoryDataStore } from "./mcp/supabase/in_memory.js";
import { tick } from "./orchestration/invitation_lifecycle.js";
import { InvitationStatus } from "./shared/enums.js";
import { normalizePhone } from "./shared/utils.js";
import { cancelInvitation } from "./skills/cancel_invitation.js";
import { makeContext, type SkillContext } from "./skills/context.js";
import { createInvitation } from "./skills/create_invitation.js";
import {
  registerCondominium,
  registerDevice,
  registerProperty,
} from "./skills/provisioning.js";

function fakeRtu(_to: string, body: string): string {
  if (body.includes("AL#")) return "list: 100:+56911112222";
  if (body.endsWith("##")) return "Delete success";
  return "Add success";
}

async function setup(replyFn = fakeRtu): Promise<{
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
    syncRetry: { maxAttempts: 4, baseMs: 1 }, // fast backoff for tests
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

  // One add command, one remove command went to the device.
  assert.equal(sms.outbox.length, 2);
  assert.match(sms.outbox[0]!.body, /^1234A100#\+56911112222#$/);
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
