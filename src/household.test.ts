import assert from "node:assert/strict";
import { test } from "node:test";

import { ConsoleNotifier } from "./mcp/notifications/console.js";
import { FakeSmsGateway } from "./mcp/sms_gateway/fake.js";
import { InMemoryScheduler } from "./mcp/scheduler/in_memory.js";
import { InMemoryDataStore } from "./mcp/supabase/in_memory.js";
import { ResidentStatus } from "./shared/enums.js";
import { makeContext, type SkillContext } from "./skills/context.js";
import { addEmployee } from "./skills/household/add_employee.js";
import { addFamilyMember } from "./skills/household/add_family_member.js";
import { removeHouseholdMember } from "./skills/household/remove_household_member.js";
import { addPet } from "./skills/pets/add_pet.js";
import { removePet } from "./skills/pets/remove_pet.js";
import {
  registerCondominium,
  registerDevice,
  registerProperty,
  registerResident,
} from "./skills/provisioning.js";

function fakeRtu(_to: string, body: string): string {
  if (body.includes("AL#")) return "list: 100:+56911112222";
  if (body.endsWith("##")) return "Delete success";
  return "Add success";
}

async function setup(): Promise<{ ctx: SkillContext; propertyId: string }> {
  const store = new InMemoryDataStore();
  const sms = new FakeSmsGateway(fakeRtu);
  const ctx = makeContext({
    store,
    sms,
    scheduler: new InMemoryScheduler(),
    notifier: new ConsoleNotifier(),
  });
  const condo = await registerCondominium(ctx, { nombre: "Test" });
  const property = await registerProperty(ctx, { condominio_id: condo.id, numero: "1" });
  await registerDevice(ctx, { condominio_id: condo.id, numero_sim: "+56922223333" });
  return { ctx, propertyId: property.id };
}

test("addFamilyMember grants real permanent access", async () => {
  const { ctx, propertyId } = await setup();
  const familiar = await addFamilyMember(ctx, {
    propiedad_id: propertyId,
    nombre: "Ana",
    telefono: "+56911110001",
  });
  assert.equal(familiar.estado, ResidentStatus.ACTIVE);
  assert.ok(familiar.rtu_slot !== null);
});

test("addFamilyMember rejects a phone already registered on the property", async () => {
  const { ctx, propertyId } = await setup();
  await addFamilyMember(ctx, {
    propiedad_id: propertyId,
    nombre: "Ana",
    telefono: "+56911110002",
  });
  await assert.rejects(
    addFamilyMember(ctx, {
      propiedad_id: propertyId,
      nombre: "Otra Ana",
      telefono: "+56911110002",
    }),
    /Duplicate phone/,
  );
});

test("addEmployee rejects an invalid RUT before saving anything", async () => {
  const { ctx, propertyId } = await setup();
  await assert.rejects(
    addEmployee(ctx, {
      propiedad_id: propertyId,
      nombre: "Juan",
      telefono: "+56911110003",
      rut: "12345678-6", // wrong check digit
    }),
    /Invalid employee/,
  );
});

test("addEmployee accepts a valid RUT and plate, grants access", async () => {
  const { ctx, propertyId } = await setup();
  const empleado = await addEmployee(ctx, {
    propiedad_id: propertyId,
    nombre: "Juan",
    telefono: "+56911110004",
    rut: "12345678-5",
    patente: "ABCD12",
  });
  assert.equal(empleado.rut, "12345678-5");
  assert.equal(empleado.patente, "ABCD12");
  assert.equal(empleado.estado, ResidentStatus.ACTIVE);
});

test("removeHouseholdMember refuses to remove the primary resident", async () => {
  const { ctx, propertyId } = await setup();
  const primary = await registerResident(ctx, {
    propiedad_id: propertyId,
    nombre: "Primary",
    telefono: "+56911110005",
  });
  await assert.rejects(removeHouseholdMember(ctx, primary.id), /primary resident/);
});

test("removeHouseholdMember revokes a family member's access and frees the slot", async () => {
  const { ctx, propertyId } = await setup();
  const familiar = await addFamilyMember(ctx, {
    propiedad_id: propertyId,
    nombre: "Ana",
    telefono: "+56911110006",
  });
  const removed = await removeHouseholdMember(ctx, familiar.id);
  assert.equal(removed.estado, ResidentStatus.REMOVED);
  assert.equal(removed.rtu_slot, null);
});

test("addPet/removePet never touch the SMS gateway", async () => {
  const { ctx, propertyId } = await setup();
  const store = ctx.store;
  const sms = ctx.sms as FakeSmsGateway;
  const before = sms.outbox.length;

  const pet = await addPet(ctx, { propiedad_id: propertyId, nombre: "Firulais" });
  assert.equal(pet.foto_path, null);
  assert.equal(sms.outbox.length, before);

  const removed = await removePet(ctx, pet.id);
  assert.equal(removed.id, pet.id);
  assert.equal(await store.pets.get(pet.id), null);
  assert.equal(sms.outbox.length, before);
});
