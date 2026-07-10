import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

/**
 * Session-scoped client for server components and server actions.
 * Reads/writes the auth session from the request cookies.
 * RLS enforced — this client sees only what the authenticated user can see.
 */
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cs: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component context — cookies set via middleware instead.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS.
 * Use for: admin seed, scheduler (tick worker), inbound webhook.
 */
export function createServiceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/**
 * `web/` and the `gsm-gate-access-layer` domain package each install their own
 * copy of `@supabase/supabase-js` (there's no npm workspace linking them, so
 * each `npm install` produces an independent `node_modules`). The two
 * `SupabaseClient` classes are structurally identical but nominally distinct
 * to TypeScript (it treats the class's `protected supabaseUrl` field as a
 * different brand per copy). This cast documents that known gap at the
 * package boundary instead of silently suppressing a real type error —
 * the actual fix is converting the repo to npm workspaces so both directories
 * share one hoisted `node_modules` (tracked as a follow-up, not done here to
 * avoid restructuring dependency tooling mid-feature).
 */
export function crossPackageClient<T>(client: object): T {
  return client as unknown as T;
}
