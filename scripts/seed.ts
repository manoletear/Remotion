/**
 * Admin seed script — provisions a condominium + unit + device + resident
 * and links the resident to a Supabase Auth user (admin seed pattern).
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   tsx scripts/seed.ts \
 *     --email=juan@example.com \
 *     --nombre="Juan" \
 *     --apellido="Pérez" \
 *     --telefono="+56911110000" \
 *     --unidad="Casa 1" \
 *     --condominio="Condominio Vista" \
 *     --sim="+56922223333"
 *
 * Idempotent: re-running with the same email updates the perfil link.
 */

import { createClient } from "@supabase/supabase-js";
import {
  ConsoleNotifier,
  InMemoryScheduler,
  SupabaseDataStore,
  TwilioSmsGateway,
  makeContext,
  registerCondominium,
  registerDevice,
  registerProperty,
  registerResident,
} from "../src/index.js";

function require_env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

function arg(name: string): string {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  if (!found) throw new Error(`Missing argument: --${name}`);
  return found.slice(flag.length);
}

async function main() {
  const email = arg("email");
  const nombre = arg("nombre");
  const apellido = arg("apellido");
  const telefono = arg("telefono");
  const unidad = arg("unidad");
  const condominio = arg("condominio");
  const sim = arg("sim");

  const serviceClient = createClient(
    require_env("SUPABASE_URL"),
    require_env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const ctx = makeContext({
    store: new SupabaseDataStore(serviceClient),
    sms: new TwilioSmsGateway({
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? "placeholder",
      authToken: process.env.TWILIO_AUTH_TOKEN ?? "placeholder",
      from: process.env.TWILIO_FROM ?? "+10000000000",
    }),
    scheduler: new InMemoryScheduler(),
    notifier: new ConsoleNotifier(),
  });

  // 1. Provision infrastructure
  const condo = await registerCondominium(ctx, { nombre: condominio });
  console.log(`Condominio: ${condo.id} — ${condo.nombre}`);

  const property = await registerProperty(ctx, {
    condominio_id: condo.id,
    numero: unidad,
  });
  console.log(`Propiedad: ${property.id} — ${property.numero}`);

  await registerDevice(ctx, { condominio_id: condo.id, numero_sim: sim });
  console.log(`Dispositivo registrado (SIM ${sim})`);

  const resident = await registerResident(ctx, {
    propiedad_id: property.id,
    nombre,
    apellido,
    telefono,
  });
  console.log(`Residente: ${resident.id} — ${resident.nombre} ${resident.apellido ?? ""}`);

  // 2. Create or fetch the auth user
  const { data: existing } = await serviceClient.auth.admin.listUsers();
  let userId = existing?.users.find((u) => u.email === email)?.id;

  if (!userId) {
    const { data: created, error } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error) throw new Error(`Auth user creation failed: ${error.message}`);
    userId = created.user.id;
    console.log(`Auth user creado: ${userId}`);
  } else {
    console.log(`Auth user existente: ${userId}`);
  }

  // 3. Upsert the perfil link
  const { error: perfilError } = await serviceClient
    .from("perfiles")
    .upsert({ id: userId, residente_id: resident.id, rol: "RESIDENT" });

  if (perfilError) throw new Error(`Perfil upsert failed: ${perfilError.message}`);
  console.log(`Perfil vinculado: auth.uid=${userId} → residente=${resident.id}`);

  console.log("\nSeed completado. Envía el magic link con:");
  console.log(
    `  supabase functions invoke send-magic-link --body '{"email":"${email}"}'`,
  );
  console.log("  o desde la UI de Supabase → Authentication → Users → Send magic link");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
