import assert from "node:assert/strict";
import { test } from "node:test";

import { ConsoleNotifier } from "./mcp/notifications/console.js";
import { FakeSmsGateway } from "./mcp/sms_gateway/fake.js";
import { InMemoryScheduler } from "./mcp/scheduler/in_memory.js";
import { InMemoryDataStore } from "./mcp/supabase/in_memory.js";
import {
  confirmInFlightPermanent,
  syncAddPermanent,
  syncRemovePermanent,
} from "./orchestration/permanent_access_sync.js";
import { RTU_ACK_TIMEOUT_MS } from "./shared/constants.js";
import { ResidentStatus, ResidentTipo } from "./shared/enums.js";
import { makeContext, type SkillContext } from "./skills/context.js";
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

async function setup(
  replyFn: (to: string, body: string) => string | null = fakeRtu,
): Promise<{ ctx: SkillContext; store: InMemoryDataStore; propertyId: string }> {
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
  return { ctx, store, propertyId: property.id };
}

async function makeFamiliar(store: InMemoryDataStore, propiedadId: string, telefono: string) {
  return store.residents.create({
    propiedad_id: propiedadId,
    nombre: "Familiar",
    telefono,
    tipo: ResidentTipo.FAMILIAR,
  });
}

test("happy path: add -> confirm reaches ACTIVE on slot 1", async () => {
  const { ctx, store, propertyId } = await setup();
  const familiar = await makeFamiliar(store, propertyId, "+56911110001");

  const active = await syncAddPermanent(ctx, familiar.id);
  assert.equal(active.estado, ResidentStatus.ACTIVE);
  assert.equal(active.rtu_slot, 1); // RESIDENT_SLOT_START, not the invitation range
});

test("failed add lands the resident in ERROR with attempts counted", async () => {
  const { ctx, store, propertyId } = await setup(() => "ERROR: wrong password");
  const familiar = await makeFamiliar(store, propertyId, "+56911110002");

  const errored = await syncAddPermanent(ctx, familiar.id);
  assert.equal(errored.estado, ResidentStatus.ERROR);
  assert.ok(errored.sync_attempts >= 1);
  assert.ok(errored.last_error?.includes("RTU add failed"));
});

test("a device that never replies times out into ERROR after the ack window", async () => {
  const { ctx, store, propertyId } = await setup(() => null);
  const familiar = await makeFamiliar(store, propertyId, "+56911110003");

  const inFlight = await syncAddPermanent(ctx, familiar.id);
  assert.equal(inFlight.estado, ResidentStatus.PENDING_SYNC);

  await confirmInFlightPermanent(
    ctx,
    new Date(Date.now() + RTU_ACK_TIMEOUT_MS + 1000),
  );
  const after = await store.residents.get(familiar.id);
  assert.equal(after!.estado, ResidentStatus.ERROR);
  assert.match(after!.last_error ?? "", /not confirmed/);
});

test("removal reaches REMOVED and frees the slot for reuse", async () => {
  const { ctx, store, propertyId } = await setup();
  const familiar = await makeFamiliar(store, propertyId, "+56911110004");
  const active = await syncAddPermanent(ctx, familiar.id);
  assert.equal(active.rtu_slot, 1);

  const removed = await syncRemovePermanent(ctx, familiar.id);
  assert.equal(removed.estado, ResidentStatus.REMOVED);
  assert.equal(removed.rtu_slot, null);

  const second = await makeFamiliar(store, propertyId, "+56911110005");
  const secondActive = await syncAddPermanent(ctx, second.id);
  assert.equal(secondActive.rtu_slot, 1); // slot 1 reused now that it's free
});

test("concurrent family members get distinct slots on the same device", async () => {
  const { ctx, store, propertyId } = await setup();
  const a = await makeFamiliar(store, propertyId, "+56911110006");
  const b = await makeFamiliar(store, propertyId, "+56911110007");

  const activeA = await syncAddPermanent(ctx, a.id);
  const activeB = await syncAddPermanent(ctx, b.id);
  assert.notEqual(activeA.rtu_slot, activeB.rtu_slot);
});

test("permanent slots (1-99) never collide with invitation slots (100-200)", async () => {
  const { ctx, store, propertyId } = await setup();
  const familiar = await makeFamiliar(store, propertyId, "+56911110008");
  const active = await syncAddPermanent(ctx, familiar.id);
  assert.ok(active.rtu_slot! < 100);
});

test("removal of an unsynced resident closes out without an SMS round-trip", async () => {
  const { ctx, store, propertyId } = await setup();
  const familiar = await makeFamiliar(store, propertyId, "+56911110009");
  // Never synced (still PENDING_SYNC by default per in_memory create) — remove
  // immediately, closeOut should short-circuit without ever calling the gateway.
  const removed = await syncRemovePermanent(ctx, familiar.id);
  assert.equal(removed.estado, ResidentStatus.REMOVED);
});
