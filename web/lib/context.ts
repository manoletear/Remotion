import {
  ConsoleNotifier,
  FakeSmsGateway,
  InMemoryDataStore,
  InMemoryScheduler,
  makeContext,
  registerCondominium,
  registerDevice,
  registerProperty,
  registerResident,
  type SkillContext,
} from "gsm-gate-access-layer";

/**
 * Server-side context factory for the resident web app.
 *
 * P0-M0: wired against the in-memory / fake adapters so the UI works end-to-end
 * with zero external services. The ONLY thing that changes to go "Supabase real"
 * is this factory (swap InMemoryDataStore -> SupabaseDataStore, FakeSmsGateway ->
 * TwilioSmsGateway, InMemoryScheduler -> SupabaseScheduler). Everything above —
 * pages, server actions, skills — stays identical.
 *
 * DEV-ONLY: the in-memory store lives in a single process and does NOT persist
 * across serverless invocations. This factory is for local development/demo; the
 * deploy target is always the Supabase-backed context.
 */
export interface Bootstrap {
  ctx: SkillContext;
  /** The seeded resident's property; stands in for the logged-in session until auth (M2). */
  propertyId: string;
  residentId: string;
}

/** Canned RTU replies so the fake "device" accepts add/remove/list commands. */
function fakeRtu(_to: string, body: string): string {
  if (body.includes("AL#")) return "list: 100:+56911112222";
  if (body.endsWith("##")) return "Delete success";
  return "Add success";
}

async function bootstrap(): Promise<Bootstrap> {
  const ctx = makeContext({
    store: new InMemoryDataStore(),
    sms: new FakeSmsGateway(fakeRtu),
    scheduler: new InMemoryScheduler(),
    notifier: new ConsoleNotifier(),
  });

  const condo = await registerCondominium(ctx, { nombre: "Condominio Demo" });
  const property = await registerProperty(ctx, {
    condominio_id: condo.id,
    numero: "Casa 1",
  });
  await registerDevice(ctx, {
    condominio_id: condo.id,
    numero_sim: "+56922223333",
  });
  const resident = await registerResident(ctx, {
    propiedad_id: property.id,
    nombre: "Residente Demo",
    telefono: "+56911110000",
  });

  return { ctx, propertyId: property.id, residentId: resident.id };
}

// Persist the in-memory bootstrap across hot reloads / requests within the
// running server process (a single shared demo tenant for M0).
const globalForCtx = globalThis as unknown as { __gateBootstrap?: Promise<Bootstrap> };

export function getContext(): Promise<Bootstrap> {
  globalForCtx.__gateBootstrap ??= bootstrap();
  return globalForCtx.__gateBootstrap;
}
