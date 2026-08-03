import assert from "node:assert/strict";
import { test } from "node:test";

import { ConsoleNotifier } from "./mcp/notifications/console.js";
import { FakeSmsGateway } from "./mcp/sms_gateway/fake.js";
import { InMemoryScheduler } from "./mcp/scheduler/in_memory.js";
import { InMemoryDataStore } from "./mcp/supabase/in_memory.js";
import { ResidentStatus } from "./shared/enums.js";
import { makeContext, type SkillContext } from "./skills/context.js";
import { claimInvitation } from "./skills/onboarding/claim_invitation.js";
import { inviteOwner } from "./skills/onboarding/invite_owner.js";
import {
  registerCondominium,
  registerDevice,
  registerProperty,
} from "./skills/provisioning.js";

function fakeRtu(_to: string, body: string): string {
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

/** Pulls the raw claim token out of the ConsoleNotifier's recorded message —
 *  the only place the raw token exists once `inviteOwner` returns. */
function extractToken(ctx: SkillContext): string {
  const notifier = ctx.notifier as ConsoleNotifier;
  const last = notifier.sent[notifier.sent.length - 1]!;
  const match = /\/reclamar\/(\S+)$/.exec(last.body);
  assert.ok(match, "expected a claim URL in the notification body");
  return match![1]!;
}

test("inviteOwner creates a pending owner with real gate access and sends a claim link", async () => {
  const { ctx, propertyId } = await setup();
  const result = await inviteOwner(ctx, "admin-1", {
    propiedad_id: propertyId,
    nombre: "Nueva Propietaria",
    telefono: "+56911119001",
    email: "owner@example.com",
    claimBaseUrl: "https://condogate-ten.vercel.app/reclamar",
  });
  assert.ok("invitationId" in result);

  const resident = await ctx.store.residents.findByPhone("+56911119001");
  assert.ok(resident);
  assert.equal(resident!.estado, ResidentStatus.ACTIVE);
  assert.ok(resident!.rtu_slot !== null);
});

test("inviteOwner + claimInvitation links the auth account with no manual step", async () => {
  const { ctx, propertyId } = await setup();
  await inviteOwner(ctx, "admin-1", {
    propiedad_id: propertyId,
    nombre: "Nueva Propietaria",
    telefono: "+56911119002",
    email: null,
    claimBaseUrl: "https://condogate-ten.vercel.app/reclamar",
  });
  const token = extractToken(ctx);

  const claimed = await claimInvitation(ctx, token, "auth-user-1");
  assert.ok("residentId" in claimed);
  assert.ok(await ctx.store.profiles.isLinked((claimed as { residentId: string }).residentId));
});

test("inviteOwner no-ops without revealing an already-claimed contact (FR-012)", async () => {
  const { ctx, propertyId } = await setup();
  await inviteOwner(ctx, "admin-1", {
    propiedad_id: propertyId,
    nombre: "Ya Registrada",
    telefono: "+56911119003",
    email: null,
    claimBaseUrl: "https://condogate-ten.vercel.app/reclamar",
  });
  const token = extractToken(ctx);
  await claimInvitation(ctx, token, "auth-user-2");

  const before = (await ctx.store.residents.findByPhone("+56911119003"))!.id;
  const second = await inviteOwner(ctx, "admin-1", {
    propiedad_id: propertyId,
    nombre: "Ya Registrada",
    telefono: "+56911119003",
    email: null,
    claimBaseUrl: "https://condogate-ten.vercel.app/reclamar",
  });
  assert.deepEqual(second, { skipped: true });
  const after = (await ctx.store.residents.findByPhone("+56911119003"))!.id;
  assert.equal(before, after, "no second resident should have been created");
});

test("claimInvitation rejects an unknown token", async () => {
  const { ctx } = await setup();
  const result = await claimInvitation(ctx, "not-a-real-token", "auth-user-3");
  assert.deepEqual(result, { error: "not_found" });
});

test("claimInvitation rejects a link already used (US2)", async () => {
  const { ctx, propertyId } = await setup();
  await inviteOwner(ctx, "admin-1", {
    propiedad_id: propertyId,
    nombre: "Owner",
    telefono: "+56911119004",
    email: null,
    claimBaseUrl: "https://condogate-ten.vercel.app/reclamar",
  });
  const token = extractToken(ctx);
  await claimInvitation(ctx, token, "auth-user-4");

  const second = await claimInvitation(ctx, token, "auth-user-5");
  assert.deepEqual(second, { error: "already_used" });
});

test("claimInvitation rejects an expired link (US2)", async () => {
  const { ctx, propertyId } = await setup();
  await inviteOwner(ctx, "admin-1", {
    propiedad_id: propertyId,
    nombre: "Owner",
    telefono: "+56911119005",
    email: null,
    claimBaseUrl: "https://condogate-ten.vercel.app/reclamar",
  });
  const token = extractToken(ctx);

  const eightDaysLater = new Date(ctx.now().getTime() + 8 * 24 * 60 * 60_000);
  const futureCtx = makeContext({ ...ctx, now: () => eightDaysLater });
  const result = await claimInvitation(futureCtx, token, "auth-user-6");
  assert.deepEqual(result, { error: "expired" });
});

test("re-inviting a still-pending owner invalidates the previous link (US2 Scenario 3)", async () => {
  const { ctx, propertyId } = await setup();
  await inviteOwner(ctx, "admin-1", {
    propiedad_id: propertyId,
    nombre: "Owner",
    telefono: "+56911119006",
    email: null,
    claimBaseUrl: "https://condogate-ten.vercel.app/reclamar",
  });
  const firstToken = extractToken(ctx);

  await inviteOwner(ctx, "admin-1", {
    propiedad_id: propertyId,
    nombre: "Owner",
    telefono: "+56911119006",
    email: null,
    claimBaseUrl: "https://condogate-ten.vercel.app/reclamar",
  });
  const secondToken = extractToken(ctx);

  const staleAttempt = await claimInvitation(ctx, firstToken, "auth-user-7");
  assert.deepEqual(staleAttempt, { error: "already_used" });

  const freshAttempt = await claimInvitation(ctx, secondToken, "auth-user-8");
  assert.ok("residentId" in freshAttempt);
});
